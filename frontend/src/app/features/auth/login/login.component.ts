import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { AuthTokenResponse, LoginResult } from '../../../core/models/auth.models';
import {
  LoginTwoFactorMethod,
  Requires2faResponse,
  TwoFactorMethod,
} from '../../../core/models/two-factor.models';
import { apiErrorMessage } from '../../../core/services/api-error.util';
import { AuthApiService } from '../../../core/services/auth-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { AuthFormErrorStateMatcher } from '../auth-form.util';
import { AuthShellComponent } from '../auth-shell.component';

interface TwoFactorChallengeState {
  pendingToken: string;
  methods: TwoFactorMethod[];
  method: LoginTwoFactorMethod;
  maskedEmail: string;
  maskedPhone: string;
  recoveryAvailable: boolean;
  codeSent: boolean;
  devCode: string | null;
  sending: boolean;
}

const METHOD_LABELS: Record<LoginTwoFactorMethod, string> = {
  totp: 'Authenticator app',
  email: 'Email code',
  sms: 'SMS code',
  recovery: 'Recovery code',
};

@Component({
  selector: 'dp-login',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    AuthShellComponent,
  ],
  providers: [{ provide: ErrorStateMatcher, useClass: AuthFormErrorStateMatcher }],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  identifier = '';
  password = '';
  staySignedIn = false;
  hidePassword = true;
  twoFactorCode = '';

  private readonly authApi = inject(AuthApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly methodLabels = METHOD_LABELS;
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly twoFactor = signal<TwoFactorChallengeState | null>(null);

  signIn(): void {
    this.errorMessage.set(null);
    if (!this.identifier.trim() || !this.password) return;

    this.loading.set(true);
    this.authApi.login(this.identifier.trim(), this.password).subscribe({
      next: (result) => this.handleLoginResult(result),
      error: (err: unknown) => {
        this.errorMessage.set(apiErrorMessage(err, 'Sign in failed.'));
        this.loading.set(false);
      },
    });
  }

  // --- Two-factor challenge -------------------------------------------------

  private startTwoFactor(challenge: Requires2faResponse): void {
    const method: LoginTwoFactorMethod =
      challenge.primaryMethod ?? challenge.methods[0] ?? 'totp';
    this.twoFactor.set({
      pendingToken: challenge.pendingToken,
      methods: challenge.methods,
      method,
      maskedEmail: challenge.maskedEmail,
      maskedPhone: challenge.maskedPhone,
      recoveryAvailable: challenge.recoveryAvailable,
      codeSent: false,
      devCode: null,
      sending: false,
    });
    this.twoFactorCode = '';
    this.loading.set(false);
    if (method === 'email' || method === 'sms') {
      this.sendTwoFactorCode();
    }
  }

  selectMethod(method: LoginTwoFactorMethod): void {
    const state = this.twoFactor();
    if (!state || state.method === method) return;
    this.errorMessage.set(null);
    this.twoFactorCode = '';
    this.twoFactor.set({ ...state, method, codeSent: false, devCode: null });
    if (method === 'email' || method === 'sms') {
      this.sendTwoFactorCode();
    }
  }

  sendTwoFactorCode(): void {
    const state = this.twoFactor();
    if (!state || (state.method !== 'email' && state.method !== 'sms')) return;
    this.errorMessage.set(null);
    this.twoFactor.set({ ...state, sending: true });
    this.authApi.send2faLoginCode(state.pendingToken, state.method).subscribe({
      next: (res) => {
        const current = this.twoFactor();
        if (!current) return;
        this.twoFactor.set({
          ...current,
          codeSent: true,
          sending: false,
          devCode: res.devCode ?? null,
        });
      },
      error: (err: unknown) => {
        const current = this.twoFactor();
        if (current) this.twoFactor.set({ ...current, sending: false });
        this.errorMessage.set(apiErrorMessage(err, 'Could not send the code.'));
      },
    });
  }

  submitTwoFactor(): void {
    const state = this.twoFactor();
    const code = this.twoFactorCode.trim();
    if (!state || !code) return;
    this.errorMessage.set(null);
    this.loading.set(true);
    this.authApi.verify2faLogin(state.pendingToken, state.method, code).subscribe({
      next: (token) => this.handleToken(token),
      error: (err: unknown) => {
        this.errorMessage.set(apiErrorMessage(err, 'Verification failed.'));
        this.loading.set(false);
      },
    });
  }

  cancelTwoFactor(): void {
    this.twoFactor.set(null);
    this.twoFactorCode = '';
    this.password = '';
    this.errorMessage.set(null);
    this.loading.set(false);
  }

  // --- Result handling ---------------------------------------------------

  private handleLoginResult(result: LoginResult): void {
    if ('requires2fa' in result && result.requires2fa) {
      this.startTwoFactor(result);
      return;
    }
    this.handleToken(result as AuthTokenResponse);
  }

  private handleToken(result: AuthTokenResponse): void {
    this.auth.startSession(result, this.staySignedIn);
    void this.router.navigateByUrl(
      result.user.mustChangePassword ? '/auth/change-password' : this.auth.homeRoute(),
    );
  }
}
