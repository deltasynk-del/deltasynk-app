import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Permission } from '../config/permissions';
import { AuthService } from '../services/auth.service';

/** Signed-in users only; anyone still on a temporary password is sent to replace it first. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated() || !(await auth.ensureSession())) {
    return router.createUrlTree(['/auth/login']);
  }
  if (auth.user()?.mustChangePassword && !state.url.startsWith('/auth/change-password')) {
    return router.createUrlTree(['/auth/change-password']);
  }
  return true;
};

/** Route-level access check: `data: { permission: Permission.X }`. */
export const permissionGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const required = route.data['permission'] as Permission | undefined;
  if (!required || auth.can(required)) return true;
  return router.createUrlTree([auth.homeRoute()]);
};

/** Keeps signed-in users away from the sign-in screen. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? router.createUrlTree([auth.homeRoute()]) : true;
};
