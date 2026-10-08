import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Observable, forkJoin } from 'rxjs';
import { Permission } from '../../core/config/permissions';
import { WEBSITE_SERVICES, WebsiteAddon, WebsitePlan } from '../../core/models/portal.models';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { AuthService } from '../../core/services/auth.service';
import { PortalApiService } from '../../core/services/portal-api.service';
import { ToastService } from '../../core/services/toast.service';
import { ModalComponent } from '../../shared/modal.component';

interface PlanForm {
  id: string | null;
  planName: string;
  planCode: string;
  amount: number | null;
  description: string;
  features: string;
  isPopular: boolean;
  shown: boolean;
  sortOrder: number;
  minStudents: number | null;
  maxStudents: number | null;
}

interface AddonForm {
  id: string | null;
  name: string;
  addonCode: string;
  amount: number | null;
  description: string;
  imageUrl: string;
  freeFromMonths: number;
  ownershipMonths: number;
  shown: boolean;
  sortOrder: number;
}

/** The pricing cards and equipment shown on deltasynk.com, one product at a time. */
@Component({
  selector: 'dp-website-plans',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, MatIconModule, ModalComponent],
  templateUrl: './website-plans.component.html',
})
export class WebsitePlansComponent implements OnInit {
  private readonly api = inject(PortalApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly services = WEBSITE_SERVICES;
  readonly canManage = computed(() => this.auth.can(Permission.WEBSITE_MANAGE));

  readonly service = signal<string>(WEBSITE_SERVICES[0].value);
  readonly allPlans = signal<WebsitePlan[]>([]);
  readonly allAddons = signal<WebsiteAddon[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly plans = computed(() => this.allPlans().filter((p) => p.service === this.service()));
  readonly addons = computed(() => this.allAddons().filter((a) => a.service === this.service()));
  readonly serviceLabel = computed(
    () => this.services.find((s) => s.value === this.service())?.label ?? this.service(),
  );
  /** Schools are priced by student numbers; the other products are not. */
  readonly usesStudents = computed(() => this.service() === 'QUALITYSCHOOL');

  readonly planForm = signal<PlanForm | null>(null);
  readonly addonForm = signal<AddonForm | null>(null);
  readonly deleting = signal<{ kind: 'plan' | 'addon'; id: string; name: string } | null>(null);
  readonly saving = signal(false);
  readonly dialogError = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  countFor(service: string): number {
    return this.allPlans().filter((p) => p.service === service).length;
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    forkJoin({ plans: this.api.websitePlans(), addons: this.api.websiteAddons() }).subscribe({
      next: ({ plans, addons }) => {
        this.allPlans.set(plans);
        this.allAddons.set(addons);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(apiErrorMessage(err, 'Could not load the website’s plans.'));
        this.loading.set(false);
      },
    });
  }

  // Plans

  openPlan(plan?: WebsitePlan): void {
    this.dialogError.set(null);
    this.planForm.set({
      id: plan?.id ?? null,
      planName: plan?.planName ?? '',
      planCode: plan?.planCode ?? '',
      amount: plan ? plan.amount : null,
      description: plan?.description ?? '',
      features: (plan?.features ?? []).join('\n'),
      isPopular: plan?.isPopular ?? false,
      shown: plan ? plan.status === 'ACTIVE' : true,
      sortOrder: plan?.sortOrder ?? this.plans().length,
      minStudents: plan?.minStudents ?? null,
      maxStudents: plan?.maxStudents ?? null,
    });
  }

  savePlan(): void {
    const form = this.planForm();
    if (!form) return;
    if (form.planName.trim().length < 2) {
      this.dialogError.set('Give the plan a name.');
      return;
    }
    const amount = form.amount === null || (form.amount as unknown) === '' ? null : Number(form.amount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      this.dialogError.set('Enter the monthly price, or leave it empty for “contact us”.');
      return;
    }
    const whole = (value: number | null) =>
      value === null || (value as unknown) === '' ? null : Math.round(Number(value));

    this.saving.set(true);
    this.dialogError.set(null);
    this.api
      .saveWebsitePlan(form.id, {
        ...(form.id ? {} : { service: this.service() }),
        planName: form.planName.trim(),
        planCode: form.planCode.trim().toLowerCase() || null,
        amount,
        description: form.description.trim() || null,
        features: form.features.split('\n').map((line) => line.trim()).filter(Boolean),
        isPopular: form.isPopular,
        status: form.shown ? 'ACTIVE' : 'INACTIVE',
        sortOrder: Math.round(Number(form.sortOrder) || 0),
        minStudents: this.usesStudents() ? whole(form.minStudents) : null,
        maxStudents: this.usesStudents() ? whole(form.maxStudents) : null,
      })
      .subscribe({
        next: (plan) => {
          this.saving.set(false);
          this.planForm.set(null);
          this.toast.success(`${plan.planName} saved. The website shows the change straight away.`);
          this.load();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.dialogError.set(apiErrorMessage(err, 'Could not save the plan.'));
        },
      });
  }

  // Equipment

  openAddon(addon?: WebsiteAddon): void {
    this.dialogError.set(null);
    this.addonForm.set({
      id: addon?.id ?? null,
      name: addon?.name ?? '',
      addonCode: addon?.addonCode ?? '',
      amount: addon?.amount ?? null,
      description: addon?.description ?? '',
      imageUrl: addon?.imageUrl ?? '',
      freeFromMonths: addon?.freeFromMonths ?? 12,
      ownershipMonths: addon?.ownershipMonths ?? 36,
      shown: addon ? addon.status === 'ACTIVE' : true,
      sortOrder: addon?.sortOrder ?? this.addons().length,
    });
  }

  saveAddon(): void {
    const form = this.addonForm();
    if (!form) return;
    const amount = Number(form.amount);
    if (form.name.trim().length < 2) {
      this.dialogError.set('Give the item a name.');
      return;
    }
    if (!/^[a-z0-9_]{2,40}$/.test(form.addonCode.trim().toLowerCase())) {
      this.dialogError.set('The code needs 2–40 lowercase letters, numbers or underscores, e.g. pos_printer.');
      return;
    }
    if (form.amount === null || (form.amount as unknown) === '' || !Number.isFinite(amount) || amount < 0) {
      this.dialogError.set('Enter the item’s price.');
      return;
    }

    this.saving.set(true);
    this.dialogError.set(null);
    this.api
      .saveWebsiteAddon(form.id, {
        ...(form.id ? {} : { service: this.service() }),
        name: form.name.trim(),
        addonCode: form.addonCode.trim().toLowerCase(),
        amount,
        description: form.description.trim() || null,
        imageUrl: form.imageUrl.trim() || null,
        freeFromMonths: Math.max(Math.round(Number(form.freeFromMonths) || 12), 1),
        ownershipMonths: Math.max(Math.round(Number(form.ownershipMonths) || 36), 1),
        status: form.shown ? 'ACTIVE' : 'INACTIVE',
        sortOrder: Math.round(Number(form.sortOrder) || 0),
      })
      .subscribe({
        next: (addon) => {
          this.saving.set(false);
          this.addonForm.set(null);
          this.toast.success(`${addon.name} saved.`);
          this.load();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.dialogError.set(apiErrorMessage(err, 'Could not save the item.'));
        },
      });
  }

  // Delete

  askDelete(kind: 'plan' | 'addon', id: string, name: string): void {
    this.dialogError.set(null);
    this.deleting.set({ kind, id, name });
  }

  confirmDelete(): void {
    const target = this.deleting();
    if (!target) return;
    this.saving.set(true);
    this.dialogError.set(null);
    const request: Observable<unknown> =
      target.kind === 'plan'
        ? this.api.deleteWebsitePlan(target.id)
        : this.api.deleteWebsiteAddon(target.id);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.deleting.set(null);
        this.toast.success(`${target.name} deleted.`);
        this.load();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.dialogError.set(apiErrorMessage(err, 'Could not delete it.'));
      },
    });
  }

  closeDialogs(): void {
    if (this.saving()) return;
    this.planForm.set(null);
    this.addonForm.set(null);
    this.deleting.set(null);
  }
}
