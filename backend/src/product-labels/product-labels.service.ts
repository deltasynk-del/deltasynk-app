import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ProductLabelBatch,
  ProductLabelBatchStatus,
  ProductLabelItem,
  SourceApp,
} from '@prisma/client';
import { APP_NAMES } from '../apps/app-names';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { enumOrUndefined, paging } from '../common/utils/paging.util';
import { PrismaService } from '../prisma/prisma.service';
import { generatePackCode, normalizePackCode, sheetLayout } from '../warranty-cards/warranty-card.util';
import { ClaimLabelBatchDto, SaveLabelBatchDto, VoidLabelBatchDto } from './dto/product-labels.dto';
import { generateEan13 } from './ean13.util';

/** Most labels one batch may print. */
const MAX_LABELS = 10_000;

export interface ClaimedLabels {
  code: string;
  products: { name: string; barcode: string }[];
  claimedAt: string | null;
}

type BatchWithItems = ProductLabelBatch & { items: ProductLabelItem[] };

/**
 * Barcode labels for a shop's products: staff type each product's name and how many labels
 * it needs, every product gets its own EAN-13, and the labels print on A4. The shop owner
 * claims the batch in SynkMart with its code, and the products are created with those barcodes.
 */
@Injectable()
export class ProductLabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: { status?: string; q?: string; page?: string; pageSize?: string }) {
    const { page, pageSize, skip, take } = paging(query);
    const status = enumOrUndefined(ProductLabelBatchStatus, query.status);
    const q = query.q?.trim();
    const code = q ? normalizePackCode(q) : null;
    const where: Prisma.ProductLabelBatchWhereInput = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              ...(code ? [{ code }] : []),
              { name: { contains: q, mode: 'insensitive' as const } },
              { claimedTenantName: { contains: q, mode: 'insensitive' as const } },
              { items: { some: { OR: [{ barcode: q }, { name: { contains: q, mode: 'insensitive' as const } }] } } },
            ],
          }
        : {}),
    };
    const [total, rows, counts] = await Promise.all([
      this.prisma.productLabelBatch.count({ where }),
      this.prisma.productLabelBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      }),
      this.prisma.productLabelBatch.groupBy({ by: ['status'], _count: true }),
    ]);
    const creators = await this.userNames(rows.map((r) => r.createdById));
    return {
      total,
      page,
      pageSize,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      items: rows.map((r) => ({
        ...this.view(r),
        createdByName: r.createdById ? (creators.get(r.createdById) ?? null) : null,
      })),
    };
  }

  async get(id: string) {
    return this.view(await this.find(id));
  }

  async create(actor: AuthenticatedUser, dto: SaveLabelBatchDto) {
    this.validate(dto);
    const code = await this.freshCode();
    const barcodes = await this.freshBarcodes(dto.items.length);
    const batch = await this.prisma.productLabelBatch.create({
      data: {
        code,
        ...this.batchFields(dto),
        createdById: actor.id,
        items: {
          create: dto.items.map((item, i) => ({
            name: item.name.trim(),
            copies: item.copies,
            barcode: barcodes[i],
            sortOrder: i,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    await this.audit.record({
      actor,
      action: 'product_labels.created',
      entityType: 'product_labels',
      entityId: batch.id,
      summary: `Created product label batch ${code} “${batch.name}” (${batch.items.length} products).`,
    });
    return this.view(batch);
  }

  /** Until the shop claims it, the batch can be corrected. Products that stay keep their barcode. */
  async update(actor: AuthenticatedUser, id: string, dto: SaveLabelBatchDto) {
    const current = await this.find(id);
    if (current.status !== ProductLabelBatchStatus.AVAILABLE) {
      throw new ConflictException('Only batches that have not been claimed can be changed.');
    }
    this.validate(dto);
    const keep = new Map(current.items.map((item) => [item.id, item]));
    const unknown = dto.items.find((item) => item.id && !keep.has(item.id));
    if (unknown) throw new BadRequestException('One of the products is not in this batch.');
    const newCount = dto.items.filter((item) => !item.id).length;
    const barcodes = await this.freshBarcodes(newCount);

    await this.prisma.$transaction(async (tx) => {
      const keptIds = dto.items.filter((item) => item.id).map((item) => item.id!);
      await tx.productLabelItem.deleteMany({ where: { batchId: id, id: { notIn: keptIds } } });
      let next = 0;
      for (const [i, item] of dto.items.entries()) {
        if (item.id) {
          await tx.productLabelItem.update({
            where: { id: item.id },
            data: { name: item.name.trim(), copies: item.copies, sortOrder: i },
          });
        } else {
          await tx.productLabelItem.create({
            data: { batchId: id, name: item.name.trim(), copies: item.copies, barcode: barcodes[next++], sortOrder: i },
          });
        }
      }
      await tx.productLabelBatch.update({ where: { id }, data: this.batchFields(dto) });
    });
    await this.audit.record({
      actor,
      action: 'product_labels.updated',
      entityType: 'product_labels',
      entityId: id,
      summary: `Updated product label batch ${current.code} “${dto.name.trim()}”.`,
    });
    return this.get(id);
  }

  async void(actor: AuthenticatedUser, id: string, dto: VoidLabelBatchDto) {
    const result = await this.prisma.productLabelBatch.updateMany({
      where: { id, status: ProductLabelBatchStatus.AVAILABLE },
      data: { status: ProductLabelBatchStatus.VOID, voidReason: dto.reason.trim(), voidedAt: new Date() },
    });
    const batch = await this.find(id);
    if (result.count === 0) {
      throw new ConflictException(
        batch.status === ProductLabelBatchStatus.CLAIMED
          ? `This batch was already claimed by ${batch.claimedTenantName}.`
          : 'This batch is already cancelled.',
      );
    }
    await this.audit.record({
      actor,
      action: 'product_labels.voided',
      entityType: 'product_labels',
      entityId: id,
      summary: `Cancelled product label batch ${batch.code}: ${dto.reason.trim()}`,
    });
    return this.view(batch);
  }

  /**
   * A shop owner entered the batch's claim code in SynkMart. The first shop to claim it
   * gets its products; claiming again from the same shop returns the same list (safe retry).
   */
  async claim(app: SourceApp, dto: ClaimLabelBatchDto): Promise<ClaimedLabels> {
    const code = normalizePackCode(dto.code);
    if (!code) throw new BadRequestException('That is not a label batch code. It looks like K7M2-9QPT.');
    const tenantRef = dto.tenantRef.trim();
    const tenantName = dto.tenantName.trim();

    const batch = await this.prisma.productLabelBatch.findUnique({
      where: { code },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!batch || batch.app !== app) {
      const isCardPack = await this.prisma.warrantyCardPack.findUnique({ where: { code }, select: { id: true } });
      throw new NotFoundException(
        isCardPack
          ? 'This is a warranty card pack code. Add it under Warranties → Cards instead.'
          : 'No label batch has this code. Check the code on the batch slip.',
      );
    }
    if (batch.status === ProductLabelBatchStatus.VOID) {
      throw new ConflictException('This label batch was cancelled by DeltaSynk. Contact DeltaSynk support.');
    }
    if (batch.status === ProductLabelBatchStatus.CLAIMED && batch.claimedTenantRef !== tenantRef) {
      throw new ConflictException('This label batch was already added to another shop.');
    }
    if (batch.status === ProductLabelBatchStatus.AVAILABLE) {
      const claimed = await this.prisma.productLabelBatch.updateMany({
        where: { id: batch.id, status: ProductLabelBatchStatus.AVAILABLE },
        data: {
          status: ProductLabelBatchStatus.CLAIMED,
          claimedTenantRef: tenantRef,
          claimedTenantName: tenantName,
          claimedAt: new Date(),
        },
      });
      // Someone claimed it between the read and the write: decide again on the fresh row.
      if (claimed.count === 0) return this.claim(app, dto);
      await this.audit.record({
        actorLabel: APP_NAMES[app],
        action: 'product_labels.claimed',
        entityType: 'product_labels',
        entityId: batch.id,
        summary: `${tenantName} claimed product label batch ${code} (${batch.items.length} products).`,
      });
    }
    const fresh = await this.prisma.productLabelBatch.findUniqueOrThrow({ where: { id: batch.id } });
    return {
      code,
      products: batch.items.map((item) => ({ name: item.name, barcode: item.barcode })),
      claimedAt: fresh.claimedAt?.toISOString() ?? null,
    };
  }

  // --- Helpers --------------------------------------------------------------

  private async find(id: string): Promise<BatchWithItems> {
    const batch = await this.prisma.productLabelBatch.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!batch) throw new NotFoundException('Label batch not found.');
    return batch;
  }

  private validate(dto: SaveLabelBatchDto): void {
    const labels = dto.items.reduce((sum, item) => sum + item.copies, 0);
    if (labels > MAX_LABELS) {
      throw new BadRequestException(`At most ${MAX_LABELS} labels in one batch — split it into two batches.`);
    }
    const names = new Set<string>();
    for (const item of dto.items) {
      const key = item.name.trim().toLowerCase();
      if (!key) throw new BadRequestException('Every product needs a name.');
      if (names.has(key)) throw new BadRequestException(`“${item.name.trim()}” is listed twice. Add up the labels in one line instead.`);
      names.add(key);
    }
    const sheet = sheetLayout(
      dto.labelWidthMm ?? 63.5,
      dto.labelHeightMm ?? 38.1,
      dto.pageMarginMm ?? 0,
      dto.gapMm ?? 2.5,
      dto.rowGapMm ?? 0,
    );
    if (sheet.perPage < 1) {
      throw new BadRequestException('A label of that size does not fit on an A4 page with these margins.');
    }
  }

  private batchFields(dto: SaveLabelBatchDto) {
    return {
      name: dto.name.trim(),
      labelWidthMm: dto.labelWidthMm,
      labelHeightMm: dto.labelHeightMm,
      pageMarginMm: dto.pageMarginMm,
      gapMm: dto.gapMm,
      rowGapMm: dto.rowGapMm,
    };
  }

  private view(batch: BatchWithItems) {
    const sheet = sheetLayout(batch.labelWidthMm, batch.labelHeightMm, batch.pageMarginMm, batch.gapMm, batch.rowGapMm);
    return {
      id: batch.id,
      code: batch.code,
      app: batch.app,
      name: batch.name,
      labelWidthMm: batch.labelWidthMm,
      labelHeightMm: batch.labelHeightMm,
      pageMarginMm: batch.pageMarginMm,
      gapMm: batch.gapMm,
      rowGapMm: batch.rowGapMm,
      sheet,
      status: batch.status,
      claimedTenantName: batch.claimedTenantName,
      claimedAt: batch.claimedAt?.toISOString() ?? null,
      voidReason: batch.voidReason,
      createdAt: batch.createdAt.toISOString(),
      productCount: batch.items.length,
      labelCount: batch.items.reduce((sum, item) => sum + item.copies, 0),
      items: batch.items.map((item) => ({ id: item.id, name: item.name, barcode: item.barcode, copies: item.copies })),
    };
  }

  /** Claim codes are unique across label batches and warranty card packs, so one can't be mistaken for the other. */
  private async freshCode(): Promise<string> {
    for (;;) {
      const code = generatePackCode();
      const [batch, pack] = await Promise.all([
        this.prisma.productLabelBatch.findUnique({ where: { code }, select: { id: true } }),
        this.prisma.warrantyCardPack.findUnique({ where: { code }, select: { id: true } }),
      ]);
      if (!batch && !pack) return code;
    }
  }

  private async freshBarcodes(count: number): Promise<string[]> {
    const barcodes = new Set<string>();
    while (barcodes.size < count) {
      const batch = new Set<string>();
      while (batch.size < count - barcodes.size) batch.add(generateEan13());
      const taken = await this.prisma.productLabelItem.findMany({
        where: { barcode: { in: [...batch] } },
        select: { barcode: true },
      });
      const takenSet = new Set(taken.map((t) => t.barcode));
      for (const b of batch) if (!takenSet.has(b)) barcodes.add(b);
    }
    return [...barcodes];
  }

  private async userNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, fullName: true } });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }
}
