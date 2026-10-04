import { Injectable } from '@nestjs/common';
import {
  PaymentKind,
  PaymentRequestStatus,
  ReviewStatus,
} from '@prisma/client';
import { Permission } from '../access/permissions';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';

/** Each section is included only if the caller's role may see that queue. */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: AuthenticatedUser) {
    const can = (p: Permission) => user.permissions.includes(p);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [senderIds, subscriptions, topUps, recent] = await Promise.all([
      can(Permission.SENDER_IDS_VIEW) ? this.senderIdStats() : null,
      can(Permission.SUBSCRIPTIONS_VIEW)
        ? this.paymentStats(PaymentKind.SUBSCRIPTION, monthStart)
        : null,
      can(Permission.TOPUPS_VIEW)
        ? this.paymentStats(PaymentKind.SMS_TOPUP, monthStart)
        : null,
      can(Permission.AUDIT_VIEW)
        ? this.prisma.auditLog.findMany({
            where: { NOT: { action: { startsWith: 'auth.' } } },
            orderBy: { createdAt: 'desc' },
            take: 8,
          })
        : null,
    ]);

    return {
      senderIds,
      subscriptions,
      topUps,
      recentActivity:
        recent?.map((r) => ({
          id: r.id,
          actorLabel: r.actorLabel,
          action: r.action,
          summary: r.summary,
          createdAt: r.createdAt.toISOString(),
        })) ?? null,
    };
  }

  private async senderIdStats() {
    const [pending, byApp, oldest, undelivered] = await Promise.all([
      this.prisma.senderIdRequest.count({ where: { status: ReviewStatus.PENDING } }),
      this.prisma.senderIdRequest.groupBy({
        by: ['app'],
        where: { status: ReviewStatus.PENDING },
        _count: true,
      }),
      this.prisma.senderIdRequest.findFirst({
        where: { status: ReviewStatus.PENDING },
        orderBy: { requestedAt: 'asc' },
        select: { requestedAt: true },
      }),
      this.prisma.senderIdRequest.count({ where: { deliveryStatus: 'FAILED' } }),
    ]);
    return {
      pending,
      byApp: Object.fromEntries(byApp.map((b) => [b.app, b._count])),
      oldestPendingAt: oldest?.requestedAt.toISOString() ?? null,
      failedDeliveries: undelivered,
    };
  }

  private async paymentStats(kind: PaymentKind, monthStart: Date) {
    const [awaiting, awaitingSum, unpaid, byApp, oldest, approvedThisMonth] =
      await Promise.all([
        this.prisma.paymentRequest.count({
          where: { kind, status: PaymentRequestStatus.SUBMITTED },
        }),
        this.prisma.paymentRequest.aggregate({
          where: { kind, status: PaymentRequestStatus.SUBMITTED },
          _sum: { amount: true },
        }),
        this.prisma.paymentRequest.count({
          where: { kind, status: PaymentRequestStatus.PENDING },
        }),
        this.prisma.paymentRequest.groupBy({
          by: ['app'],
          where: { kind, status: PaymentRequestStatus.SUBMITTED },
          _count: true,
        }),
        this.prisma.paymentRequest.findFirst({
          where: { kind, status: PaymentRequestStatus.SUBMITTED },
          orderBy: { requestedAt: 'asc' },
          select: { requestedAt: true },
        }),
        this.prisma.paymentRequest.aggregate({
          where: {
            kind,
            status: PaymentRequestStatus.APPROVED,
            reviewedAt: { gte: monthStart },
          },
          _sum: { amount: true },
          _count: true,
        }),
      ]);
    return {
      awaitingReview: awaiting,
      awaitingAmount: Number(awaitingSum._sum.amount ?? 0),
      notYetPaid: unpaid,
      byApp: Object.fromEntries(byApp.map((b) => [b.app, b._count])),
      oldestAwaitingAt: oldest?.requestedAt.toISOString() ?? null,
      approvedThisMonth: approvedThisMonth._count,
      approvedAmountThisMonth: Number(approvedThisMonth._sum.amount ?? 0),
    };
  }
}
