import { Injectable, inject, signal } from '@angular/core';
import { DashboardSummary } from '../models/portal.models';
import { PortalApiService } from './portal-api.service';

/** Work waiting in each queue — shown as sidebar badges and on the dashboard. */
@Injectable({ providedIn: 'root' })
export class QueueCountsService {
  private readonly api = inject(PortalApiService);

  readonly summary = signal<DashboardSummary | null>(null);
  readonly loading = signal(false);
  readonly failed = signal(false);

  refresh(): void {
    this.loading.set(true);
    this.api.dashboard().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.failed.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  count(key: 'senderIds' | 'subscriptions' | 'topUps'): number {
    const s = this.summary();
    if (!s) return 0;
    if (key === 'senderIds') return s.senderIds?.pending ?? 0;
    return s[key]?.awaitingReview ?? 0;
  }

  clear(): void {
    this.summary.set(null);
  }
}
