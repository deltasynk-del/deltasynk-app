import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthTokenResponse, LoginResult, SessionUser } from '../models/auth.models';
import { LoginTwoFactorMethod, SendCodeResponse } from '../models/two-factor.models';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/auth`;

  /** `identifier` is an email address or a phone number. */
  login(identifier: string, password: string): Observable<LoginResult> {
    return this.http.post<LoginResult>(`${this.base}/login`, { identifier, password });
  }

  send2faLoginCode(pendingToken: string, method: 'email' | 'sms'): Observable<SendCodeResponse> {
    return this.http.post<SendCodeResponse>(`${this.base}/login/2fa/send`, {
      pendingToken,
      method,
    });
  }

  verify2faLogin(
    pendingToken: string,
    method: LoginTwoFactorMethod,
    code: string,
  ): Observable<AuthTokenResponse> {
    return this.http.post<AuthTokenResponse>(`${this.base}/login/2fa/verify`, {
      pendingToken,
      method,
      code,
    });
  }

  me(): Observable<SessionUser> {
    return this.http.get<SessionUser>(`${this.base}/me`);
  }

  updateProfile(body: { fullName: string; phone?: string }): Observable<SessionUser> {
    return this.http.patch<SessionUser>(`${this.base}/profile`, body);
  }

  forgotPassword(email: string): Observable<{ message: string; devResetUrl?: string }> {
    return this.http.post<{ message: string; devResetUrl?: string }>(
      `${this.base}/forgot-password`,
      { email },
    );
  }

  resetPassword(body: {
    token: string;
    password: string;
    confirmPassword: string;
  }): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/reset-password`, body);
  }

  changePassword(body: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Observable<AuthTokenResponse & { message: string }> {
    return this.http.post<AuthTokenResponse & { message: string }>(
      `${this.base}/change-password`,
      body,
    );
  }
}
