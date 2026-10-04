import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../../core/services/api-error.util';
import { AuthApiService } from '../../../core/services/auth-api.service';
import { AuthFormErrorStateMatcher } from '../auth-form.util';
import { AuthShellComponent } from '../auth-shell.component';

@Component({
  selector: 'dp-forgot-password',
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
  templateUrl: './forgot-password.component.html',
})
export class ForgotPasswordComponent {
  email = '';

  private readonly authApi = inject(AuthApiService);

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly devResetUrl = signal<string | null>(null);

  submit(): void {
    this.errorMessage.set(null);
    if (!this.email.trim()) return;

    this.loading.set(true);
    this.authApi.forgotPassword(this.email.trim()).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.devResetUrl.set(res.devResetUrl ?? null);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.errorMessage.set(apiErrorMessage(err, 'Could not send the reset link.'));
        this.loading.set(false);
      },
    });
  }
}
