import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Sign-in and recovery calls carry no session and their 401s are shown in the form. */
const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/forgot-password', '/auth/reset-password'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.getAccessToken();
  const isPublic = PUBLIC_AUTH_PATHS.some((path) => req.url.includes(path));

  const authedReq =
    token && !isPublic
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authedReq).pipe(
    catchError((err: { status?: number; error?: { code?: string } }) => {
      if (err.status === 403 && err.error?.code === 'PASSWORD_CHANGE_REQUIRED') {
        if (!router.url.startsWith('/auth/change-password')) {
          void router.navigateByUrl('/auth/change-password');
        }
      }
      // /auth/change-password and /auth/2fa answer 401 for a wrong password or code — not a dead session.
      if (err.status === 401 && !isPublic && !/\/auth\/(change-password|2fa)/.test(req.url)) {
        auth.handleUnauthorized();
      }
      return throwError(() => err);
    }),
  );
};
