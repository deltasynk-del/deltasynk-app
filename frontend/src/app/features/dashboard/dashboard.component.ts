import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { QueueCountsService } from '../../core/services/queue-counts.service';
import { appLabel, waitingFor } from '../../shared/labels';

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
  readonly counts = inject(QueueCountsService);

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
    this.counts.refresh();
  }
}
