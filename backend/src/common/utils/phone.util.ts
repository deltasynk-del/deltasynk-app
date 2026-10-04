/**
 * Canonical phone form stored on users: digits only, with country code
 * (0712345678 / 712345678 / +255 712 345 678 → 255712345678).
 * Returns null when the input cannot be a phone number.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith('0')) {
    return `255${digits.slice(1)}`;
  }
  if (digits.length === 9 && /^[67]/.test(digits)) {
    return `255${digits}`;
  }
  if (digits.length >= 11 && digits.length <= 15) {
    return digits;
  }
  return null;
}
