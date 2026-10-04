import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { APP_LABELS, Permission } from '../../core/config/permissions';
import { SenderIdRequest } from '../../core/models/portal.models';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { AuthService } from '../../core/services/auth.service';
import { PortalApiService } from '../../core/services/portal-api.service';
import { QueueCountsService } from '../../core/services/queue-counts.service';
import { ToastService } from '../../core/services/toast.service';
import { appLabel } from '../../shared/labels';
import { ModalComponent } from '../../shared/modal.component';
import { PagerComponent } from '../../shared/pager.component';

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED' | '';

@Component({
  selector: 'dp-sender-ids',
  standalone: true,
  imports: [FormsModule, DatePipe, MatIconModule, ModalComponent, PagerComponent],
  templateUrl: './sender-ids.component.html',
})
export class SenderIdsComponent implements OnInit {
  private readonly api = inject(PortalApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly counts = inject(QueueCountsService);

  readonly tabs: { value: Tab; label: string }[] = [
    { value: 'PENDING', label: 'Waiting' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: '', label: 'All' },
  ];
  readonly apps = Object.entries(APP_LABELS).map(([value, label]) => ({ value, label }));
  readonly appLabel = appLabel;
  readonly canReview = computed(() => this.auth.can(Permission.SENDER_IDS_REVIEW));

  readonly tab = signal<Tab>('PENDING');
  readonly rows = signal<SenderIdRequest[]>([]);
  readonly tabCounts = signal<Record<string, number>>({});
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = 25;
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  app = '';
  search = '';

  /** The request being approved / rejected in the dialog. */
  readonly reviewing = signal<{ row: SenderIdRequest; approve: boolean } | null>(null);
  readonly saving = signal(false);
  readonly dialogError = signal<string | null>(null);
  note = '';

  ngOnInit(): void {
    this.load();
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    this.page.set(1);
    this.load();
  }

  applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  goTo(page: number): void {
    this.page.set(page);
    this.load();
  }

  countFor(tab: Tab): number | null {
    return tab ? (this.tabCounts()[tab] ?? 0) : null;
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api
      .senderIds({
        status: this.tab(),
        app: this.app,
        q: this.search.trim(),
        page: this.page(),
        pageSize: this.pageSize,
      })
      .subscribe({
        next: (res) => {
          this.rows.set(res.items);
          this.total.set(res.total);
          this.tabCounts.set(res.counts ?? {});
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loadError.set(apiErrorMessage(err, 'Could not load sender ID requests.'));
          this.loading.set(false);
        },
      });
  }

  openReview(row: SenderIdRequest, approve: boolean): void {
    this.note = '';
    this.dialogError.set(null);
    this.reviewing.set({ row, approve });
  }

  closeReview(): void {
    if (!this.saving()) this.reviewing.set(null);
  }

  submitReview(): void {
    const review = this.reviewing();
    if (!review) return;
    const note = this.note.trim();
    if (!review.approve && note.length < 3) {
      this.dialogError.set('Say why it is rejected — the customer sees this reason.');
      return;
    }

    this.saving.set(true);
    this.dialogError.set(null);
    const request = review.approve
      ? this.api.approveSenderId(review.row.id, note)
      : this.api.rejectSenderId(review.row.id, note);
    request.subscribe({
      next: (row) => {
        this.saving.set(false);
        this.reviewing.set(null);
        if (row.deliveryStatus === 'FAILED') {
          this.toast.error(
            `Decision saved, but ${appLabel(row.app)} could not be told: ${row.deliveryError}`,
          );
        } else {
          this.toast.success(
            `${row.senderId} ${review.approve ? 'approved' : 'rejected'} for ${row.tenantName}.`,
          );
        }
        this.load();
        this.counts.refresh();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.dialogError.set(apiErrorMessage(err, 'Could not save the decision.'));
        // Someone else decided it first — show the current state.
        if ((err as { status?: number }).status === 409) this.load();
      },
    });
  }

  retry(row: SenderIdRequest): void {
    this.api.retrySenderIdDelivery(row.id).subscribe({
      next: (updated) => {
        if (updated.deliveryStatus === 'DELIVERED') {
          this.toast.success(`${appLabel(updated.app)} now has the decision.`);
        } else {
          this.toast.error(updated.deliveryError ?? 'Still could not reach the app.');
        }
        this.load();
        this.counts.refresh();
      },
      error: (err: unknown) => this.toast.error(apiErrorMessage(err, 'Could not retry.')),
    });
  }
}
