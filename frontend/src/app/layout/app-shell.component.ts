import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { NAV_SECTIONS } from '../core/config/nav.config';
import { ROLE_LABELS } from '../core/config/permissions';
import { AuthService } from '../core/services/auth.service';
import { QueueCountsService } from '../core/services/queue-counts.service';

@Component({
  selector: 'dp-app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly counts = inject(QueueCountsService);

  readonly user = this.auth.user;
  readonly menuOpen = signal(false);
  readonly roleLabel = computed(() => ROLE_LABELS[this.user()?.role ?? ''] ?? '');

  /** Only the pages this user's role can open. */
  readonly navSections = computed(() => {
    const permissions = this.auth.permissions();
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => permissions.includes(item.permission)),
    })).filter((section) => section.items.length > 0);
  });

  /** The page being shown, for the top bar. */
  readonly pageTitle = signal('');
  /** Everything waiting for a decision, across the queues this user can see. */
  readonly waiting = computed(
    () => this.counts.count('senderIds') + this.counts.count('subscriptions') + this.counts.count('topUps'),
  );
  readonly currentYear = new Date().getFullYear();

  private navSub?: Subscription;

  ngOnInit(): void {
    document.body.classList.add('portal-shell-active');
    this.counts.refresh();
    this.updatePageTitle();
    this.navSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        this.menuOpen.set(false);
        this.updatePageTitle();
      });
  }

  private updatePageTitle(): void {
    const path = this.router.url.split(/[?#]/)[0];
    const item = NAV_SECTIONS.flatMap((section) => section.items).find(
      (i) => path === i.route || path.startsWith(`${i.route}/`),
    );
    this.pageTitle.set(item?.label ?? (path.startsWith('/account') ? 'My account & security' : ''));
  }

  ngOnDestroy(): void {
    document.body.classList.remove('portal-shell-active');
    this.navSub?.unsubscribe();
  }

  signOut(): void {
    this.counts.clear();
    this.auth.signOut();
  }
}
