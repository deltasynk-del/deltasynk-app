import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Permission } from '../../core/config/permissions';
import { LabelBatch, LabelLayout } from '../../core/models/product-labels.models';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { AuthService } from '../../core/services/auth.service';
import { ProductLabelsApiService } from '../../core/services/product-labels-api.service';
import { ToastService } from '../../core/services/toast.service';
import { SheetLayout, sheetLayout } from '../../core/utils/sheet-layout';
import { ModalComponent } from '../../shared/modal.component';
import { PagerComponent } from '../../shared/pager.component';

type Tab = 'AVAILABLE' | 'CLAIMED' | 'VOID' | '';

interface Row {
  /** Saved products keep their id (and barcode). */
  id?: string;
  barcode?: string;
  name: string;
  copies: number;
}

interface BatchForm extends LabelLayout {
  id: string | null;
  name: string;
  rows: Row[];
}

interface SizeField {
  key: keyof LabelLayout;
  label: string;
  min: number;
  max: number;
}

/** 63.5 × 38.1 mm with 2.5 mm between columns: the common 21-per-sheet A4 label paper (3 × 7). */
const DEFAULT_LAYOUT: LabelLayout = { labelWidthMm: 63.5, labelHeightMm: 38.1, pageMarginMm: 0, gapMm: 2.5, rowGapMm: 0 };

/**
 * Barcode labels for a shop's products: staff type each product's name and how many labels
 * it needs, each product gets its own barcode, and the labels print on A4. The shop owner
 * claims the batch in SynkMart (Products & stock) and the products are registered.
 */
