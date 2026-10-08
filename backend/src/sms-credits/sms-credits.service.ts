import { Injectable } from '@nestjs/common';
import { SourceApp } from '@prisma/client';
import { AppsService } from '../apps/apps.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { GrantCreditsDto } from './dto/sms-credits.dto';

export interface CreditShop {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  smsBalance: number;
}

/**
 * SMS credits staff give a shop without a payment (trial credits, goodwill, corrections).
 * The balance lives in SynkMart; the portal calls its platform API and records who gave what.
 */
@Injectable()
export class SmsCreditsService {
  constructor(
    private readonly apps: AppsService,
    private readonly audit: AuditService,
  ) {}

  findShops(q?: string): Promise<CreditShop[]> {
    const query = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    return this.apps.callPlatform<CreditShop[]>(SourceApp.SYNKMART, 'GET', `/platform/shops${query}`);
  }

  async grant(actor: AuthenticatedUser, dto: GrantCreditsDto): Promise<CreditShop> {
    const note = dto.note.trim();
    const shop = await this.apps.callPlatform<CreditShop>(
      SourceApp.SYNKMART,
      'POST',
      `/platform/shops/${dto.shopId}/sms-credits`,
      { units: dto.units, note: `${note} — ${actor.fullName}, DeltaSynk Portal` },
    );
    await this.audit.record({
      actor,
      action: 'topup.granted',
      entityType: 'shop',
      entityId: dto.shopId,
      summary: `Added ${dto.units.toLocaleString('en-US')} SMS credits to ${shop.name} (SynkMart) without a payment: ${note}`,
      metadata: { units: dto.units, balanceAfter: shop.smsBalance, note },
    });
    return shop;
  }
}
