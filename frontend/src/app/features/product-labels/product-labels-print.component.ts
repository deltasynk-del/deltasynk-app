import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LabelBatch, LabelItem } from '../../core/models/product-labels.models';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { ProductLabelsApiService } from '../../core/services/product-labels-api.service';
import { setPrintPage, sheetLayout } from '../../core/utils/sheet-layout';
import { BarcodeImageComponent } from '../../shared/code-image.component';

/**
 * Print page for a product label batch: the labels themselves (each product repeated as many
 * times as asked), or with ?slip=1 the batch slip with the claim code and product list for the
 * shop. Sits outside the portal layout so only the sheet reaches the printer.
 */
@Component({
  selector: 'dp-product-labels-print',
  standalone: true,
  imports: [BarcodeImageComponent, DatePipe, FormsModule, RouterLink],
  styles: `
    :host {
      display: block;
      min-height: 100vh;
      background: #e2e8f0;
    }
    .sheets {
      overflow-x: auto;
      padding: 16px;
    }
    .page {
      position: relative;
      box-sizing: border-box;
      margin: 0 auto 16px;
      background: #fff;
      box-shadow: 0 1px 4px rgb(0 0 0 / 0.15);
      overflow: hidden;
    }
    .label {
      position: absolute;
      box-sizing: border-box;
      /* Children size their text from the label (cqw / cqh = % of the label). */
      container-type: size;
      outline: 0.2mm dashed #cbd5e1;
      outline-offset: -0.1mm;
      color: #000;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    }
    .label--cut {
      outline: 0.1mm solid #94a3b8;
    }
    .label__inner {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      padding: 7cqh 6cqw 5cqh;
    }
    .label__name {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      font-size: min(7cqw, 13cqh);
      font-weight: 700;
      line-height: 1.15;
      text-align: center;
    }
    .label__barcode {
      flex: 1;
      min-height: 0;
      margin: 3cqh 4cqw 0;
    }
    .label__number {
      font-family: ui-monospace, Menlo, Consolas, monospace;
      font-size: min(6.5cqw, 11cqh);
      font-weight: 600;
      letter-spacing: 0.6cqw;
      line-height: 1.2;
      text-align: center;
    }
    .slip {
      padding: 18mm;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      color: #0f172a;
    }
    .slip table {
      width: 100%;
      border-collapse: collapse;
      font-size: 3.2mm;
    }
    .slip th,
    .slip td {
      border-bottom: 0.2mm solid #cbd5e1;
      padding: 1.6mm 1mm;
      text-align: left;
    }
    @media print {
      :host {
        background: #fff;
      }
      .sheets {
        padding: 0;
        overflow: visible;
      }
      .page {
        margin: 0;
        box-shadow: none;
        break-after: page;
      }
      .page:last-child {
        break-after: auto;
      }
      .label {
        outline: none;
      }
      .label--cut {
        outline: 0.1mm solid #94a3b8;
      }
      .slip-page {
        height: auto !important;
        overflow: visible;
      }
    }
  `,
  template: `
    <div class="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3 print:hidden">
      <div class="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          @if (batch(); as b) {
            @if (slip()) {
              <h1 class="text-lg font-bold text-slate-900">Batch slip · {{ b.code }}</h1>
              <p class="text-sm text-slate-600">Give this to the shop with the labels. The owner types or scans the code in SynkMart → Products &amp; stock.</p>
            } @else {
              <h1 class="text-lg font-bold text-slate-900">{{ labels().length }} labels · {{ b.name }}</h1>
              <p class="text-sm text-slate-600">
                {{ layout().perPage }} per A4 page ({{ layout().orientation }}) · {{ pages().length }} page{{ pages().length === 1 ? '' : 's' }}.
                In the print dialog choose A4, margins “None” and scale 100%.
              </p>
              <label class="mt-2 inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" class="accent-brand-600" [ngModel]="cutLines()" (ngModelChange)="cutLines.set($event)" />
                Cutting lines (leave off for sticky label sheets)
              </label>
            }
          } @else if (error()) {
            <p class="text-sm text-red-700" role="alert">{{ error() }}</p>
          } @else {
            <p class="text-sm text-slate-500">Loading…</p>
          }
        </div>
        <div class="flex gap-2">
          <a routerLink="/product-labels" class="btn-secondary">Back</a>
          @if (batch()) {
            <button type="button" class="btn-primary" (click)="print()">Print</button>
          }
        </div>
      </div>
    </div>

    @if (batch(); as b) {
      <div class="sheets">
        @if (slip()) {
          <div class="page slip-page" style="width: 210mm; min-height: 297mm">
            <div class="slip">
              <p style="font-size: 3.4mm; font-weight: 700; letter-spacing: 0.3mm; text-transform: uppercase; color: #475569">Product barcode labels · DeltaSynk</p>
              <h1 style="margin-top: 2mm; font-size: 6mm; font-weight: 800">{{ b.name }}</h1>
              <p style="margin-top: 8mm; font-size: 3.4mm; color: #475569">Batch code</p>
              <p style="font-family: ui-monospace, Menlo, monospace; font-size: 11mm; font-weight: 800; letter-spacing: 1mm">{{ b.code }}</p>
              <dp-barcode-image style="display: block; width: 80mm; height: 14mm; margin-top: 2mm" [value]="b.code" />
              <p style="margin-top: 6mm; font-size: 3.6mm; line-height: 1.5">
                To register these products in SynkMart: open <strong>Products &amp; stock</strong> → <strong>Add products from DeltaSynk
                barcode labels</strong>, then type or scan the code above. Each product is added with its name and barcode; set its
                price with “Receive stock”.
              </p>
              <table style="margin-top: 8mm">
                <thead>
                  <tr><th>#</th><th>Product</th><th>Barcode</th><th>Labels</th></tr>
                </thead>
                <tbody>
                  @for (item of b.items; track item.id; let i = $index) {
                    <tr>
                      <td>{{ i + 1 }}</td>
                      <td>{{ item.name }}</td>
                      <td style="font-family: ui-monospace, Menlo, monospace">{{ item.barcode }}</td>
                      <td>{{ item.copies }}</td>
                    </tr>
                  }
                </tbody>
              </table>
              <p style="margin-top: 6mm; font-size: 3mm; color: #64748b">
                {{ b.productCount }} products · {{ b.labelCount }} labels · created {{ b.createdAt | date: 'd MMM y' }}
              </p>
            </div>
          </div>
        } @else {
          @for (page of pages(); track $index) {
            <div class="page" [style.width.mm]="layout().pageWidthMm" [style.height.mm]="layout().pageHeightMm">
              @for (item of page; track $index; let i = $index) {
                <div
                  class="label"
                  [class.label--cut]="cutLines()"
                  [style.left.mm]="layout().slots[i].x"
                  [style.top.mm]="layout().slots[i].y"
                  [style.width.mm]="b.labelWidthMm"
                  [style.height.mm]="b.labelHeightMm"
                >
                  <div class="label__inner">
                    <div class="label__name">{{ item.name }}</div>
                    <dp-barcode-image class="label__barcode" format="EAN13" [value]="item.barcode" />
                    <div class="label__number">{{ item.barcode }}</div>
                  </div>
                </div>
              }
            </div>
          }
        }
      </div>
    }
  `,
})
export class ProductLabelsPrintComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ProductLabelsApiService);

  readonly batch = signal<LabelBatch | null>(null);
  readonly error = signal<string | null>(null);
  readonly slip = signal(false);
  readonly cutLines = signal(false);
  private removePageRule: (() => void) | null = null;

  readonly layout = computed(() => {
    const b = this.batch();
    return sheetLayout({
      cardWidthMm: b?.labelWidthMm ?? 63.5,
      cardHeightMm: b?.labelHeightMm ?? 38.1,
      pageMarginMm: b?.pageMarginMm ?? 0,
      gapMm: b?.gapMm ?? 2.5,
      rowGapMm: b?.rowGapMm ?? 0,
    });
  });

  /** Every label in order: each product repeated as many times as asked. */
  readonly labels = computed<LabelItem[]>(() =>
    (this.batch()?.items ?? []).flatMap((item) => Array.from({ length: item.copies }, () => item)),
  );

  readonly pages = computed<LabelItem[][]>(() => {
    const perPage = this.layout().perPage;
    const labels = this.labels();
    const pages: LabelItem[][] = [];
    if (perPage < 1) return pages;
    for (let i = 0; i < labels.length; i += perPage) pages.push(labels.slice(i, i + perPage));
    return pages;
  });

  constructor() {
    // The print dialog must use the same orientation as the sheet.
    effect(() => {
      const orientation = this.slip() ? 'portrait' : this.layout().orientation;
      this.removePageRule?.();
      this.removePageRule = setPrintPage(orientation);
    });
  }

  ngOnInit(): void {
    this.slip.set(this.route.snapshot.queryParamMap.get('slip') === '1');
    this.api.get(this.route.snapshot.paramMap.get('id') ?? '').subscribe({
      next: (batch) => this.batch.set(batch),
      error: (err: unknown) => this.error.set(apiErrorMessage(err, 'Could not load the label batch.')),
    });
  }

  ngOnDestroy(): void {
    this.removePageRule?.();
  }

  print(): void {
    window.print();
  }
}
