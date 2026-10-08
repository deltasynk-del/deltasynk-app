import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuditEntry,
  ConnectedApp,
  CreditShop,
  DashboardInsights,
  HardwareItem,
  DashboardSummary,
  Page,
  PaymentRequest,
  PortalUser,
  RoleDefinition,
  SenderIdRequest,
  WebsiteAddon,
  WebsitePlan,
} from '../models/portal.models';

export interface ListQuery {
  status?: string;
  app?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

/** `subscriptions` and `top-ups` are the same resource shape under two routes. */
export type PaymentRoute = 'subscriptions' | 'top-ups';

@Injectable({ providedIn: 'root' })
export class PortalApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  private params(query: object): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return params;
  }

  dashboard(): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${this.base}/dashboard`);
  }

  dashboardInsights(): Observable<DashboardInsights> {
    return this.http.get<DashboardInsights>(`${this.base}/dashboard/insights`);
  }

  // Website: pricing cards and equipment
  websitePlans(): Observable<WebsitePlan[]> {
    return this.http.get<WebsitePlan[]>(`${this.base}/website/plans`);
  }

  saveWebsitePlan(id: string | null, body: Partial<WebsitePlan>): Observable<WebsitePlan> {
    return id
      ? this.http.patch<WebsitePlan>(`${this.base}/website/plans/${id}`, body)
      : this.http.post<WebsitePlan>(`${this.base}/website/plans`, body);
  }

  deleteWebsitePlan(id: string): Observable<WebsitePlan> {
    return this.http.delete<WebsitePlan>(`${this.base}/website/plans/${id}`);
  }

  websiteAddons(): Observable<WebsiteAddon[]> {
    return this.http.get<WebsiteAddon[]>(`${this.base}/website/addons`);
  }

  saveWebsiteAddon(id: string | null, body: Partial<WebsiteAddon>): Observable<WebsiteAddon> {
    return id
      ? this.http.patch<WebsiteAddon>(`${this.base}/website/addons/${id}`, body)
      : this.http.post<WebsiteAddon>(`${this.base}/website/addons`, body);
  }

  deleteWebsiteAddon(id: string): Observable<WebsiteAddon> {
    return this.http.delete<WebsiteAddon>(`${this.base}/website/addons/${id}`);
  }

  // Equipment customers asked for at sign-up
  hardware(query: { status?: string; service?: string }): Observable<HardwareItem[]> {
    return this.http.get<HardwareItem[]>(`${this.base}/website/hardware`, { params: this.params(query) });
  }

  updateHardware(
    id: string,
    body: Partial<{ status: string; serialNumber: string; shopSlug: string; notes: string }>,
  ): Observable<HardwareItem> {
    return this.http.patch<HardwareItem>(`${this.base}/website/hardware/${id}`, body);
  }

  // Sender IDs
  senderIds(query: ListQuery): Observable<Page<SenderIdRequest>> {
    return this.http.get<Page<SenderIdRequest>>(`${this.base}/sender-ids`, {
      params: this.params(query),
    });
  }

  approveSenderId(id: string, note?: string): Observable<SenderIdRequest> {
    return this.http.post<SenderIdRequest>(`${this.base}/sender-ids/${id}/approve`, {
      ...(note ? { note } : {}),
    });
  }

  rejectSenderId(id: string, note: string): Observable<SenderIdRequest> {
    return this.http.post<SenderIdRequest>(`${this.base}/sender-ids/${id}/reject`, { note });
  }

  retrySenderIdDelivery(id: string): Observable<SenderIdRequest> {
    return this.http.post<SenderIdRequest>(`${this.base}/sender-ids/${id}/retry-delivery`, {});
  }

  // Payments
  payments(route: PaymentRoute, query: ListQuery): Observable<Page<PaymentRequest>> {
    return this.http.get<Page<PaymentRequest>>(`${this.base}/${route}`, {
      params: this.params(query),
    });
  }

  verifyPayment(route: PaymentRoute, id: string, note?: string): Observable<PaymentRequest> {
    return this.http.post<PaymentRequest>(`${this.base}/${route}/${id}/verify`, {
      ...(note ? { note } : {}),
    });
  }

  rejectPayment(route: PaymentRoute, id: string, note: string): Observable<PaymentRequest> {
    return this.http.post<PaymentRequest>(`${this.base}/${route}/${id}/reject`, { note });
  }

  // Users
  users(): Observable<PortalUser[]> {
    return this.http.get<PortalUser[]>(`${this.base}/users`);
  }

  roles(): Observable<RoleDefinition[]> {
    return this.http.get<RoleDefinition[]>(`${this.base}/users/roles`);
  }

  createUser(body: {
    fullName: string;
    email: string;
    phone?: string;
    role: string;
  }): Observable<{ user: PortalUser; temporaryPassword: string }> {
    return this.http.post<{ user: PortalUser; temporaryPassword: string }>(
      `${this.base}/users`,
      body,
    );
  }

  updateUser(
    id: string,
    body: Partial<{ fullName: string; email: string; phone: string; role: string; isActive: boolean }>,
  ): Observable<PortalUser> {
    return this.http.patch<PortalUser>(`${this.base}/users/${id}`, body);
  }

  resetUserPassword(id: string): Observable<{ temporaryPassword: string }> {
    return this.http.post<{ temporaryPassword: string }>(
      `${this.base}/users/${id}/reset-password`,
      {},
    );
  }

  resetUserTwoFactor(id: string): Observable<PortalUser> {
    return this.http.post<PortalUser>(`${this.base}/users/${id}/reset-2fa`, {});
  }

  unlockUser(id: string): Observable<PortalUser> {
    return this.http.post<PortalUser>(`${this.base}/users/${id}/unlock`, {});
  }

  // SMS credits given without a payment
  creditShops(q: string): Observable<CreditShop[]> {
    return this.http.get<CreditShop[]>(`${this.base}/sms-credits/shops`, { params: this.params({ q }) });
  }

  grantCredits(body: { shopId: string; units: number; note: string }): Observable<CreditShop> {
    return this.http.post<CreditShop>(`${this.base}/sms-credits/grants`, body);
  }

  // Connected apps
  apps(): Observable<ConnectedApp[]> {
    return this.http.get<ConnectedApp[]>(`${this.base}/apps`);
  }

  updateApp(
    code: string,
    body: Partial<{ isActive: boolean; callbackBaseUrl: string; callbackKey: string }>,
  ): Observable<ConnectedApp> {
    return this.http.patch<ConnectedApp>(`${this.base}/apps/${code}`, body);
  }

  rotateAppKey(code: string): Observable<{ app: ConnectedApp; apiKey: string }> {
    return this.http.post<{ app: ConnectedApp; apiKey: string }>(
      `${this.base}/apps/${code}/rotate-key`,
      {},
    );
  }

  // Audit
  audit(query: { page?: number; pageSize?: number; action?: string }): Observable<Page<AuditEntry>> {
    return this.http.get<Page<AuditEntry>>(`${this.base}/audit`, { params: this.params(query) });
  }
}
