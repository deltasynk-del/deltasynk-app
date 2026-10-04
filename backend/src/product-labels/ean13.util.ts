import { randomInt } from 'crypto';

/** GS1 check digit for the first 12 digits of an EAN-13. */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/**
 * A random EAN-13 starting with 29 — the GS1 range for store-internal codes, so it never
 * clashes with a manufacturer's barcode. Every retail scanner reads EAN-13.
 */
export function generateEan13(): string {
  const first12 = `29${String(randomInt(0, 10_000_000_000)).padStart(10, '0')}`;
  return `${first12}${ean13CheckDigit(first12)}`;
}
