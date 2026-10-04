import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../../core/services/api-error.util';
import { AuthApiService } from '../../../core/services/auth-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthFormErrorStateMatcher, PASSWORD_HINT } from '../auth-form.util';
import { AuthShellComponent } from '../auth-shell.component';

@Component({
  selector: 'dp-change-password',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    AuthShellComponent,
  ],
  providers: [{ provide: ErrorStateMatcher, useClass: AuthFormErrorStateMatcher }],
  templateUrl: './change-password.component.html',
})
export class ChangePasswordComponent {
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  hidePassword = true;
  readonly passwordHint = PASSWORD_HINT;

  private readonly authApi = inject(AuthApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  /** True on first sign-in with a temporary password: the user cannot skip this screen. */
  readonly forced = computed(() => this.auth.user()?.mustChangePassword ?? false);

  submit(): void {
    this.errorMessage.set(null);
    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) return;
    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage.set('New passwords do not match.');
      return;
    }

    this.loading.set(true);
    this.authApi
      .changePassword({
        currentPassword: this.currentPassword,
        newPassword: this.newPassword,
        confirmPassword: this.confirmPassword,
      })
      .subscribe({
        next: (res) => {
          // Other devices are signed out; this one continues on the new token.
          this.auth.replaceToken(res);
          this.toast.success(res.message);
          void this.router.navigateByUrl(this.auth.homeRoute());
        },
        error: (err: unknown) => {
          this.errorMessage.set(apiErrorMessage(err, 'Could not change your password.'));
          this.loading.set(false);
        },
      });
  }

  signOut(): void {
    this.auth.signOut();
  }
}
