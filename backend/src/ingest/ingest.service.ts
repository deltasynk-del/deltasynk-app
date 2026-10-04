import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DeliveryStatus,
  PaymentRequest,
  PaymentRequestStatus,
  ReviewStatus,
  SenderIdRequest,
  SourceApp,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IngestPaymentDto, IngestSenderIdDto } from './dto/ingest.dto';

/** What the connected apps send in, and what they read back. Always scoped to the calling app. */
@Injectable()
export class IngestService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Sender IDs -----------------------------------------------------------

  async upsertSenderId(app: SourceApp, dto: IngestSenderIdDto) {
    const details = {
      senderId: dto.senderId.trim(),
      purpose: dto.purpose?.trim() || null,
      tenantName: dto.tenantName.trim(),
      tenantRef: dto.tenantRef?.trim() || null,
      tenantPhone: dto.tenantPhone?.trim() || null,
      requestedByName: dto.requestedByName?.trim() || null,
      requestedByEmail: dto.requestedByEmail?.trim().toLowerCase() || null,
      ...(dto.requestedAt ? { requestedAt: new Date(dto.requestedAt) } : {}),
    };
    const key = { app_externalId: { app, externalId: dto.externalId } };

    const existing = await this.prisma.senderIdRequest.findUnique({ where: key });
    // A request that staff already decided is a record of fact — re-sending cannot reopen it.
    const row =
      existing && existing.status !== ReviewStatus.PENDING
        ? existing
        : await this.prisma.senderIdRequest.upsert({
            where: key,
            create: { app, externalId: dto.externalId, ...details },
            update: details,
          });
    return this.senderIdStatus(row);
  }

  async getSenderId(app: SourceApp, externalId: string) {
    const row = await this.prisma.senderIdRequest.findUnique({
      where: { app_externalId: { app, externalId } },
    });
    if (!row) throw new NotFoundException('Sender ID request not found.');

    if (row.status !== ReviewStatus.PENDING && row.deliveryStatus !== DeliveryStatus.DELIVERED) {
      await this.prisma.senderIdRequest.update({
        where: { id: row.id },
        data: {
          deliveryStatus: DeliveryStatus.DELIVERED,
          deliveredAt: new Date(),
          deliveryError: null,
        },
      });
    }
    return this.senderIdStatus(row);
  }

  private senderIdStatus(row: SenderIdRequest) {
    return {
      externalId: row.externalId,
      senderId: row.senderId,
      status: row.status,
      note: row.reviewNote,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
    };
  }

  // --- Payments -------------------------------------------------------------

  async upsertPayment(app: SourceApp, dto: IngestPaymentDto) {
    const settledByApp =
      dto.status === PaymentRequestStatus.APPROVED ||
      dto.status === PaymentRequestStatus.REJECTED;
    const details = {
      kind: dto.kind,
      amount: dto.amount,
      currency: (dto.currency ?? 'TZS').toUpperCase(),
      paymentMethod: dto.paymentMethod.trim().toUpperCase(),
      tenantName: dto.tenantName?.trim() || undefined,
      tenantRef: dto.tenantRef?.trim() || undefined,
      planCode: dto.planCode?.trim() || undefined,
      billingCycle: dto.billingCycle?.trim() || undefined,
      units: dto.units,
      externalReference: dto.externalReference?.trim() || undefined,
      providerReference: dto.providerReference?.trim() || undefined,
      payerName: dto.payerName?.trim() || undefined,
      payerEmail: dto.payerEmail?.trim().toLowerCase() || undefined,
      payerPhone: dto.payerPhone?.trim() || undefined,
      ...(dto.requestedAt ? { requestedAt: new Date(dto.requestedAt) } : {}),
    };
    const key = { app_reference: { app, reference: dto.reference } };

    const existing = await this.prisma.paymentRequest.findUnique({ where: key });
    // Once a staff member has verified or rejected it, the app cannot overwrite that.
    if (existing?.reviewedById) {
      return this.paymentStatus(existing);
    }

    const state = {
      status: dto.status,
      reviewedAt: settledByApp ? (existing?.reviewedAt ?? new Date()) : null,
    };
    const row = await this.prisma.paymentRequest.upsert({
      where: key,
      create: { app, reference: dto.reference, ...details, ...state },
      update: { ...details, ...state },
    });
    return this.paymentStatus(row);
  }

  async getPayment(app: SourceApp, reference: string) {
    const row = await this.prisma.paymentRequest.findUnique({
      where: { app_reference: { app, reference } },
    });
    if (!row) throw new NotFoundException('Payment request not found.');

    if (row.reviewedById && row.deliveryStatus !== DeliveryStatus.DELIVERED) {
      await this.prisma.paymentRequest.update({
        where: { id: row.id },
        data: { deliveryStatus: DeliveryStatus.DELIVERED, deliveredAt: new Date() },
      });
    }
    return this.paymentStatus(row);
  }

  /** Same shape the apps already read from the DeltaSynk subscription registry. */
  private paymentStatus(row: PaymentRequest) {
    return {
      reference: row.reference,
      kind: row.kind,
      paymentStatus: row.status,
      canProceed: row.status === PaymentRequestStatus.APPROVED,
      awaitingReview: row.status === PaymentRequestStatus.SUBMITTED,
      note: row.reviewNote,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
    };
  }
}
