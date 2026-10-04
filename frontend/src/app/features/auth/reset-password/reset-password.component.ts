import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../../core/services/api-error.util';
import { AuthApiService } from '../../../core/services/auth-api.service';
import { AuthFormErrorStateMatcher, PASSWORD_HINT } from '../auth-form.util';
import { AuthShellComponent } from '../auth-shell.component';

@Component({
  selector: 'dp-reset-password',
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
  templateUrl: './reset-password.component.html',
})
export class ResetPasswordComponent implements OnInit {
  password = '';
  confirmPassword = '';
  hidePassword = true;
  readonly passwordHint = PASSWORD_HINT;

  private readonly authApi = inject(AuthApiService);
  private readonly route = inject(ActivatedRoute);
  private token = '';

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly missingToken = signal(false);

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    this.missingToken.set(!this.token);
  }

  submit(): void {
    this.errorMessage.set(null);
    if (!this.password || !this.confirmPassword) return;
    if (this.password !== this.confirmPassword) {
      this.errorMessage.set('Passwords do not match.');
      return;
    }

    this.loading.set(true);
    this.authApi
      .resetPassword({
        token: this.token,
        password: this.password,
        confirmPassword: this.confirmPassword,
      })
      .subscribe({
        next: (res) => {
          this.successMessage.set(res.message);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.errorMessage.set(apiErrorMessage(err, 'Could not reset your password.'));
          this.loading.set(false);
        },
      });
  }
}
