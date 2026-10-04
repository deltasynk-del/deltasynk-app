import { SheetLayout } from '../utils/sheet-layout';

/** Card size and where the codes go on the back (positions in % of the card). */
export interface CardLayout {
  cardWidthMm: number;
  cardHeightMm: number;
  pageMarginMm: number;
  gapMm: number;
  qrX: number;
  qrY: number;
  qrSize: number;
  barcodeX: number;
  barcodeY: number;
  barcodeWidth: number;
  barcodeHeight: number;
  showNumber: boolean;
}

export interface WarrantyDesign extends CardLayout {
  id: string;
  name: string;
  sheet: Pick<SheetLayout, 'orientation' | 'cols' | 'rows' | 'perPage'>;
  /** API paths (prefix with the API base URL); null = not uploaded. */
  frontImageUrl: string | null;
  backImageUrl: string | null;
  packCount: number;
  updatedAt: string;
}

export type WarrantyPackStatus = 'AVAILABLE' | 'CLAIMED' | 'VOID';

export interface WarrantyPack {
  id: string;
  runId: string;
  code: string;
  app: string;
  cardCount: number;
  status: WarrantyPackStatus;
  claimedTenantName: string | null;
  claimedTenantRef: string | null;
  claimedAt: string | null;
  voidReason: string | null;
  voidedAt: string | null;
  createdAt: string;
  designName?: string | null;
  firstNumber?: string | null;
  createdByName?: string | null;
}

export interface PrintCard {
  number: string;
  url: string;
}

export interface WarrantyPrintSheet {
  design: WarrantyDesign;
  packs: (WarrantyPack & { cards: PrintCard[] })[];
}
