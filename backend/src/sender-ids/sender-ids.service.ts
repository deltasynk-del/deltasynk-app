import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryStatus,
  Prisma,
  ReviewStatus,
  SenderIdRequest,
  SourceApp,
} from '@prisma/client';
import { APP_NAMES } from '../apps/app-names';
import { AppsService } from '../apps/apps.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { enumOrUndefined, paging } from '../common/utils/paging.util';
import { PrismaService } from '../prisma/prisma.service';

type Row = SenderIdRequest & { reviewedBy?: { fullName: string } | null };

@Injectable()
export class SenderIdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apps: AppsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: {
    status?: string;
    app?: string;
    q?: string;
    page?: string;
    pageSize?: string;
  }) {
    const { page, pageSize, skip, take } = paging(query);
    const status = enumOrUndefined(ReviewStatus, query.status);
    const app = enumOrUndefined(SourceApp, query.app);
    const q = query.q?.trim();
    const where: Prisma.SenderIdRequestWhereInput = {
      ...(status ? { status } : {}),
      ...(app ? { app } : {}),
      ...(q
        ? {
            OR: [
              { senderId: { contains: q, mode: 'insensitive' } },
              { tenantName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows, counts] = await Promise.all([
      this.prisma.senderIdRequest.count({ where }),
      this.prisma.senderIdRequest.findMany({
        where,
        // Oldest pending first: the queue is worked front to back.
        orderBy:
          status === ReviewStatus.PENDING ? { requestedAt: 'asc' } : { requestedAt: 'desc' },
        skip,
        take,
        include: { reviewedBy: { select: { fullName: true } } },
      }),
      this.prisma.senderIdRequest.groupBy({ by: ['status'], _count: true }),
    ]);

    return {
      total,
      page,
      pageSize,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      items: rows.map((r) => this.serialize(r)),
    };
  }

  approve(actor: AuthenticatedUser, id: string, note?: string) {
    return this.decide(actor, id, ReviewStatus.APPROVED, note);
  }

  reject(actor: AuthenticatedUser, id: string, note: string) {
    return this.decide(actor, id, ReviewStatus.REJECTED, note);
  }

  private async decide(
    actor: AuthenticatedUser,
    id: string,
    status: ReviewStatus,
    note?: string,
  ) {
    const reviewNote = note?.trim() || null;
    // Claim the row only while it is still pending, so two reviewers cannot both decide it.
    const claimed = await this.prisma.senderIdRequest.updateMany({
      where: { id, status: ReviewStatus.PENDING },
      data: {
        status,
        reviewNote,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        deliveryStatus: DeliveryStatus.PENDING,
        deliveryError: null,
        deliveredAt: null,
      },
    });
    if (claimed.count === 0) {
      const exists = await this.prisma.senderIdRequest.findUnique({ where: { id } });
      if (!exists) throw new NotFoundException('Sender ID request not found.');
      throw new ConflictException('This request has already been reviewed.');
    }

    const row = await this.prisma.senderIdRequest.findUniqueOrThrow({ where: { id } });
    await this.audit.record({
      actor,
      action: status === ReviewStatus.APPROVED ? 'sender_id.approved' : 'sender_id.rejected',
      entityType: 'sender_id',
      entityId: id,
      summary: `${status === ReviewStatus.APPROVED ? 'Approved' : 'Rejected'} sender ID "${row.senderId}" for ${row.tenantName} (${APP_NAMES[row.app]}).`,
      metadata: reviewNote ? { note: reviewNote } : undefined,
    });

    return this.deliver(row);
  }

  /** Re-sends a decision the source app has not received yet. */
  async retryDelivery(actor: AuthenticatedUser, id: string) {
    const row = await this.prisma.senderIdRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Sender ID request not found.');
    if (row.status === ReviewStatus.PENDING) {
      throw new BadRequestException('This request has not been reviewed yet.');
    }
    if (row.deliveryStatus === DeliveryStatus.DELIVERED) {
      throw new BadRequestException('The app already has this decision.');
    }
    await this.audit.record({
      actor,
      action: 'sender_id.delivery_retried',
      entityType: 'sender_id',
      entityId: id,
      summary: `Re-sent the decision on "${row.senderId}" to ${APP_NAMES[row.app]}.`,
    });
    return this.deliver(row);
  }

  private async deliver(row: SenderIdRequest) {
    const result = await this.apps.pushSenderIdDecision(
      row.app,
      row.externalId,
      row.status === ReviewStatus.APPROVED,
      row.reviewNote,
    );
    // No callback configured: stays PENDING until the app asks for the status itself.
    if (!result.attempted) return this.serialize(await this.reload(row.id));

    await this.prisma.senderIdRequest.update({
      where: { id: row.id },
      data: result.ok
        ? {
            deliveryStatus: DeliveryStatus.DELIVERED,
            deliveredAt: new Date(),
            deliveryError: null,
          }
        : { deliveryStatus: DeliveryStatus.FAILED, deliveryError: result.error },
    });
    return this.serialize(await this.reload(row.id));
  }

  private reload(id: string) {
    return this.prisma.senderIdRequest.findUniqueOrThrow({
      where: { id },
      include: { reviewedBy: { select: { fullName: true } } },
    });
  }

  serialize(r: Row) {
    return {
      id: r.id,
      app: r.app,
      externalId: r.externalId,
      senderId: r.senderId,
      purpose: r.purpose,
      tenantName: r.tenantName,
      tenantRef: r.tenantRef,
      tenantPhone: r.tenantPhone,
      requestedByName: r.requestedByName,
      requestedByEmail: r.requestedByEmail,
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedByName: r.reviewedBy?.fullName ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      deliveryStatus: r.deliveryStatus,
      deliveryError: r.deliveryError,
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      requestedAt: r.requestedAt.toISOString(),
    };
  }
}
