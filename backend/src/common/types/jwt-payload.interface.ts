import { PortalRole } from '@prisma/client';
import { Permission } from '../../access/permissions';

export interface JwtPayload {
  /** User id. */
  sub: string;
  role: PortalRole;
  /** Must match User.tokenVersion — lets us end every session of a user at once. */
  tv: number;
  /** Present only on short-lived pending 2FA tokens — never a valid access token. */
  purpose?: 'twofa';
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  role: PortalRole;
  permissions: Permission[];
  mustChangePassword: boolean;
}
