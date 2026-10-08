import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { DashboardInsights, IncomeMonth } from '../../core/models/portal.models';
import { AuthService } from '../../core/services/auth.service';
import { PortalApiService } from '../../core/services/portal-api.service';
import { QueueCountsService } from '../../core/services/queue-counts.service';
import { appLabel, waitingFor } from '../../shared/labels';

const SUBSCRIBER_STATUSES: { key: string; label: string }[] = [
  { key: 'ACTIVE', label: 'Paying' },
  { key: 'TRIAL', label: 'On trial' },
  { key: 'PENDING_PAYMENT', label: 'Waiting to pay' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'SUSPENDED', label: 'Suspended' },
];

const HARDWARE_STATUSES: { key: string; label: string }[] = [
  { key: 'REQUESTED', label: 'To hand over' },
  { key: 'ISSUED', label: 'Handed over' },
  { key: 'RETURNED', label: 'Returned' },
];

interface QueueCard {
  title: string;
  icon: string;
  route: string;
  waiting: number;
  waitingLabel: string;
  detail: string;
  oldest: string;
  byApp: { app: string; count: number }[];
  footnote: string;
}

@Component({
  selector: 'dp-dashboard',
  standalone: true,
  imports: [RouterLink, MatIconModule, DatePipe, DecimalPipe],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(PortalApiService);
  readonly counts = inject(QueueCountsService);

  readonly insights = signal<DashboardInsights | null>(null);
  readonly insightsFailed = signal(false);
  readonly appLabel = appLabel;
  readonly subscriberStatuses = SUBSCRIBER_STATUSES;
  readonly hardwareStatuses = HARDWARE_STATUSES;

  /** Newest month first. */
  readonly incomeMonths = computed(() => [...(this.insights()?.income?.months ?? [])].reverse());

  readonly firstName = computed(() => this.auth.user()?.fullName.split(' ')[0] ?? '');
  readonly summary = this.counts.summary;

  /** One card per queue the user's role can see. */
  readonly cards = computed<QueueCard[]>(() => {
    const s = this.summary();
    if (!s) return [];
    const cards: QueueCard[] = [];
    const apps = (byApp: Record<string, number>) =>
      Object.entries(byApp).map(([app, count]) => ({ app: appLabel(app), count }));

    if (s.senderIds) {
      cards.push({
        title: 'Sender IDs',
        icon: 'badge',
        route: '/sender-ids',
        waiting: s.senderIds.pending,
        waitingLabel: 'waiting for approval',
        detail: '',
        oldest: waitingFor(s.senderIds.oldestPendingAt),
        byApp: apps(s.senderIds.byApp),
        footnote: s.senderIds.failedDeliveries
          ? `${s.senderIds.failedDeliveries} decision(s) could not be sent to the app`
          : '',
      });
    }
    const payments = [
      { stats: s.subscriptions, title: 'Subscriptions', icon: 'workspace_premium', route: '/subscriptions' },
      { stats: s.topUps, title: 'SMS top-ups', icon: 'sms', route: '/top-ups' },
    ];
    for (const { stats, title, icon, route } of payments) {
      if (!stats) continue;
      cards.push({
        title,
        icon,
        route,
        waiting: stats.awaitingReview,
        waitingLabel: 'waiting for verification',
        detail: stats.awaitingReview
          ? `TZS ${stats.awaitingAmount.toLocaleString('en-US')} to confirm`
          : '',
        oldest: waitingFor(stats.oldestAwaitingAt),
        byApp: apps(stats.byApp),
        footnote: `${stats.approvedThisMonth} verified this month · TZS ${stats.approvedAmountThisMonth.toLocaleString('en-US')}`,
      });
    }
    return cards;
  });

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.counts.refresh();
    this.insightsFailed.set(false);
    this.api.dashboardInsights().subscribe({
      next: (insights) => this.insights.set(insights),
      error: () => this.insightsFailed.set(true),
    });
  }

  total(month: IncomeMonth): number {
    return month.subscriptions + month.topUps;
  }

  /** "2026-10" → a date the template can format as "Oct 2026". */
  monthDate(month: string): Date {
    const [year, monthIndex] = month.split('-').map(Number);
    return new Date(year, monthIndex - 1, 1);
  }

  /** "+12%" / "−8%" against last month; empty when there is nothing to compare with. */
  change(now: number, before: number): string {
    if (!before) return '';
    const percent = Math.round(((now - before) / before) * 100);
    return `${percent >= 0 ? '+' : '−'}${Math.abs(percent)}% on last month`;
  }
}
