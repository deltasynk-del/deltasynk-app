import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  SourceApp,
  WarrantyCardDesign,
  WarrantyCardPack,
  WarrantyPackStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { APP_NAMES } from '../apps/app-names';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { enumOrUndefined, paging } from '../common/utils/paging.util';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimPackDto, CreatePacksDto, VoidPackDto, WarrantyDesignDto } from './dto/warranty-cards.dto';
import {
  generateCardNumber,
  generatePackCode,
  normalizePackCode,
  sheetLayout,
  SheetLayout,
} from './warranty-card.util';

export type CardSide = 'front' | 'back';

export interface ClaimResult {
  code: string;
  cardCount: number;
  numbers: string[];
  claimedAt: string | null;
}

export const MAX_DESIGN_IMAGE_BYTES = 8 * 1024 * 1024;
/** Most cards one "Generate packs" may create. */
const MAX_CARDS_PER_RUN = 5000;

export interface DesignView {
  id: string;
  name: string;
  cardWidthMm: number;
  cardHeightMm: number;
  pageMarginMm: number;
  gapMm: number;
  sheet: SheetLayout;
  /** API paths of the pictures (null = not uploaded). */
  frontImageUrl: string | null;
  backImageUrl: string | null;
  qrX: number;
  qrY: number;
  qrSize: number;
  barcodeX: number;
  barcodeY: number;
  barcodeWidth: number;
  barcodeHeight: number;
  showNumber: boolean;
  packCount: number;
  updatedAt: string;
}

type DesignRow = Omit<WarrantyCardDesign, 'frontImage' | 'backImage'> & {
  hasFront: boolean;
  hasBack: boolean;
  packCount: number;
};

