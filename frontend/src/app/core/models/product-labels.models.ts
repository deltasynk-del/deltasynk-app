export type LabelBatchStatus = 'AVAILABLE' | 'CLAIMED' | 'VOID';

/** Label size on the A4 sheet. */
export interface LabelLayout {
  labelWidthMm: number;
  labelHeightMm: number;
  pageMarginMm: number;
  /** Space between labels side by side. */
  gapMm: number;
  /** Space between rows of labels. */
  rowGapMm: number;
}

export interface LabelItem {
  id: string;
  name: string;
  /** EAN-13. */
  barcode: string;
  copies: number;
}

export interface LabelBatch extends LabelLayout {
  id: string;
  code: string;
  app: string;
  name: string;
  sheet: { orientation: 'portrait' | 'landscape'; cols: number; rows: number; perPage: number };
  status: LabelBatchStatus;
  claimedTenantName: string | null;
  claimedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  createdByName?: string | null;
  productCount: number;
  labelCount: number;
  items: LabelItem[];
}

export interface SaveLabelBatch extends Partial<LabelLayout> {
  name: string;
  items: { id?: string; name: string; copies: number }[];
}
