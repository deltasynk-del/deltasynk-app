import { SetMetadata } from '@nestjs/common';
import { Permission } from '../../access/permissions';

export const IS_PUBLIC_KEY = 'access:public';
export const ANY_USER_KEY = 'access:anyUser';
export const PERMISSIONS_KEY = 'access:permissions';
export const ALLOW_PASSWORD_PENDING_KEY = 'access:allowPasswordPending';

/** No portal login needed (sign-in, health, and app-to-portal routes with their own key). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Any signed-in user, whatever their role (own profile, own security settings). */
export const AnyUser = () => SetMetadata(ANY_USER_KEY, true);

/** Signed-in user holding ALL of the listed permissions. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Still reachable while the user is being forced to replace a temporary password. */
export const AllowPasswordChangePending = () =>
  SetMetadata(ALLOW_PASSWORD_PENDING_KEY, true);
