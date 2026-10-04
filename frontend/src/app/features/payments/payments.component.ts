import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { APP_LABELS, Permission } from '../../core/config/permissions';
import { PaymentRequest, PaymentStatus } from '../../core/models/portal.models';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { AuthService } from '../../core/services/auth.service';
import { PaymentRoute, PortalApiService } from '../../core/services/portal-api.service';
import { QueueCountsService } from '../../core/services/queue-counts.service';
import { ToastService } from '../../core/services/toast.service';
import { appLabel } from '../../shared/labels';
import { ModalComponent } from '../../shared/modal.component';
import { PagerComponent } from '../../shared/pager.component';

type Tab = PaymentStatus | '';

const METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'Bank transfer',
  SELCOM: 'Selcom (mobile money)',
  CARD: 'Card',
};

/** One page for both subscription payments and SMS top-ups; the route data says which. */
@Component({
  selector: 'dp-payments',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, MatIconModule, ModalComponent, PagerComponent],
  templateUrl: './payments.component.html',
})
export class PaymentsComponent implements OnInit {
  private readonly api = inject(PortalApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly counts = inject(QueueCountsService);
  private readonly route = inject(ActivatedRoute);

  private readonly kind = this.route.snapshot.data['route'] as PaymentRoute;
  readonly isTopUps = this.kind === 'top-ups';
  readonly title = this.isTopUps ? 'SMS top-ups' : 'Subscriptions';
  readonly intro = this.isTopUps
    ? 'SMS credit purchases. Verify one once the money is in the account — the credits are then released in the customer’s app.'
    : 'Subscription payments from sign-ups and renewals. Verify one once the money is in the account — the plan is then activated in the customer’s app.';

  readonly tabs: { value: Tab; label: string }[] = [
    { value: 'SUBMITTED', label: 'To verify' },
    { value: 'PENDING', label: 'Not paid yet' },
    { value: 'APPROVED', label: 'Verified' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: '', label: 'All' },
  ];
  readonly apps = Object.entries(APP_LABELS).map(([value, label]) => ({ value, label }));
  readonly appLabel = appLabel;
  readonly canVerify = computed(() =>
    this.auth.can(this.route.snapshot.data['verifyPermission'] as Permission),
  );

  readonly tab = signal<Tab>('SUBMITTED');
  readonly rows = signal<PaymentRequest[]>([]);
  readonly tabCounts = signal<Record<string, number>>({});
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = 25;
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  app = '';
  search = '';

  readonly reviewing = signal<{ row: PaymentRequest; approve: boolean } | null>(null);
  readonly saving = signal(false);
  readonly dialogError = signal<string | null>(null);
  note = '';

  ngOnInit(): void {
    this.load();
  }

  methodLabel(method: string): string {
    return METHOD_LABELS[method] ?? method;
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

  isOpen(row: PaymentRequest): boolean {
    return row.status === 'PENDING' || row.status === 'SUBMITTED';
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api
      .payments(this.kind, {
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
          this.loadError.set(apiErrorMessage(err, 'Could not load payments.'));
          this.loading.set(false);
        },
      });
  }

  openReview(row: PaymentRequest, approve: boolean): void {
    this.note = '';
    this.dialogError.set(null);
    this.reviewing.set({ row, approve });
  }

  closeReview(): void {
    if (!this.saving()) this.reviewing.set(null);
  }

  /** No proof was submitted by the customer, so the verifier must say what they checked. */
  noteRequired(review: { row: PaymentRequest; approve: boolean }): boolean {
    return !review.approve || review.row.status === 'PENDING';
  }

  submitReview(): void {
    const review = this.reviewing();
    if (!review) return;
    const note = this.note.trim();
    if (this.noteRequired(review) && note.length < 3) {
      this.dialogError.set(
        review.approve
          ? 'Say how you confirmed the money was received.'
          : 'Say why it is rejected — the customer sees this reason.',
      );
      return;
    }

    this.saving.set(true);
    this.dialogError.set(null);
    const request = review.approve
      ? this.api.verifyPayment(this.kind, review.row.id, note)
      : this.api.rejectPayment(this.kind, review.row.id, note);
    request.subscribe({
      next: (row) => {
        this.saving.set(false);
        this.reviewing.set(null);
        this.toast.success(
          `${row.reference} ${review.approve ? 'verified' : 'rejected'} — ${row.currency} ${row.amount.toLocaleString('en-US')}.`,
        );
        this.load();
        this.counts.refresh();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.dialogError.set(apiErrorMessage(err, 'Could not save the decision.'));
        if ((err as { status?: number }).status === 409) this.load();
      },
    });
  }
}
