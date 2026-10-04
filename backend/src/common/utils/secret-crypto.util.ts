import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from 'crypto';

/**
 * AES-256-GCM for values that must be read back later (TOTP secrets, the
 * platform keys of connected apps). One-time codes and API keys we only need to
 * compare are sha256-hashed instead.
 *
 * The key comes from DATA_ENCRYPTION_KEY, or JWT_SECRET when that is unset.
 */
const KEY_CACHE = new Map<string, Buffer>();

function encryptionKey(): Buffer {
  const material =
    process.env.DATA_ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim();
  if (!material) {
    throw new Error(
      'Cannot derive an encryption key: set DATA_ENCRYPTION_KEY or JWT_SECRET.',
    );
  }
  const cached = KEY_CACHE.get(material);
  if (cached) return cached;
  const key = scryptSync(material, 'dsp-secrets', 32);
  KEY_CACHE.set(material, key);
  return key;
}

/** Returns `iv:tag:cipher`, each segment base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted secret.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
