import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ROLE_LABELS } from '../../core/config/permissions';
import {
  ActivateResponse,
  TwoFactorMethod,
  TwoFactorStatus,
} from '../../core/models/two-factor.models';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { AuthApiService } from '../../core/services/auth-api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { TwoFactorApiService } from '../../core/services/two-factor-api.service';
import { copyText } from '../../shared/labels';
import { ModalComponent } from '../../shared/modal.component';

interface MethodInfo {
  method: TwoFactorMethod;
  icon: string;
  label: string;
  description: string;
}

const METHODS: MethodInfo[] = [
  {
    method: 'totp',
    icon: 'phonelink_lock',
    label: 'Authenticator app',
    description: 'Codes from Google Authenticator, Microsoft Authenticator or similar. Works offline — the safest option.',
  },
  {
    method: 'email',
    icon: 'mail',
    label: 'Email code',
    description: 'A 6-digit code sent to your account email each time you sign in.',
  },
  {
    method: 'sms',
    icon: 'sms',
    label: 'SMS code',
    description: 'A 6-digit code sent by SMS to your phone each time you sign in.',
  },
];

/** Setting up one method: for SMS the phone is asked first, then the code. */
interface SetupState {
  method: TwoFactorMethod;
  step: 'phone' | 'code';
  qrDataUrl?: string;
  secret?: string;
  devCode?: string;
}

/** Actions that need the password (and, except for new recovery codes, a current code). */
interface SecureAction {
  kind: 'disable' | 'remove' | 'recovery';
  method?: TwoFactorMethod;
}

