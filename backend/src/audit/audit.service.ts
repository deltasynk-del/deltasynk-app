import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actor?: { id: string; fullName: string; email: string } | null;
  /** Used when there is no signed-in user (failed sign-in, an app calling in). */
  actorLabel?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  summary: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Never throws — a failed audit write must not undo the action it describes. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actor?.id ?? null,
          actorLabel: entry.actor
            ? `${entry.actor.fullName} <${entry.actor.email}>`
            : (entry.actorLabel ?? null),
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          summary: entry.summary,
          metadata: entry.metadata,
          ip: entry.ip,
        },
      });
    } catch (err) {
      this.logger.error(`Audit write failed for ${entry.action}: ${String(err)}`);
    }
  }

  async list(query: { page?: number; pageSize?: number; action?: string; actorId?: string }) {
    const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 200);
    const page = Math.max(query.page ?? 1, 1);
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: { startsWith: query.action } } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: rows.map((r) => ({
        id: r.id,
        actorId: r.actorId,
        actorLabel: r.actorLabel,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        summary: r.summary,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
