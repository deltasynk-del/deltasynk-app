import { BadRequestException } from '@nestjs/common';
import { randomInt } from 'crypto';

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export const BCRYPT_ROUNDS = 12;

export function assertPasswordPolicy(password: string): void {
  if (!PASSWORD_PATTERN.test(password)) {
    throw new BadRequestException(
      'Password must be 8+ characters with upper, lower, number, and special character.',
    );
  }
}

export function assertPasswordsMatch(password: string, confirmPassword: string): void {
  if (password !== confirmPassword) {
    throw new BadRequestException('Passwords do not match.');
  }
}

/** Temporary password for a new user; always satisfies the policy. */
export function generateTemporaryPassword(): string {
  const pick = (alphabet: string, n: number) =>
    Array.from({ length: n }, () => alphabet[randomInt(0, alphabet.length)]).join('');
  const parts =
    pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 3) +
    pick('abcdefghijkmnpqrstuvwxyz', 4) +
    pick('23456789', 3) +
    pick('!@#$%*?', 2);
  return parts
    .split('')
    .map((c) => ({ c, k: randomInt(0, 1_000_000) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.c)
    .join('');
}
