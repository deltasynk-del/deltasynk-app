import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryStatus,
  PaymentKind,
  PaymentRequest,
  PaymentRequestStatus,
  Prisma,
  SourceApp,
} from '@prisma/client';
import { APP_NAMES } from '../apps/app-names';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { enumOrUndefined, paging } from '../common/utils/paging.util';
import { PrismaService } from '../prisma/prisma.service';

type Row = PaymentRequest & { reviewedBy?: { fullName: string } | null };

const OPEN_STATUSES = [PaymentRequestStatus.PENDING, PaymentRequestStatus.SUBMITTED];

const KIND_LABEL: Record<PaymentKind, string> = {
  SUBSCRIPTION: 'subscription payment',
  SMS_TOPUP: 'SMS top-up',
};

/**
 * Subscription payments and SMS top-ups share one table and one review flow;
 * the controllers differ only in `kind` and in the permission they require.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    kind: PaymentKind,
    query: { status?: string; app?: string; q?: string; page?: string; pageSize?: string },
  ) {
    const { page, pageSize, skip, take } = paging(query);
    const status = enumOrUndefined(PaymentRequestStatus, query.status);
    const app = enumOrUndefined(SourceApp, query.app);
    const q = query.q?.trim();
    const where: Prisma.PaymentRequestWhereInput = {
      kind,
      ...(status ? { status } : {}),
      ...(app ? { app } : {}),
      ...(q
        ? {
            OR: [
              { reference: { contains: q, mode: 'insensitive' } },
              { tenantName: { contains: q, mode: 'insensitive' } },
              { externalReference: { contains: q, mode: 'insensitive' } },
              { payerName: { contains: q, mode: 'insensitive' } },
              { payerPhone: { contains: q } },
            ],
          }
        : {}),
    };

    const [total, rows, counts] = await Promise.all([
      this.prisma.paymentRequest.count({ where }),
      this.prisma.paymentRequest.findMany({
        where,
        orderBy:
          status === PaymentRequestStatus.SUBMITTED
            ? { requestedAt: 'asc' }
            : { requestedAt: 'desc' },
        skip,
        take,
        include: { reviewedBy: { select: { fullName: true } } },
      }),
      this.prisma.paymentRequest.groupBy({ by: ['status'], where: { kind }, _count: true }),
    ]);

    return {
      total,
      page,
      pageSize,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      items: rows.map((r) => this.serialize(r)),
    };
  }

  async verify(actor: AuthenticatedUser, kind: PaymentKind, id: string, note?: string) {
    const existing = await this.findOrThrow(kind, id);
    // Nothing was submitted as proof, so the verifier must record what they checked.
    if (existing.status === PaymentRequestStatus.PENDING && !note?.trim()) {
      throw new BadRequestException(
        'The customer has not submitted a payment reference. Add a note saying how you confirmed the money was received.',
      );
    }
    return this.decide(actor, existing, PaymentRequestStatus.APPROVED, note);
  }

  async reject(actor: AuthenticatedUser, kind: PaymentKind, id: string, note: string) {
    const existing = await this.findOrThrow(kind, id);
    return this.decide(actor, existing, PaymentRequestStatus.REJECTED, note);
  }

  private async decide(
    actor: AuthenticatedUser,
    existing: PaymentRequest,
    status: PaymentRequestStatus,
    note?: string,
  ) {
    const reviewNote = note?.trim() || null;
    // Claim only while still open, so a payment is never verified twice.
    const claimed = await this.prisma.paymentRequest.updateMany({
      where: { id: existing.id, status: { in: OPEN_STATUSES } },
      data: {
        status,
        reviewNote,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        // The app reads the decision from GET /ingest/payments/:reference.
        deliveryStatus: DeliveryStatus.PENDING,
        deliveredAt: null,
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException('This payment has already been reviewed.');
    }

    const approved = status === PaymentRequestStatus.APPROVED;
    await this.audit.record({
      actor,
      action: `${existing.kind === PaymentKind.SUBSCRIPTION ? 'subscription' : 'topup'}.${approved ? 'verified' : 'rejected'}`,
      entityType: 'payment',
      entityId: existing.id,
      summary: `${approved ? 'Verified' : 'Rejected'} ${KIND_LABEL[existing.kind]} ${existing.reference} — ${existing.currency} ${Number(existing.amount).toLocaleString('en-US')}${existing.tenantName ? ` for ${existing.tenantName}` : ''} (${APP_NAMES[existing.app]}).`,
      metadata: {
        amount: Number(existing.amount),
        externalReference: existing.externalReference,
        ...(reviewNote ? { note: reviewNote } : {}),
      },
    });

    const row = await this.prisma.paymentRequest.findUniqueOrThrow({
      where: { id: existing.id },
      include: { reviewedBy: { select: { fullName: true } } },
    });
    return this.serialize(row);
  }

  private async findOrThrow(kind: PaymentKind, id: string): Promise<PaymentRequest> {
    const row = await this.prisma.paymentRequest.findFirst({ where: { id, kind } });
    if (!row) throw new NotFoundException('Payment request not found.');
    return row;
  }

  serialize(r: Row) {
    return {
      id: r.id,
      app: r.app,
      kind: r.kind,
      reference: r.reference,
      tenantName: r.tenantName,
      tenantRef: r.tenantRef,
      planCode: r.planCode,
      billingCycle: r.billingCycle,
      units: r.units,
      amount: Number(r.amount),
      currency: r.currency,
      paymentMethod: r.paymentMethod,
      externalReference: r.externalReference,
      providerReference: r.providerReference,
      payerName: r.payerName,
      payerEmail: r.payerEmail,
      payerPhone: r.payerPhone,
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedByName: r.reviewedBy?.fullName ?? null,
      /** True when the app itself settled it (e.g. Selcom confirmed) — no staff involved. */
      settledByApp: r.status !== 'PENDING' && r.status !== 'SUBMITTED' && !r.reviewedById,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      deliveryStatus: r.deliveryStatus,
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      requestedAt: r.requestedAt.toISOString(),
    };
  }
}
