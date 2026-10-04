import { randomInt } from 'crypto';

/** No I, L, O or U: easy to read and type from a pack label. */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Pack claim code: 8 characters shown as XXXX-XXXX (about 40 bits, so it can't be guessed). */
export function generatePackCode(): string {
  let code = '';
  for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Accepts what people type or scan: any case, with or without the dash, O/I/L mistaken for 0/1. */
export function normalizePackCode(input: string): string | null {
  const raw = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (raw.length !== 8 || [...raw].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/**
 * Card number: 12 random digits starting with 9. SynkMart's own shop-printed cards never
 * start with 9, so numbers from the two systems can't collide.
 */
export function generateCardNumber(): string {
  return String(randomInt(900_000_000_000, 1_000_000_000_000));
}

const A4 = { width: 210, height: 297 };

export interface SheetLayout {
  orientation: 'portrait' | 'landscape';
  cols: number;
  rows: number;
  perPage: number;
}

/**
 * How many cards of this size fit on A4, trying both orientations and keeping the one
 * that fits more (portrait on a tie). Same rule as the print page in the web app.
 */
export function sheetLayout(widthMm: number, heightMm: number, marginMm: number, gapMm: number): SheetLayout {
  const fit = (page: number, card: number) =>
    Math.max(0, Math.floor((page - 2 * marginMm + gapMm + 0.01) / (card + gapMm)));
  const portrait = { cols: fit(A4.width, widthMm), rows: fit(A4.height, heightMm) };
  const landscape = { cols: fit(A4.height, widthMm), rows: fit(A4.width, heightMm) };
  const p = portrait.cols * portrait.rows;
  const l = landscape.cols * landscape.rows;
  return l > p
    ? { orientation: 'landscape', ...landscape, perPage: l }
    : { orientation: 'portrait', ...portrait, perPage: p };
}
