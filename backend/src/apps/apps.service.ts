import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConnectedApp, SourceApp } from '@prisma/client';
import { randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import {
  decryptSecret,
  encryptSecret,
  sha256,
} from '../common/utils/secret-crypto.util';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateConnectedAppDto } from './dto/apps.dto';

export interface DeliveryResult {
  /** false = this app has no callback set up; it will read the decision when it next asks. */
  attempted: boolean;
  ok: boolean;
  error?: string;
}

/**
 * How each app's existing platform API is called to hand back a sender ID
 * decision. Apps without an entry (or without a callback configured) pick
 * decisions up themselves from GET /ingest/....
 */
const SENDER_ID_CALLBACKS: Partial<
  Record<SourceApp, { keyHeader: string; sendsNote: boolean }>
> = {
  [SourceApp.QUALITYSCHOOL]: { keyHeader: 'x-platform-api-key', sendsNote: false },
  [SourceApp.SYNKMART]: { keyHeader: 'x-platform-key', sendsNote: true },
};

const CALLBACK_TIMEOUT_MS = 8000;

@Injectable()
export class AppsService {
  private readonly logger = new Logger(AppsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const apps = await this.prisma.connectedApp.findMany({ orderBy: { name: 'asc' } });
    return apps.map((a) => this.serialize(a));
  }

  async update(actor: AuthenticatedUser, code: SourceApp, dto: UpdateConnectedAppDto) {
    const app = await this.findOrThrow(code);
    const changes: string[] = [];
    const data: {
      isActive?: boolean;
      callbackBaseUrl?: string | null;
      callbackKeyEnc?: string | null;
    } = {};

    if (dto.isActive !== undefined && dto.isActive !== app.isActive) {
      data.isActive = dto.isActive;
      changes.push(dto.isActive ? 'enabled' : 'disabled');
    }
    if (dto.callbackBaseUrl !== undefined) {
      const url = dto.callbackBaseUrl.trim().replace(/\/+$/, '') || null;
      if (url !== app.callbackBaseUrl) {
        data.callbackBaseUrl = url;
        changes.push(url ? `callback URL → ${url}` : 'callback URL removed');
      }
    }
    if (dto.callbackKey !== undefined) {
      const key = dto.callbackKey.trim();
      data.callbackKeyEnc = key ? encryptSecret(key) : null;
      changes.push(key ? 'callback key replaced' : 'callback key removed');
    }

    if (changes.length === 0) return this.serialize(app);

    const updated = await this.prisma.connectedApp.update({ where: { code }, data });
    await this.audit.record({
      actor,
      action: 'app.updated',
      entityType: 'app',
      entityId: code,
      summary: `Updated ${app.name}: ${changes.join(', ')}.`,
    });
    return this.serialize(updated);
  }

  /** Creates a new key for the app to call the portal with. The old key stops working. */
  async rotateInboundKey(actor: AuthenticatedUser, code: SourceApp) {
    const app = await this.findOrThrow(code);
    const key = `dsp_${randomBytes(32).toString('base64url')}`;
    const updated = await this.prisma.connectedApp.update({
      where: { code },
      data: {
        inboundKeyHash: sha256(key),
        inboundKeyHint: `${key.slice(0, 8)}…${key.slice(-4)}`,
        inboundKeySetAt: new Date(),
      },
    });
    await this.audit.record({
      actor,
      action: 'app.key_rotated',
      entityType: 'app',
      entityId: code,
      summary: `Generated a new portal API key for ${app.name}.`,
    });
    return { app: this.serialize(updated), apiKey: key };
  }

  /** Resolves the calling app from its x-portal-api-key. */
  async authenticate(apiKey: string | undefined): Promise<ConnectedApp | null> {
    if (!apiKey || apiKey.length < 20) return null;
    const app = await this.prisma.connectedApp.findUnique({
      where: { inboundKeyHash: sha256(apiKey) },
    });
    if (!app?.isActive) return null;
    void this.prisma.connectedApp
      .update({ where: { id: app.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
    return app;
  }

  /** Tells the source app about a sender ID decision through its platform API. */
  async pushSenderIdDecision(
    code: SourceApp,
    externalId: string,
    approve: boolean,
    note?: string | null,
  ): Promise<DeliveryResult> {
    const spec = SENDER_ID_CALLBACKS[code];
    const app = await this.prisma.connectedApp.findUnique({ where: { code } });
    if (!spec || !app?.callbackBaseUrl || !app.callbackKeyEnc) {
      return { attempted: false, ok: false };
    }

    const url = `${app.callbackBaseUrl}/platform/sender-ids/${encodeURIComponent(
      externalId,
    )}/${approve ? 'approve' : 'reject'}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [spec.keyHeader]: decryptSecret(app.callbackKeyEnc),
        },
        body: JSON.stringify(spec.sendsNote && note ? { note } : {}),
        signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
      });
      if (response.ok) return { attempted: true, ok: true };

      let detail = '';
      try {
        const body = (await response.json()) as { message?: string | string[] };
        detail = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? '');
      } catch {
        // non-JSON error body
      }
      const error = `${app.name} answered ${response.status}${detail ? `: ${detail}` : ''}`;
      this.logger.warn(`Sender ID decision not accepted — ${error}`);
      return { attempted: true, ok: false, error: error.slice(0, 500) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not reach ${app.name}: ${message}`);
      return {
        attempted: true,
        ok: false,
        error: `Could not reach ${app.name}: ${message}`.slice(0, 500),
      };
    }
  }

  /**
   * Calls an app's platform API (the address and key under Connected apps → Connection)
   * and returns its answer. Throws with a message staff can act on.
   */
  async callPlatform<T>(
    code: SourceApp,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const spec = SENDER_ID_CALLBACKS[code];
    const app = await this.findOrThrow(code);
    if (!spec || !app.callbackBaseUrl || !app.callbackKeyEnc) {
      throw new BadRequestException(
        `Set ${app.name}'s API address and platform key under Connected apps → Connection first.`,
      );
    }

    let response: Response;
    try {
      response = await fetch(`${app.callbackBaseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          [spec.keyHeader]: decryptSecret(app.callbackKeyEnc),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not reach ${app.name}: ${message}`);
      throw new BadGatewayException(`Could not reach ${app.name}: ${message}`.slice(0, 500));
    }

    const payload = (await response.json().catch(() => null)) as
      | (T & { message?: string | string[] })
      | null;
    if (!response.ok || payload === null) {
      const detail = Array.isArray(payload?.message) ? payload.message.join(', ') : (payload?.message ?? '');
      throw new BadGatewayException(
        `${app.name} answered ${response.status}${detail ? `: ${detail}` : ''}`.slice(0, 500),
      );
    }
    return payload;
  }

  private async findOrThrow(code: SourceApp): Promise<ConnectedApp> {
    const app = await this.prisma.connectedApp.findUnique({ where: { code } });
    if (!app) throw new NotFoundException('Connected app not found.');
    return app;
  }

  private serialize(app: ConnectedApp) {
    return {
      code: app.code,
      name: app.name,
      isActive: app.isActive,
      inboundKeyHint: app.inboundKeyHint,
      inboundKeySetAt: app.inboundKeySetAt?.toISOString() ?? null,
      callbackBaseUrl: app.callbackBaseUrl,
      callbackKeySet: Boolean(app.callbackKeyEnc),
      supportsCallback: Boolean(SENDER_ID_CALLBACKS[app.code]),
      lastSeenAt: app.lastSeenAt?.toISOString() ?? null,
    };
  }
}