@Component({
  selector: 'dp-account',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, MatIconModule, ModalComponent],
  templateUrl: './account.component.html',
})
export class AccountComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly authApi = inject(AuthApiService);
  private readonly twoFactorApi = inject(TwoFactorApiService);
  private readonly toast = inject(ToastService);

  readonly methods = METHODS;
  readonly user = this.auth.user;
  readonly roleLabel = computed(() => ROLE_LABELS[this.user()?.role ?? ''] ?? '');

  // Profile
  fullName = '';
  phone = '';
  readonly savingProfile = signal(false);
  readonly profileError = signal<string | null>(null);

  // Two-step verification
  readonly status = signal<TwoFactorStatus | null>(null);
  readonly statusError = signal<string | null>(null);
  readonly setup = signal<SetupState | null>(null);
  readonly action = signal<SecureAction | null>(null);
  readonly busy = signal(false);
  readonly dialogError = signal<string | null>(null);
  readonly devCode = signal<string | null>(null);
  readonly recoveryCodes = signal<string[] | null>(null);
  readonly copied = signal(false);
  code = '';
  password = '';
  smsPhone = '';

  ngOnInit(): void {
    const user = this.user();
    this.fullName = user?.fullName ?? '';
    this.phone = user?.phone ? `+${user.phone}` : '';
    this.loadStatus();
  }

  // --- Profile ---------------------------------------------------------------

  saveProfile(): void {
    if (this.fullName.trim().length < 2) {
      this.profileError.set('Enter your full name.');
      return;
    }
    this.savingProfile.set(true);
    this.profileError.set(null);
    this.authApi
      .updateProfile({ fullName: this.fullName.trim(), phone: this.phone.trim() })
      .subscribe({
        next: (user) => {
          this.auth.updateUser(user);
          this.phone = user.phone ? `+${user.phone}` : '';
          this.savingProfile.set(false);
          this.toast.success('Profile saved.');
        },
        error: (err: unknown) => {
          this.savingProfile.set(false);
          this.profileError.set(apiErrorMessage(err, 'Could not save your profile.'));
        },
      });
  }

  // --- Two-step: status ------------------------------------------------------

  private loadStatus(): void {
    this.twoFactorApi.status().subscribe({
      next: (status) => this.applyStatus(status),
      error: (err: unknown) =>
        this.statusError.set(apiErrorMessage(err, 'Could not load two-step verification.')),
    });
  }

  private applyStatus(status: TwoFactorStatus): void {
    this.status.set(status);
    this.statusError.set(null);
    const user = this.user();
    if (user && user.twoFactorEnabled !== status.enabled) {
      this.auth.updateUser({ ...user, twoFactorEnabled: status.enabled });
    }
  }

  isSetUp(method: TwoFactorMethod): boolean {
    return this.status()?.methods[method].confirmed ?? false;
  }

  /** Email/SMS methods that can deliver a confirmation code for a secure action. */
  readonly codeChannels = computed(() =>
    (['email', 'sms'] as const).filter((m) => this.status()?.methods[m].confirmed),
  );

  // --- Two-step: setup -------------------------------------------------------

  startSetup(method: TwoFactorMethod): void {
    this.code = '';
    this.dialogError.set(null);
    if (method === 'sms') {
      this.smsPhone = this.user()?.phone ? `+${this.user()!.phone}` : '';
      this.setup.set({ method, step: 'phone' });
      return;
    }
    this.busy.set(true);
    if (method === 'totp') {
      this.twoFactorApi.totpInit().subscribe({
        next: (res) => {
          this.busy.set(false);
          this.setup.set({ method, step: 'code', qrDataUrl: res.qrDataUrl, secret: res.secret });
        },
        error: (err: unknown) => this.setupFailed(err),
      });
    } else {
      this.twoFactorApi.emailInit().subscribe({
        next: (res) => {
          this.busy.set(false);
          this.setup.set({ method, step: 'code', devCode: res.devCode });
        },
        error: (err: unknown) => this.setupFailed(err),
      });
    }
  }

  private setupFailed(err: unknown): void {
    this.busy.set(false);
    this.toast.error(apiErrorMessage(err, 'Could not start setup.'));
  }

  sendSmsSetupCode(): void {
    this.busy.set(true);
    this.dialogError.set(null);
    this.twoFactorApi.smsInit(this.smsPhone.trim() || undefined).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.setup.set({ method: 'sms', step: 'code', devCode: res.devCode });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.dialogError.set(apiErrorMessage(err, 'Could not send the code.'));
      },
    });
  }

  confirmSetup(): void {
    const setup = this.setup();
    const code = this.code.trim();
    if (!setup || code.length < 4) return;
    this.busy.set(true);
    this.dialogError.set(null);
    const request =
      setup.method === 'totp'
        ? this.twoFactorApi.totpActivate(code)
        : setup.method === 'email'
          ? this.twoFactorApi.emailActivate(code)
          : this.twoFactorApi.smsActivate(code);
    request.subscribe({
      next: (res: ActivateResponse) => {
        this.busy.set(false);
        this.setup.set(null);
        this.applyStatus(res.status);
        if (res.recoveryCodes) {
          // First method: two-step verification is now on. Recovery codes are shown once.
          this.showRecoveryCodes(res.recoveryCodes);
        } else {
          this.toast.success('Method added.');
        }
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.dialogError.set(apiErrorMessage(err, 'That code did not work.'));
      },
    });
  }

  closeSetup(): void {
    if (!this.busy()) this.setup.set(null);
  }

  makePrimary(method: TwoFactorMethod): void {
    this.twoFactorApi.setPrimary(method).subscribe({
      next: (status) => {
        this.applyStatus(status);
        this.toast.success('Default method changed.');
      },
      error: (err: unknown) => this.toast.error(apiErrorMessage(err, 'Could not change it.')),
    });
  }

  // --- Two-step: password-protected actions ----------------------------------

  openAction(action: SecureAction): void {
    this.password = '';
    this.code = '';
    this.devCode.set(null);
    this.dialogError.set(null);
    this.action.set(action);
  }

  closeAction(): void {
    if (!this.busy()) this.action.set(null);
  }

  sendActionCode(channel: 'email' | 'sms'): void {
    this.twoFactorApi.sendCode(channel).subscribe({
      next: (res) => {
        this.devCode.set(res.devCode ?? null);
        this.toast.info(res.devCode ? 'Development code shown in the dialog.' : 'Code sent.');
      },
      error: (err: unknown) => this.dialogError.set(apiErrorMessage(err, 'Could not send a code.')),
    });
  }

  runAction(): void {
    const action = this.action();
    if (!action || !this.password) return;
    const code = this.code.trim();
    if (action.kind !== 'recovery' && code.length < 4) {
      this.dialogError.set('Enter a current verification code or a recovery code.');
      return;
    }
    this.busy.set(true);
    this.dialogError.set(null);
    const fail = (err: unknown) => {
      this.busy.set(false);
      this.dialogError.set(apiErrorMessage(err, 'Could not complete that.'));
    };

    if (action.kind === 'recovery') {
      this.twoFactorApi.regenerateRecoveryCodes(this.password).subscribe({
        next: (res) => {
          this.busy.set(false);
          this.action.set(null);
          this.showRecoveryCodes(res.recoveryCodes);
          this.loadStatus();
        },
        error: fail,
      });
      return;
    }

    const request =
      action.kind === 'disable'
        ? this.twoFactorApi.disable(this.password, code)
        : this.twoFactorApi.removeMethod(action.method!, this.password, code);
    request.subscribe({
      next: (status) => {
        this.busy.set(false);
        this.action.set(null);
        this.applyStatus(status);
        this.toast.success(
          status.enabled ? 'Method removed.' : 'Two-step verification turned off.',
        );
      },
      error: fail,
    });
  }

  // --- Recovery codes --------------------------------------------------------

  private showRecoveryCodes(codes: string[]): void {
    this.copied.set(false);
    this.recoveryCodes.set(codes);
  }

  async copyRecoveryCodes(): Promise<void> {
    const codes = this.recoveryCodes();
    if (codes) this.copied.set(await copyText(codes.join('\n')));
  }

  signOut(): void {
    this.auth.signOut();
  }
}
