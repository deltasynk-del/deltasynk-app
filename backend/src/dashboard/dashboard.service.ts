import { Injectable } from '@nestjs/common';
import {
  PaymentKind,
  PaymentRequestStatus,
  ReviewStatus,
  SourceApp,
} from '@prisma/client';
import { Permission } from '../access/permissions';
import { AppsService } from '../apps/apps.service';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { WebsiteService } from '../website/website.service';

/** Reports follow the Tanzanian calendar (UTC+3, no daylight saving) whatever the server's clock zone. */
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
const INCOME_MONTHS = 12;

const monthKey = (date: Date) => new Date(date.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 7);

/** Start (as a UTC instant) of the Tanzanian month that is `back` months before the current one. */
function monthStart(back: number): Date {
  const now = new Date(Date.now() + EAT_OFFSET_MS);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1) - EAT_OFFSET_MS);
}

export interface Remote<T> {
  data: T | null;
  /** Why the figures are missing (app not connected, unreachable…). */
  error: string | null;
}

/** Each section is included only if the caller's role may see that queue. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apps: AppsService,
    private readonly website: WebsiteService,
  ) {}

  async insights(user: AuthenticatedUser) {
    const can = (p: Permission) => user.permissions.includes(p);
    const [income, subscribers, website] = await Promise.all([
      can(Permission.INCOME_VIEW) ? this.income() : null,
      can(Permission.SUBSCRIPTIONS_VIEW)
        ? this.remote(() =>
            this.apps.callPlatform<Record<string, unknown>>(
              SourceApp.SYNKMART,
              'GET',
              '/platform/shops/subscriptions/summary',
            ),
          )
        : null,
      can(Permission.WEBSITE_VIEW) || can(Permission.HARDWARE_VIEW)
        ? this.remote(() => this.website.summary())
        : null,
    ]);
    return { income, subscribers, website };
  }

  /** A connected app being down must not take the dashboard with it. */
  private async remote<T>(load: () => Promise<T>): Promise<Remote<T>> {
    try {
      return { data: await load(), error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Could not load.' };
    }
  }

  /**
   * Money received = payments that were verified here or settled by the app's own gateway,
   * counted in the month that happened. Amounts are added as they are; everything is in TZS today.
   */
  private async income() {
    const since = monthStart(INCOME_MONTHS - 1);
    const [rows, allTime] = await Promise.all([
      this.prisma.paymentRequest.findMany({
        where: { status: PaymentRequestStatus.APPROVED, reviewedAt: { gte: since } },
        select: {
          kind: true,
          app: true,
          amount: true,
          planCode: true,
          billingCycle: true,
          reviewedAt: true,
        },
      }),
      this.prisma.paymentRequest.groupBy({
        by: ['kind'],
        where: { status: PaymentRequestStatus.APPROVED },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const months = Array.from({ length: INCOME_MONTHS }, (_, i) => ({
      month: monthKey(monthStart(INCOME_MONTHS - 1 - i)),
      subscriptions: 0,
      subscriptionCount: 0,
      topUps: 0,
      topUpCount: 0,
    }));
    const byMonth = new Map(months.map((m) => [m.month, m]));
    const byApp = new Map<string, { app: string; subscriptions: number; topUps: number }>();
    const byPlan = new Map<
      string,
      { app: string; planCode: string; billingCycle: string; payments: number; amount: number }
    >();

    for (const row of rows) {
      const amount = Number(row.amount);
      const isSubscription = row.kind === PaymentKind.SUBSCRIPTION;
      const month = row.reviewedAt ? byMonth.get(monthKey(row.reviewedAt)) : undefined;
      if (month) {
        if (isSubscription) {
          month.subscriptions += amount;
          month.subscriptionCount += 1;
        } else {
          month.topUps += amount;
          month.topUpCount += 1;
        }
      }

      const app = byApp.get(row.app) ?? { app: row.app, subscriptions: 0, topUps: 0 };
      if (isSubscription) app.subscriptions += amount;
      else app.topUps += amount;
      byApp.set(row.app, app);

      if (isSubscription) {
        const planCode = row.planCode ?? 'Unknown';
        const billingCycle = row.billingCycle ?? '';
        const key = `${row.app}|${planCode}|${billingCycle}`;
        const plan = byPlan.get(key) ?? { app: row.app, planCode, billingCycle, payments: 0, amount: 0 };
        plan.payments += 1;
        plan.amount += amount;
        byPlan.set(key, plan);
      }
    }

    const total = (kind: PaymentKind) => {
      const row = allTime.find((r) => r.kind === kind);
      return { amount: Number(row?._sum.amount ?? 0), payments: row?._count ?? 0 };
    };
    const thisMonth = months[months.length - 1];
    const lastMonth = months[months.length - 2];

    return {
      currency: 'TZS',
      thisMonth,
      lastMonth,
      last12Months: {
        subscriptions: months.reduce((sum, m) => sum + m.subscriptions, 0),
        topUps: months.reduce((sum, m) => sum + m.topUps, 0),
      },
      allTime: {
        subscriptions: total(PaymentKind.SUBSCRIPTION),
        topUps: total(PaymentKind.SMS_TOPUP),
      },
      months,
      byApp: [...byApp.values()].sort(
        (a, b) => b.subscriptions + b.topUps - (a.subscriptions + a.topUps),
      ),
      byPlan: [...byPlan.values()].sort((a, b) => b.amount - a.amount),
    };
  }

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
