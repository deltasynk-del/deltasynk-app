import { Injectable } from '@nestjs/common';
import { SourceApp } from '@prisma/client';
import { AppsService } from '../apps/apps.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { AddonBodyDto, HardwareUpdateDto, PlanBodyDto } from './dto/website.dto';

export interface WebsitePlan {
  id: string;
  service: string;
  planName: string;
  planCode: string | null;
  duration: string;
  amount: number | null;
  currency: string;
  description: string | null;
  status: string;
  minStudents: number | null;
  maxStudents: number | null;
  sortOrder: number;
  isPopular: boolean;
  features: string[];
  updatedAt: string;
}

export interface WebsiteAddon {
  id: string;
  service: string;
  addonCode: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  imageUrl: string | null;
  freeFromMonths: number;
  ownershipMonths: number;
  sortOrder: number;
  status: string;
  updatedAt: string;
}

export interface HardwareItem {
  id: string;
  registrationReference: string;
  service: string;
  shopSlug?: string;
  addonCode: string;
  addonName: string;
  acquisition: string;
  amount: number;
  currency: string;
  status: string;
  serialNumber?: string;
  issuedAt?: string;
  ownershipTransfersAt?: string;
  returnedAt?: string;
  notes?: string;
  ownedByCustomer: boolean;
}

const money = (amount: number | null, currency: string) =>
  amount === null ? 'no price' : `${currency} ${amount.toLocaleString('en-US')}`;

/**
 * The pricing cards, equipment and equipment requests of deltasynk.com. They live in the
 * website's own database (the product apps read prices from there); the portal edits them
 * through the website's staff API and records every change.
 */
@Injectable()
export class WebsiteService {
  constructor(
    private readonly apps: AppsService,
    private readonly audit: AuditService,
  ) {}

  private call<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
    return this.apps.callPlatform<T>(SourceApp.DELTASYNK_WEBSITE, method, `/admin${path}`, body);
  }

  private query(params: Record<string, string | undefined>): string {
    const entries = Object.entries(params).filter(([, v]) => v);
    return entries.length
      ? `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&')}`
      : '';
  }

  // Plans

  listPlans(service?: string) {
    return this.call<WebsitePlan[]>('GET', `/plans${this.query({ service })}`);
  }

  async createPlan(actor: AuthenticatedUser, dto: PlanBodyDto) {
    const plan = await this.call<WebsitePlan>('POST', '/plans', dto);
    await this.audit.record({
      actor,
      action: 'website.plan_created',
      entityType: 'website_plan',
      entityId: plan.id,
      summary: `Added the ${plan.planName} plan to ${plan.service} on the website (${money(plan.amount, plan.currency)}).`,
    });
    return plan;
  }

  async updatePlan(actor: AuthenticatedUser, id: string, dto: PlanBodyDto) {
    const before = (await this.listPlans()).find((p) => p.id === id);
    const plan = await this.call<WebsitePlan>('PATCH', `/plans/${id}`, dto);
    const changes: string[] = [];
    if (before && before.amount !== plan.amount) {
      changes.push(`price ${money(before.amount, before.currency)} → ${money(plan.amount, plan.currency)}`);
    }
    if (before && before.status !== plan.status) {
      changes.push(plan.status === 'ACTIVE' ? 'shown on the website' : 'hidden from the website');
    }
    if (before && before.planName !== plan.planName) changes.push(`renamed from ${before.planName}`);
    await this.audit.record({
      actor,
      action: 'website.plan_updated',
      entityType: 'website_plan',
      entityId: plan.id,
      summary: `Changed the ${plan.planName} plan of ${plan.service} on the website${changes.length ? `: ${changes.join(', ')}` : ''}.`,
      metadata: { changed: Object.keys(dto) },
    });
    return plan;
  }

  async deletePlan(actor: AuthenticatedUser, id: string) {
    const plan = await this.call<WebsitePlan>('DELETE', `/plans/${id}`);
    await this.audit.record({
      actor,
      action: 'website.plan_deleted',
      entityType: 'website_plan',
      entityId: id,
      summary: `Deleted the ${plan.planName} plan of ${plan.service} from the website (${money(plan.amount, plan.currency)}).`,
    });
    return plan;
  }

  // Equipment

  listAddons(service?: string) {
    return this.call<WebsiteAddon[]>('GET', `/addons${this.query({ service })}`);
  }

  async createAddon(actor: AuthenticatedUser, dto: AddonBodyDto) {
    const addon = await this.call<WebsiteAddon>('POST', '/addons', dto);
    await this.audit.record({
      actor,
      action: 'website.addon_created',
      entityType: 'website_addon',
      entityId: addon.id,
      summary: `Added ${addon.name} to the ${addon.service} equipment on the website (${money(addon.amount, addon.currency)}).`,
    });
    return addon;
  }

  async updateAddon(actor: AuthenticatedUser, id: string, dto: AddonBodyDto) {
    const before = (await this.listAddons()).find((a) => a.id === id);
    const addon = await this.call<WebsiteAddon>('PATCH', `/addons/${id}`, dto);
    const changes: string[] = [];
    if (before && before.amount !== addon.amount) {
      changes.push(`price ${money(before.amount, before.currency)} → ${money(addon.amount, addon.currency)}`);
    }
    if (before && before.status !== addon.status) {
      changes.push(addon.status === 'ACTIVE' ? 'shown on the website' : 'hidden from the website');
    }
    await this.audit.record({
      actor,
      action: 'website.addon_updated',
      entityType: 'website_addon',
      entityId: addon.id,
      summary: `Changed ${addon.name} (${addon.service} equipment) on the website${changes.length ? `: ${changes.join(', ')}` : ''}.`,
      metadata: { changed: Object.keys(dto) },
    });
    return addon;
  }

  async deleteAddon(actor: AuthenticatedUser, id: string) {
    const addon = await this.call<WebsiteAddon>('DELETE', `/addons/${id}`);
    await this.audit.record({
      actor,
      action: 'website.addon_deleted',
      entityType: 'website_addon',
      entityId: id,
      summary: `Deleted ${addon.name} from the ${addon.service} equipment on the website.`,
    });
    return addon;
  }

  // Equipment requested by customers

  listHardware(filter: { service?: string; status?: string }) {
    return this.call<HardwareItem[]>('GET', `/hardware${this.query(filter)}`);
  }

  async updateHardware(actor: AuthenticatedUser, id: string, dto: HardwareUpdateDto) {
    const item = await this.call<HardwareItem>('PATCH', `/hardware/${id}`, dto);
    await this.audit.record({
      actor,
      action: 'hardware.updated',
      entityType: 'hardware',
      entityId: id,
      summary: `Updated ${item.addonName} for ${item.shopSlug ?? item.registrationReference}: ${item.status.toLowerCase()}${item.serialNumber ? `, serial ${item.serialNumber}` : ''}.`,
      metadata: { changed: Object.keys(dto) },
    });
    return item;
  }

  summary() {
    return this.call<Record<string, unknown>>('GET', '/summary');
  }
}
