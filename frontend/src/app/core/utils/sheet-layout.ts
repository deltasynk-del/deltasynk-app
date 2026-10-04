/**
 * Laying cards out on A4 paper. Whatever the card size, the page holds as many as fit
 * (in whichever orientation fits more), centred so both sides of the paper line up.
 */

const A4 = { width: 210, height: 297 };

export interface CardSize {
  cardWidthMm: number;
  cardHeightMm: number;
  /** Blank border around the page. */
  pageMarginMm: number;
  /** Space between cards. */
  gapMm: number;
}

export type Flip = 'long' | 'short';

export interface SheetLayout {
  orientation: 'portrait' | 'landscape';
  pageWidthMm: number;
  pageHeightMm: number;
  cols: number;
  rows: number;
  perPage: number;
  /** Top-left corner of each slot, row by row. */
  slots: { x: number; y: number }[];
}

export function sheetLayout(size: CardSize): SheetLayout {
  const { cardWidthMm: w, cardHeightMm: h, pageMarginMm: margin, gapMm: gap } = size;
  const fit = (page: number, card: number) => Math.max(0, Math.floor((page - 2 * margin + gap + 0.01) / (card + gap)));
  const portrait = { cols: fit(A4.width, w), rows: fit(A4.height, h) };
  const landscape = { cols: fit(A4.height, w), rows: fit(A4.width, h) };
  const useLandscape = landscape.cols * landscape.rows > portrait.cols * portrait.rows;
  const { cols, rows } = useLandscape ? landscape : portrait;
  const pageWidthMm = useLandscape ? A4.height : A4.width;
  const pageHeightMm = useLandscape ? A4.width : A4.height;

  // Centre the grid: the back of the paper then mirrors the front exactly.
  const left = (pageWidthMm - (cols * w + (cols - 1) * gap)) / 2;
  const top = (pageHeightMm - (rows * h + (rows - 1) * gap)) / 2;
  const slots: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) slots.push({ x: left + c * (w + gap), y: top + r * (h + gap) });
  }
  return { orientation: useLandscape ? 'landscape' : 'portrait', pageWidthMm, pageHeightMm, cols, rows, perPage: cols * rows, slots };
}

/**
 * Where the back of the card in front slot `index` lands when the paper is turned over.
 * Flipping on the long edge mirrors across the page's long side: left↔right on a portrait
 * page, top↔bottom on a landscape one. The short edge is the other way round.
 */
export function backSlot(layout: SheetLayout, index: number, flip: Flip): number {
  const row = Math.floor(index / layout.cols);
  const col = index % layout.cols;
  const mirrorColumns = (layout.orientation === 'portrait') === (flip === 'long');
  return mirrorColumns ? row * layout.cols + (layout.cols - 1 - col) : (layout.rows - 1 - row) * layout.cols + col;
}

export interface PrintPage<T> {
  side: 'front' | 'back';
  /** One entry per slot; null leaves the slot blank. */
  slots: (T | null)[];
}

/**
 * Front and back pages in printing order (front, back, front, back… for a duplex printer),
 * or only one side when the paper is fed twice by hand.
 */
export function printPages<T>(
  items: T[],
  layout: SheetLayout,
  options: { front: boolean; back: boolean; flip: Flip },
): PrintPage<T>[] {
  const pages: PrintPage<T>[] = [];
  if (layout.perPage < 1) return pages;
  for (let i = 0; i < items.length; i += layout.perPage) {
    const chunk = items.slice(i, i + layout.perPage);
    const front: (T | null)[] = Array.from({ length: layout.perPage }, (_, slot) => chunk[slot] ?? null);
    const back: (T | null)[] = Array.from({ length: layout.perPage }, () => null);
    chunk.forEach((item, slot) => (back[backSlot(layout, slot, options.flip)] = item));
    if (options.front) pages.push({ side: 'front', slots: front });
    if (options.back) pages.push({ side: 'back', slots: back });
  }
  return pages;
}

/** The print dialog follows the page's orientation; swaps the @page rule while a sheet is open. */
export function setPrintPage(orientation: 'portrait' | 'landscape'): () => void {
  const style = document.createElement('style');
  style.textContent = `@page { size: A4 ${orientation}; margin: 0; }`;
  document.head.appendChild(style);
  return () => style.remove();
}
