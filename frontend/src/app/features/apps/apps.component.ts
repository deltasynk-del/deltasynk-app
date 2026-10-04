import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Permission } from '../../core/config/permissions';
import { ConnectedApp } from '../../core/models/portal.models';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { AuthService } from '../../core/services/auth.service';
import { PortalApiService } from '../../core/services/portal-api.service';
import { ToastService } from '../../core/services/toast.service';
import { copyText } from '../../shared/labels';
import { ModalComponent } from '../../shared/modal.component';

@Component({
  selector: 'dp-apps',
  standalone: true,
  imports: [FormsModule, DatePipe, MatIconModule, ModalComponent],
  templateUrl: './apps.component.html',
})
export class AppsComponent implements OnInit {
  private readonly api = inject(PortalApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly canManage = computed(() => this.auth.can(Permission.APPS_MANAGE));
  readonly ingestUrl = `${window.location.origin}/api/v1/ingest`;

  readonly apps = signal<ConnectedApp[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);

  readonly confirmRotate = signal<ConnectedApp | null>(null);
  /** A freshly generated key — shown once. */
  readonly issuedKey = signal<{ app: string; key: string } | null>(null);
  readonly copied = signal(false);

  readonly editing = signal<ConnectedApp | null>(null);
  readonly formError = signal<string | null>(null);
  callbackBaseUrl = '';
  callbackKey = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.apps().subscribe({
      next: (apps) => {
        this.apps.set(apps);
        this.loadError.set(null);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(apiErrorMessage(err, 'Could not load connected apps.'));
        this.loading.set(false);
      },
    });
  }

  rotate(): void {
    const app = this.confirmRotate();
    if (!app) return;
    this.saving.set(true);
    this.api.rotateAppKey(app.code).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.confirmRotate.set(null);
        this.copied.set(false);
        this.issuedKey.set({ app: app.name, key: res.apiKey });
        this.load();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.confirmRotate.set(null);
        this.toast.error(apiErrorMessage(err, 'Could not generate a key.'));
      },
    });
  }

  async copyKey(): Promise<void> {
    const issued = this.issuedKey();
    if (issued) this.copied.set(await copyText(issued.key));
  }

  toggleActive(app: ConnectedApp): void {
    this.api.updateApp(app.code, { isActive: !app.isActive }).subscribe({
      next: (updated) => {
        this.toast.success(
          updated.isActive
            ? `${updated.name} can send requests again.`
            : `${updated.name} is blocked from sending requests.`,
        );
        this.load();
      },
      error: (err: unknown) => this.toast.error(apiErrorMessage(err, 'Could not update the app.')),
    });
  }

  openCallback(app: ConnectedApp): void {
    this.callbackBaseUrl = app.callbackBaseUrl ?? '';
    this.callbackKey = '';
    this.formError.set(null);
    this.editing.set(app);
  }

  saveCallback(): void {
    const app = this.editing();
    if (!app) return;
    this.saving.set(true);
    this.formError.set(null);
    this.api
      .updateApp(app.code, {
        callbackBaseUrl: this.callbackBaseUrl.trim(),
        // Blank keeps the stored key; it is never sent back to the browser.
        ...(this.callbackKey.trim() ? { callbackKey: this.callbackKey.trim() } : {}),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.editing.set(null);
          this.toast.success(`${app.name} connection saved.`);
          this.load();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.formError.set(apiErrorMessage(err, 'Could not save the connection.'));
        },
      });
  }
}
