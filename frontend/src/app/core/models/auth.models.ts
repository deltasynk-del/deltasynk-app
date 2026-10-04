import { Requires2faResponse } from './two-factor.models';

export type { Requires2faResponse } from './two-factor.models';

export interface SessionUser {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  role: string;
  permissions: string[];
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
}

export interface AuthTokenResponse {
  accessToken: string;
  user: SessionUser;
}

export type LoginResult = AuthTokenResponse | Requires2faResponse;

export interface PortalSession {
  accessToken: string;
  user: SessionUser;
}
