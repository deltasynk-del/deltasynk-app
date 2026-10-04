import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActivateResponse,
  SendCodeResponse,
  TotpInitResponse,
  TwoFactorMethod,
  TwoFactorStatus,
} from '../models/two-factor.models';

@Injectable({ providedIn: 'root' })
export class TwoFactorApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/auth/2fa`;

  status(): Observable<TwoFactorStatus> {
    return this.http.get<TwoFactorStatus>(this.base);
  }

  totpInit(): Observable<TotpInitResponse> {
    return this.http.post<TotpInitResponse>(`${this.base}/totp/init`, {});
  }

  totpActivate(code: string): Observable<ActivateResponse> {
    return this.http.post<ActivateResponse>(`${this.base}/totp/activate`, { code });
  }

  emailInit(): Observable<SendCodeResponse> {
    return this.http.post<SendCodeResponse>(`${this.base}/email/init`, {});
  }

  emailActivate(code: string): Observable<ActivateResponse> {
    return this.http.post<ActivateResponse>(`${this.base}/email/activate`, { code });
  }

  smsInit(phone?: string): Observable<SendCodeResponse> {
    return this.http.post<SendCodeResponse>(`${this.base}/sms/init`, phone ? { phone } : {});
  }

  smsActivate(code: string): Observable<ActivateResponse> {
    return this.http.post<ActivateResponse>(`${this.base}/sms/activate`, { code });
  }

  /** Sends a code to an already set-up email/SMS method (to confirm removing or disabling). */
  sendCode(method: 'email' | 'sms'): Observable<SendCodeResponse> {
    return this.http.post<SendCodeResponse>(`${this.base}/code/${method}`, {});
  }

  setPrimary(method: TwoFactorMethod): Observable<TwoFactorStatus> {
    return this.http.patch<TwoFactorStatus>(`${this.base}/primary`, { method });
  }

  regenerateRecoveryCodes(password: string): Observable<{ recoveryCodes: string[] }> {
    return this.http.post<{ recoveryCodes: string[] }>(`${this.base}/recovery-codes`, {
      password,
    });
  }

  removeMethod(method: TwoFactorMethod, password: string, code: string): Observable<TwoFactorStatus> {
    return this.http.request<TwoFactorStatus>('DELETE', `${this.base}/method/${method}`, {
      body: { password, code },
    });
  }

  disable(password: string, code: string): Observable<TwoFactorStatus> {
    return this.http.post<TwoFactorStatus>(`${this.base}/disable`, { password, code });
  }
}
