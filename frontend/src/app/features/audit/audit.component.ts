import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuditEntry } from '../../core/models/portal.models';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { PortalApiService } from '../../core/services/portal-api.service';
import { PagerComponent } from '../../shared/pager.component';

@Component({
  selector: 'dp-audit',
  standalone: true,
  imports: [FormsModule, DatePipe, PagerComponent],
  templateUrl: './audit.component.html',
})
export class AuditComponent implements OnInit {
  private readonly api = inject(PortalApiService);

  /** Filter values are action-name prefixes. */
  readonly filters = [
    { value: '', label: 'Everything' },
    { value: 'sender_id.', label: 'Sender ID decisions' },
    { value: 'subscription.', label: 'Subscription decisions' },
    { value: 'topup.', label: 'Top-up decisions' },
    { value: 'user.', label: 'User changes' },
    { value: 'app.', label: 'Connected app changes' },
    { value: 'auth.', label: 'Sign-ins and security' },
  ];

  readonly rows = signal<AuditEntry[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = 50;
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  action = '';

  ngOnInit(): void {
    this.load();
  }

  applyFilter(): void {
    this.page.set(1);
    this.load();
  }

  goTo(page: number): void {
    this.page.set(page);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.audit({ page: this.page(), pageSize: this.pageSize, action: this.action }).subscribe({
      next: (res) => {
        this.rows.set(res.items);
        this.total.set(res.total);
        this.loadError.set(null);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(apiErrorMessage(err, 'Could not load the activity log.'));
        this.loading.set(false);
      },
    });
  }
}
