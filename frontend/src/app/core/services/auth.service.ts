import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, firstValueFrom, map, of, tap } from 'rxjs';
import { homeRouteFor } from '../config/nav.config';
import { Permission } from '../config/permissions';
import { AuthTokenResponse, PortalSession, SessionUser } from '../models/auth.models';
import { AuthApiService } from './auth-api.service';

const STORAGE_KEY = 'dsp_session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);

  private readonly sessionSignal = signal<PortalSession | null>(this.readStoredSession());
  private bootstrapPromise: Promise<boolean> | null = null;

  readonly session = this.sessionSignal.asReadonly();
  readonly user = computed(() => this.sessionSignal()?.user ?? null);
  readonly permissions = computed(() => this.sessionSignal()?.user.permissions ?? []);

  getAccessToken(): string | null {
    return this.sessionSignal()?.accessToken ?? null;
  }

  isAuthenticated(): boolean {
    return this.sessionSignal() !== null;
  }

  can(permission: Permission): boolean {
    return this.permissions().includes(permission);
  }

  homeRoute(): string {
    return homeRouteFor(this.permissions());
  }

  /** `remember` false keeps the session only until the browser tab closes. */
  startSession(token: AuthTokenResponse, remember: boolean): void {
    this.write({ accessToken: token.accessToken, user: token.user }, remember);
  }

  /** Swap in a fresh token (after a password change) without changing where it is stored. */
  replaceToken(token: AuthTokenResponse): void {
    this.write({ accessToken: token.accessToken, user: token.user }, this.isRemembered());
  }

  updateUser(user: SessionUser): void {
    const current = this.sessionSignal();
    if (!current) return;
    this.write({ ...current, user }, this.isRemembered());
  }

  clearSession(): void {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    this.sessionSignal.set(null);
    this.bootstrapPromise = null;
  }

  /** Validates the token with /auth/me once per page load and refreshes role + permissions. */
  ensureSession(): Promise<boolean> {
    if (!this.isAuthenticated()) {
      return Promise.resolve(false);
    }
    if (!this.bootstrapPromise) {
      this.bootstrapPromise = firstValueFrom(
        this.authApi.me().pipe(
          tap((user) => this.updateUser(user)),
          map(() => true),
          catchError(() => {
            this.clearSession();
            return of(false);
          }),
        ),
      );
    }
    return this.bootstrapPromise;
  }

  handleUnauthorized(): void {
    this.clearSession();
    void this.router.navigate(['/auth/login']);
  }

  signOut(): void {
    this.clearSession();
    window.location.href = '/auth/login';
  }

  private isRemembered(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  private write(session: PortalSession, remember: boolean): void {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(session));
    this.sessionSignal.set(session);
  }

  private readStoredSession(): PortalSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PortalSession;
      return parsed?.accessToken && parsed.user ? parsed : null;
    } catch {
      return null;
    }
  }
}
