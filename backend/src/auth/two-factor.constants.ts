export const CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const MAX_CHALLENGE_ATTEMPTS = 5;
export const OTP_DIGITS = 6;
export const RECOVERY_CODE_COUNT = 10;
export const PENDING_TOKEN_TTL = '10m';
export const PENDING_TOKEN_PURPOSE = 'twofa';
export const TOTP_ISSUER = 'DeltaSynk Portal';

/** Wrong passwords / codes allowed before the account is paused. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

/** j***@example.com */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

/** 2557******89 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\s+/g, '');
  if (digits.length <= 4) return digits;
  const head = digits.slice(0, 4);
  const tail = digits.slice(-2);
  return `${head}${'*'.repeat(Math.max(digits.length - 6, 1))}${tail}`;
}
