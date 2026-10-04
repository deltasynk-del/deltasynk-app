export type TwoFactorMethod = 'totp' | 'email' | 'sms';
export type LoginTwoFactorMethod = TwoFactorMethod | 'recovery';

export interface TwoFactorStatus {
  enabled: boolean;
  primaryMethod: TwoFactorMethod | null;
  methods: {
    totp: { confirmed: boolean };
    email: { confirmed: boolean };
    sms: { confirmed: boolean; phone: string | null };
  };
  recoveryCodesRemaining: number;
  lastUsedAt: string | null;
  lastUsedMethod: TwoFactorMethod | null;
}

export interface TotpInitResponse {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
}

export interface ActivateResponse {
  status: TwoFactorStatus;
  recoveryCodes?: string[];
}

export interface SendCodeResponse {
  message: string;
  devCode?: string;
}

/** Login response when the account has 2FA enabled. */
export interface Requires2faResponse {
  requires2fa: true;
  pendingToken: string;
  methods: TwoFactorMethod[];
  primaryMethod: TwoFactorMethod | null;
  maskedEmail: string;
  maskedPhone: string;
  recoveryAvailable: boolean;
}