/** Every column except the picture bytes. */
const DESIGN_FIELDS = {
  id: true,
  name: true,
  cardWidthMm: true,
  cardHeightMm: true,
  pageMarginMm: true,
  gapMm: true,
  frontImageType: true,
  backImageType: true,
  imageVersion: true,
  qrX: true,
  qrY: true,
  qrSize: true,
  barcodeX: true,
  barcodeY: true,
  barcodeWidth: true,
  barcodeHeight: true,
  showNumber: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WarrantyCardDesignSelect;

/**
 * Printed warranty cards for SynkMart shops that don't print their own: staff design the
 * card, generate packs (each with a claim code), print them, and the shop owner claims a
 * pack in SynkMart. The cards then work exactly like cards the shop printed itself.
 */
@Injectable()
export class WarrantyCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  // --- Designs --------------------------------------------------------------

  async listDesigns(): Promise<DesignView[]> {
    const rows = await this.prisma.warrantyCardDesign.findMany({
      select: { ...DESIGN_FIELDS, _count: { select: { packs: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) =>
      this.designView({
        ...r,
        hasFront: !!r.frontImageType,
        hasBack: !!r.backImageType,
        packCount: r._count.packs,
      }),
    );
  }

  async createDesign(actor: AuthenticatedUser, dto: WarrantyDesignDto): Promise<DesignView> {
    const name = dto.name?.trim();
    if (!name || name.length < 2) throw new BadRequestException('Give the design a name.');
    const data = { ...dto, name };
    this.assertFitsA4(data);
    const row = await this.prisma.warrantyCardDesign.create({ data, select: { id: true } });
    await this.audit.record({
      actor,
      action: 'warranty_design.created',
      entityType: 'warranty_design',
      entityId: row.id,
      summary: `Created warranty card design “${name}”.`,
    });
    return this.getDesign(row.id);
  }

  async updateDesign(actor: AuthenticatedUser, id: string, dto: WarrantyDesignDto): Promise<DesignView> {
    const current = await this.getDesign(id);
    const data = { ...dto, ...(dto.name !== undefined ? { name: dto.name.trim() } : {}) };
    this.assertFitsA4({ ...current, ...data });
    await this.prisma.warrantyCardDesign.update({ where: { id }, data });
    await this.audit.record({
      actor,
      action: 'warranty_design.updated',
      entityType: 'warranty_design',
      entityId: id,
      summary: `Updated warranty card design “${data.name ?? current.name}”.`,
    });
    return this.getDesign(id);
  }

  async deleteDesign(actor: AuthenticatedUser, id: string): Promise<void> {
    const design = await this.getDesign(id);
    if (design.packCount > 0) {
      throw new ConflictException('Packs were printed with this design, so it is kept for reprinting.');
    }
    await this.prisma.warrantyCardDesign.delete({ where: { id } });
    await this.audit.record({
      actor,
      action: 'warranty_design.deleted',
      entityType: 'warranty_design',
      entityId: id,
      summary: `Deleted warranty card design “${design.name}”.`,
    });
  }

  /** Pictures arrive compressed from the browser; only the file type and size are checked here. */
  async setImage(actor: AuthenticatedUser, id: string, side: CardSide, file: { buffer: Buffer }): Promise<DesignView> {
    const design = await this.getDesign(id);
    const type = imageType(file.buffer);
    if (!type) throw new BadRequestException('Use a JPG, PNG or WebP picture.');
    const bytes = new Uint8Array(file.buffer);
    await this.prisma.warrantyCardDesign.update({
      where: { id },
      data:
        side === 'front'
          ? { frontImage: bytes, frontImageType: type, imageVersion: { increment: 1 } }
          : { backImage: bytes, backImageType: type, imageVersion: { increment: 1 } },
    });
    await this.audit.record({
      actor,
      action: 'warranty_design.image_uploaded',
      entityType: 'warranty_design',
      entityId: id,
      summary: `Uploaded the ${side} of warranty card design “${design.name}”.`,
    });
    return this.getDesign(id);
  }

  async removeImage(actor: AuthenticatedUser, id: string, side: CardSide): Promise<DesignView> {
    const design = await this.getDesign(id);
    await this.prisma.warrantyCardDesign.update({
      where: { id },
      data:
        side === 'front'
          ? { frontImage: null, frontImageType: null, imageVersion: { increment: 1 } }
          : { backImage: null, backImageType: null, imageVersion: { increment: 1 } },
    });
    await this.audit.record({
      actor,
      action: 'warranty_design.image_removed',
      entityType: 'warranty_design',
      entityId: id,
      summary: `Removed the ${side} of warranty card design “${design.name}”.`,
    });
    return this.getDesign(id);
  }

  async getImage(id: string, side: CardSide): Promise<{ data: Buffer; type: string }> {
    const row = await this.prisma.warrantyCardDesign.findUnique({
      where: { id },
      select: { frontImage: side === 'front', frontImageType: side === 'front', backImage: side === 'back', backImageType: side === 'back' },
    });
    const data = side === 'front' ? row?.frontImage : row?.backImage;
    const type = side === 'front' ? row?.frontImageType : row?.backImageType;
    if (!data || !type) throw new NotFoundException('Picture not found.');
    return { data: Buffer.from(data), type };
  }

  // --- Packs ----------------------------------------------------------------

  async createPacks(actor: AuthenticatedUser, dto: CreatePacksDto) {
    const design = await this.getDesign(dto.designId);
    if (!design.backImageUrl) {
      throw new BadRequestException('Upload the back of the card (the side with the codes) before printing.');
    }
    const total = dto.packCount * dto.cardsPerPack;
    if (total > MAX_CARDS_PER_RUN) {
      throw new BadRequestException(`At most ${MAX_CARDS_PER_RUN} cards at a time — make fewer or smaller packs.`);
    }

    const runId = randomUUID();
    const numbers = await this.freshNumbers(total);
    const codes = await this.freshCodes(dto.packCount);

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < dto.packCount; i += 1) {
        const pack = await tx.warrantyCardPack.create({
          data: {
            runId,
            code: codes[i],
            designId: design.id,
            cardCount: dto.cardsPerPack,
            createdById: actor.id,
          },
        });
        const slice = numbers.slice(i * dto.cardsPerPack, (i + 1) * dto.cardsPerPack);
        await tx.warrantyStockCard.createMany({
          data: slice.map((number) => ({ packId: pack.id, number })),
        });
      }
    });

    await this.audit.record({
      actor,
      action: 'warranty_packs.created',
      entityType: 'warranty_run',
      entityId: runId,
      summary: `Generated ${dto.packCount} warranty card pack(s) of ${dto.cardsPerPack} cards with design “${design.name}”.`,
      metadata: { codes },
    });
    return { runId, packCount: dto.packCount, cardCount: total };
  }

  async listPacks(query: { status?: string; q?: string; page?: string; pageSize?: string }) {
    const { page, pageSize, skip, take } = paging(query);
    const status = enumOrUndefined(WarrantyPackStatus, query.status);
    const q = query.q?.trim();
    const code = q ? normalizePackCode(q) : null;
    const where: Prisma.WarrantyCardPackWhereInput = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              ...(code ? [{ code }] : []),
              { claimedTenantName: { contains: q, mode: 'insensitive' as const } },
              // A card number finds the pack it is in.
              ...(/^\d{12}$/.test(q) ? [{ cards: { some: { number: q } } }] : []),
            ],
          }
        : {}),
    };

    const [total, rows, counts] = await Promise.all([
      this.prisma.warrantyCardPack.count({ where }),
      this.prisma.warrantyCardPack.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          design: { select: { name: true } },
          cards: { select: { number: true }, orderBy: { number: 'asc' }, take: 1 },
        },
      }),
      this.prisma.warrantyCardPack.groupBy({ by: ['status'], _count: true }),
    ]);
    const creators = await this.userNames(rows.map((r) => r.createdById));

    return {
      total,
      page,
      pageSize,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      items: rows.map((r) => ({
        ...this.packView(r),
        designName: r.design?.name ?? null,
        firstNumber: r.cards[0]?.number ?? null,
        createdByName: r.createdById ? (creators.get(r.createdById) ?? null) : null,
      })),
    };
  }

  /** Everything the print page needs: the design, and each pack's cards with their links. */
  async printSheet(query: { runId?: string; packId?: string }) {
    if (!query.runId && !query.packId) throw new BadRequestException('Choose what to print.');
    const packs = await this.prisma.warrantyCardPack.findMany({
      where: {
        ...(query.packId ? { id: query.packId } : { runId: query.runId }),
        status: { not: WarrantyPackStatus.VOID },
      },
      orderBy: { createdAt: 'asc' },
      include: { cards: { select: { number: true }, orderBy: { number: 'asc' } } },
    });
    if (packs.length === 0) throw new NotFoundException('No packs to print (cancelled packs are not printed).');
    const designId = packs[0].designId;
    if (!designId) throw new BadRequestException('The design of these packs was deleted.');
    const design = await this.getDesign(designId);
    const base = this.cardLinkBase();
    return {
      design,
      packs: packs.map((p) => ({
        ...this.packView(p),
        cards: p.cards.map((c) => ({ number: c.number, url: `${base}${c.number}` })),
      })),
    };
  }

  async voidPack(actor: AuthenticatedUser, id: string, dto: VoidPackDto) {
    const result = await this.prisma.warrantyCardPack.updateMany({
      where: { id, status: WarrantyPackStatus.AVAILABLE },
      data: { status: WarrantyPackStatus.VOID, voidReason: dto.reason.trim(), voidedAt: new Date() },
    });
    const pack = await this.prisma.warrantyCardPack.findUnique({ where: { id } });
    if (!pack) throw new NotFoundException('Pack not found.');
    if (result.count === 0) {
      throw new ConflictException(
        pack.status === WarrantyPackStatus.CLAIMED
          ? `This pack was already claimed by ${pack.claimedTenantName}.`
          : 'This pack is already cancelled.',
      );
    }
    await this.audit.record({
      actor,
      action: 'warranty_pack.voided',
      entityType: 'warranty_pack',
      entityId: id,
      summary: `Cancelled warranty card pack ${pack.code}: ${dto.reason.trim()}`,
    });
    return this.packView(pack);
  }

  // --- Claim (called by SynkMart) -------------------------------------------

  /**
   * A shop owner entered a pack's claim code. The first shop to claim it gets its cards.
   * Claiming again from the same shop returns the same cards, so a retry after a network
   * failure is safe.
   */
  async claim(app: SourceApp, dto: ClaimPackDto): Promise<ClaimResult> {
    const code = normalizePackCode(dto.code);
    if (!code) throw new BadRequestException('That is not a pack code. It looks like K7M2-9QPT.');
    const tenantRef = dto.tenantRef.trim();
    const tenantName = dto.tenantName.trim();

    const pack = await this.prisma.warrantyCardPack.findUnique({ where: { code } });
    if (!pack || pack.app !== app) throw new NotFoundException('No pack has this code. Check the code on the pack label.');
    if (pack.status === WarrantyPackStatus.VOID) {
      throw new ConflictException('This pack was cancelled by DeltaSynk. Contact DeltaSynk support.');
    }
    if (pack.status === WarrantyPackStatus.CLAIMED && pack.claimedTenantRef !== tenantRef) {
      throw new ConflictException('This pack was already added to another shop.');
    }

    if (pack.status === WarrantyPackStatus.AVAILABLE) {
      const claimed = await this.prisma.warrantyCardPack.updateMany({
        where: { id: pack.id, status: WarrantyPackStatus.AVAILABLE },
        data: {
          status: WarrantyPackStatus.CLAIMED,
          claimedTenantRef: tenantRef,
          claimedTenantName: tenantName,
          claimedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        // Someone claimed it between the read and the write: decide again on the fresh row.
        return this.claim(app, dto);
      }
      await this.audit.record({
        actorLabel: APP_NAMES[app],
        action: 'warranty_pack.claimed',
        entityType: 'warranty_pack',
        entityId: pack.id,
        summary: `${tenantName} claimed warranty card pack ${code} (${pack.cardCount} cards).`,
      });
    }

    const cards = await this.prisma.warrantyStockCard.findMany({
      where: { packId: pack.id },
      select: { number: true },
      orderBy: { number: 'asc' },
    });
    const fresh = await this.prisma.warrantyCardPack.findUniqueOrThrow({ where: { id: pack.id } });
    return {
      code,
      cardCount: cards.length,
      numbers: cards.map((c) => c.number),
      claimedAt: fresh.claimedAt?.toISOString() ?? null,
    };
  }

  // --- Helpers --------------------------------------------------------------

  private async getDesign(id: string): Promise<DesignView> {
    const row = await this.prisma.warrantyCardDesign.findUnique({
      where: { id },
      select: { ...DESIGN_FIELDS, _count: { select: { packs: true } } },
    });
    if (!row) throw new NotFoundException('Design not found.');
    return this.designView({
      ...row,
      hasFront: !!row.frontImageType,
      hasBack: !!row.backImageType,
      packCount: row._count.packs,
    });
  }

  private assertFitsA4(d: { cardWidthMm?: number; cardHeightMm?: number; pageMarginMm?: number; gapMm?: number }) {
    const sheet = sheetLayout(d.cardWidthMm ?? 210, d.cardHeightMm ?? 74.25, d.pageMarginMm ?? 0, d.gapMm ?? 0);
    if (sheet.perPage < 1) {
      throw new BadRequestException('A card of that size does not fit on an A4 page with these margins.');
    }
  }

  private designView(r: DesignRow): DesignView {
    const image = (side: CardSide, has: boolean) =>
      has ? `/warranty-cards/designs/${r.id}/${side}?v=${r.imageVersion}` : null;
    return {
      id: r.id,
      name: r.name,
      cardWidthMm: r.cardWidthMm,
      cardHeightMm: r.cardHeightMm,
      pageMarginMm: r.pageMarginMm,
      gapMm: r.gapMm,
      sheet: sheetLayout(r.cardWidthMm, r.cardHeightMm, r.pageMarginMm, r.gapMm),
      frontImageUrl: image('front', r.hasFront),
      backImageUrl: image('back', r.hasBack),
      qrX: r.qrX,
      qrY: r.qrY,
      qrSize: r.qrSize,
      barcodeX: r.barcodeX,
      barcodeY: r.barcodeY,
      barcodeWidth: r.barcodeWidth,
      barcodeHeight: r.barcodeHeight,
      showNumber: r.showNumber,
      packCount: r.packCount,
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private packView(p: WarrantyCardPack) {
    return {
      id: p.id,
      runId: p.runId,
      code: p.code,
      app: p.app,
      cardCount: p.cardCount,
      status: p.status,
      claimedTenantName: p.claimedTenantName,
      claimedTenantRef: p.claimedTenantRef,
      claimedAt: p.claimedAt?.toISOString() ?? null,
      voidReason: p.voidReason,
      voidedAt: p.voidedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    };
  }

  /** The SynkMart page a card's QR code opens; the card number is appended. */
  private cardLinkBase(): string {
    const base = this.config.get<string>('WARRANTY_CARD_URL') || 'https://synkmart.deltasynk.com/w/';
    return base.endsWith('/') ? base : `${base}/`;
  }

  private async freshNumbers(count: number): Promise<string[]> {
    const numbers = new Set<string>();
    while (numbers.size < count) {
      const batch = new Set<string>();
      while (batch.size < count - numbers.size) batch.add(generateCardNumber());
      const taken = await this.prisma.warrantyStockCard.findMany({
        where: { number: { in: [...batch] } },
        select: { number: true },
      });
      const takenSet = new Set(taken.map((t) => t.number));
      for (const n of batch) if (!takenSet.has(n)) numbers.add(n);
    }
    return [...numbers];
  }

  private async freshCodes(count: number): Promise<string[]> {
    const codes = new Set<string>();
    while (codes.size < count) {
      const code = generatePackCode();
      if (!(await this.prisma.warrantyCardPack.findUnique({ where: { code }, select: { id: true } }))) {
        codes.add(code);
      }
    }
    return [...codes];
  }

  private async userNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, fullName: true } });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }
}

/** Recognises the picture from its first bytes rather than trusting the file name. */
function imageType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Re-exported so the controller can reject unknown sides. */
export function assertSide(side: string): CardSide {
  if (side !== 'front' && side !== 'back') throw new ForbiddenException('Unknown card side.');
  return side;
}
