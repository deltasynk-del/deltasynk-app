import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Permission } from '../../core/config/permissions';
import { HardwareItem, HardwareStatus, WEBSITE_SERVICES } from '../../core/models/portal.models';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { AuthService } from '../../core/services/auth.service';
import { PortalApiService } from '../../core/services/portal-api.service';
import { ToastService } from '../../core/services/toast.service';
import { ModalComponent } from '../../shared/modal.component';

type Tab = HardwareStatus | '';

const STATUS_LABELS: Record<HardwareStatus, string> = {
  REQUESTED: 'To hand over',
  ISSUED: 'Handed over',
  RETURNED: 'Returned',
  CANCELLED: 'Cancelled',
};

/** Equipment customers chose on the website when they signed up, followed through hand-over. */
@Component({
  selector: 'dp-hardware',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, MatIconModule, ModalComponent],
  templateUrl: './hardware.component.html',
})
export class HardwareComponent implements OnInit {
  private readonly api = inject(PortalApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly canManage = computed(() => this.auth.can(Permission.HARDWARE_MANAGE));
  readonly tabs: { value: Tab; label: string }[] = [
    { value: 'REQUESTED', label: STATUS_LABELS.REQUESTED },
    { value: 'ISSUED', label: STATUS_LABELS.ISSUED },
    { value: 'RETURNED', label: STATUS_LABELS.RETURNED },
    { value: 'CANCELLED', label: STATUS_LABELS.CANCELLED },
    { value: '', label: 'All' },
  ];
  readonly statuses = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));

  readonly tab = signal<Tab>('REQUESTED');
  readonly all = signal<HardwareItem[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly rows = computed(() => {
    const tab = this.tab();
    return tab ? this.all().filter((item) => item.status === tab) : this.all();
  });

  readonly editing = signal<HardwareItem | null>(null);
  readonly saving = signal(false);
  readonly dialogError = signal<string | null>(null);
  status: HardwareStatus = 'REQUESTED';
  serialNumber = '';
  shopSlug = '';
  notes = '';

  ngOnInit(): void {
    this.load();
  }

  statusLabel(status: HardwareStatus): string {
    return STATUS_LABELS[status];
  }

  serviceLabel(service: string): string {
    return WEBSITE_SERVICES.find((s) => s.value === service)?.label ?? service;
  }

  countFor(tab: Tab): number {
    return tab ? this.all().filter((item) => item.status === tab).length : this.all().length;
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.hardware({}).subscribe({
      next: (items) => {
        this.all.set(items);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(apiErrorMessage(err, 'Could not load hardware requests from the website.'));
        this.loading.set(false);
      },
    });
  }

  open(item: HardwareItem): void {
    this.status = item.status;
    this.serialNumber = item.serialNumber ?? '';
    this.shopSlug = item.shopSlug ?? '';
    this.notes = item.notes ?? '';
    this.dialogError.set(null);
    this.editing.set(item);
  }

  close(): void {
    if (!this.saving()) this.editing.set(null);
  }

  save(): void {
    const item = this.editing();
    if (!item) return;
    if (this.status === 'ISSUED' && !this.serialNumber.trim()) {
      this.dialogError.set('Enter the serial number of the item that was handed over.');
      return;
    }
    this.saving.set(true);
    this.dialogError.set(null);
    this.api
      .updateHardware(item.id, {
        status: this.status,
        // The website keeps the current value when a field is left out, so only filled fields are sent.
        ...(this.serialNumber.trim() ? { serialNumber: this.serialNumber.trim() } : {}),
        ...(this.shopSlug.trim() ? { shopSlug: this.shopSlug.trim() } : {}),
        ...(this.notes.trim() ? { notes: this.notes.trim() } : {}),
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.editing.set(null);
          this.toast.success(`${updated.addonName}: ${STATUS_LABELS[updated.status].toLowerCase()}.`);
          this.load();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.dialogError.set(apiErrorMessage(err, 'Could not save the change.'));
        },
      });
  }
}