@Component({
  selector: 'dp-product-labels',
  standalone: true,
  imports: [DatePipe, FormsModule, MatIconModule, ModalComponent, PagerComponent],
  templateUrl: './product-labels.component.html',
})
export class ProductLabelsComponent implements OnInit {
  private readonly api = inject(ProductLabelsApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly canManage = computed(() => this.auth.can(Permission.PRODUCT_LABELS_MANAGE));

  readonly tabs: { value: Tab; label: string }[] = [
    { value: 'AVAILABLE', label: 'Not claimed' },
    { value: 'CLAIMED', label: 'Claimed' },
    { value: 'VOID', label: 'Cancelled' },
    { value: '', label: 'All' },
  ];
  readonly tab = signal<Tab>('');
  readonly batches = signal<LabelBatch[]>([]);
  readonly counts = signal<Record<string, number>>({});
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = 25;
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  search = '';

  /** The batch being created or edited. */
  readonly form = signal<BatchForm | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly pasting = signal(false);
  pasteText = '';
  pasteCopies = 1;

  readonly voiding = signal<LabelBatch | null>(null);
  readonly dialogError = signal<string | null>(null);
  voidReason = '';

  readonly sizeFields: SizeField[] = [
    { key: 'labelWidthMm', label: 'Label width (mm)', min: 15, max: 297 },
    { key: 'labelHeightMm', label: 'Label height (mm)', min: 10, max: 297 },
    { key: 'pageMarginMm', label: 'Page margin (mm)', min: 0, max: 30 },
    { key: 'gapMm', label: 'Space between columns (mm)', min: 0, max: 30 },
    { key: 'rowGapMm', label: 'Space between rows (mm)', min: 0, max: 30 },
  ];

  ngOnInit(): void {
    this.load();
  }

  // --- List ----------------------------------------------------------------

  setTab(tab: Tab): void {
    this.tab.set(tab);
    this.page.set(1);
    this.load();
  }

  applySearch(): void {
    this.page.set(1);
    this.load();
  }

  goTo(page: number): void {
    this.page.set(page);
    this.load();
  }

  countFor(tab: Tab): number | null {
    return tab ? (this.counts()[tab] ?? 0) : null;
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.list({ status: this.tab(), q: this.search.trim(), page: this.page(), pageSize: this.pageSize }).subscribe({
      next: (res) => {
        this.batches.set(res.items);
        this.total.set(res.total);
        this.counts.set(res.counts ?? {});
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(apiErrorMessage(err, 'Could not load label batches.'));
        this.loading.set(false);
      },
    });
  }

  print(batch: LabelBatch, slip: boolean): void {
    void this.router.navigate(['/print/product-labels', batch.id], { queryParams: slip ? { slip: 1 } : {} });
  }

  // --- Create / edit -------------------------------------------------------

  newBatch(): void {
    this.formError.set(null);
    this.form.set({ id: null, name: '', ...DEFAULT_LAYOUT, rows: [{ name: '', copies: 1 }] });
  }

  edit(batch: LabelBatch): void {
    this.formError.set(null);
    this.form.set({
      id: batch.id,
      name: batch.name,
      labelWidthMm: batch.labelWidthMm,
      labelHeightMm: batch.labelHeightMm,
      pageMarginMm: batch.pageMarginMm,
      gapMm: batch.gapMm,
      rowGapMm: batch.rowGapMm,
      rows: batch.items.map((item) => ({ id: item.id, barcode: item.barcode, name: item.name, copies: item.copies })),
    });
  }

  closeForm(): void {
    if (!this.saving()) this.form.set(null);
  }

  addRow(form: BatchForm): void {
    form.rows.push({ name: '', copies: 1 });
  }

  removeRow(form: BatchForm, index: number): void {
    form.rows.splice(index, 1);
  }

  /**
   * Adds many products at once: one per line, optionally followed by how many labels
   * (“Coca-Cola 500ml, 24”, or the two columns pasted from a spreadsheet).
   */
  applyPaste(form: BatchForm): void {
    const fallback = Math.max(1, Math.floor(Number(this.pasteCopies) || 1));
    for (const raw of this.pasteText.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const match = line.match(/^(.*?)[\t,;]\s*(\d{1,4})\s*$/);
      const name = (match ? match[1] : line).trim();
      if (!name) continue;
      form.rows.push({ name, copies: match ? Math.max(1, Number(match[2])) : fallback });
    }
    // Drop empty rows (such as the starter row) that the pasted list replaces.
    form.rows = form.rows.filter((row) => row.name.trim() || row.id);
    if (form.rows.length === 0) form.rows.push({ name: '', copies: 1 });
    this.pasteText = '';
    this.pasting.set(false);
  }

  sheet(form: BatchForm): SheetLayout {
    const positive = (v: number, fallback: number) => (Number(v) > 0 ? Number(v) : fallback);
    return sheetLayout({
      cardWidthMm: positive(form.labelWidthMm, 63.5),
      cardHeightMm: positive(form.labelHeightMm, 38.1),
      pageMarginMm: Math.max(0, Number(form.pageMarginMm) || 0),
      gapMm: Math.max(0, Number(form.gapMm) || 0),
      rowGapMm: Math.max(0, Number(form.rowGapMm) || 0),
    });
  }

  pagesFor(form: BatchForm): number {
    const perPage = this.sheet(form).perPage;
    return perPage > 0 ? Math.ceil(this.labelTotal(form) / perPage) : 0;
  }

  labelTotal(form: BatchForm): number {
    return form.rows.reduce((sum, row) => sum + (row.name.trim() ? Math.max(0, Math.floor(Number(row.copies) || 0)) : 0), 0);
  }

  save(form: BatchForm): void {
    const items = form.rows
      .filter((row) => row.name.trim())
      .map((row) => ({ ...(row.id ? { id: row.id } : {}), name: row.name.trim(), copies: Math.floor(Number(row.copies) || 0) }));
    if (form.name.trim().length < 2) return this.formError.set('Give the batch a name, e.g. the shop it is for.');
    if (items.length === 0) return this.formError.set('Add at least one product.');
    if (items.some((item) => item.copies < 1)) return this.formError.set('Every product needs at least 1 label.');

    const body = {
      name: form.name.trim(),
      labelWidthMm: Number(form.labelWidthMm),
      labelHeightMm: Number(form.labelHeightMm),
      pageMarginMm: Number(form.pageMarginMm) || 0,
      gapMm: Number(form.gapMm) || 0,
      rowGapMm: Number(form.rowGapMm) || 0,
      items,
    };
    this.saving.set(true);
    this.formError.set(null);
    const request = form.id ? this.api.update(form.id, body) : this.api.create(body);
    request.subscribe({
      next: (batch) => {
        this.saving.set(false);
        this.form.set(null);
        this.toast.success(`Batch ${batch.code} saved: ${batch.productCount} products, ${batch.labelCount} labels.`);
        this.load();
        if (!form.id) this.print(batch, false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.formError.set(apiErrorMessage(err, 'Could not save the batch.'));
      },
    });
  }

  // --- Cancel --------------------------------------------------------------

  openVoid(batch: LabelBatch): void {
    this.voidReason = '';
    this.dialogError.set(null);
    this.voiding.set(batch);
  }

  submitVoid(): void {
    const batch = this.voiding();
    if (!batch) return;
    if (this.voidReason.trim().length < 3) {
      this.dialogError.set('Say why the batch is cancelled.');
      return;
    }
    this.saving.set(true);
    this.api.void(batch.id, this.voidReason.trim()).subscribe({
      next: () => {
        this.saving.set(false);
        this.voiding.set(null);
        this.toast.success(`Batch ${batch.code} cancelled.`);
        this.load();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.dialogError.set(apiErrorMessage(err, 'Could not cancel the batch.'));
      },
    });
  }
}
