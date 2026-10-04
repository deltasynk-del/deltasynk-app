import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PrintCard, WarrantyPrintSheet } from '../../core/models/warranty-cards.models';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { WarrantyCardsApiService } from '../../core/services/warranty-cards-api.service';
import { Flip, PrintPage, printPages, setPrintPage, sheetLayout } from '../../core/utils/sheet-layout';
import { BarcodeImageComponent } from '../../shared/code-image.component';
import { WarrantyCardFaceComponent } from '../../shared/warranty-card-face.component';

type Sides = 'both' | 'front' | 'back';

/** One sheet of paper; `packCode` heads the first page of each pack on screen. */
interface Sheet extends PrintPage<PrintCard> {
  packCode: string | null;
}

/** Pack labels: 90 × 50 mm, stuck on each pack so the shop owner can claim it. */
const LABEL = { cardWidthMm: 90, cardHeightMm: 50, pageMarginMm: 10, gapMm: 4 };

/**
 * Print sheet for warranty card packs (?runId= or ?packId=), or their labels (&labels=1).
 * Sits outside the portal layout so only the cards reach the printer. Each pack starts on
 * a new page, so packs can be cut and bundled separately.
 */
@Component({
  selector: 'dp-warranty-print',
  standalone: true,
  imports: [BarcodeImageComponent, FormsModule, RouterLink, WarrantyCardFaceComponent],
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
    .page__label {
      margin: 0 auto 4px;
      font-size: 12px;
      font-weight: 600;
      color: #475569;
    }
    .slot {
      position: absolute;
      display: block;
      outline: 0.2mm dashed #cbd5e1;
      outline-offset: -0.1mm;
    }
    .slot--cut {
      outline: 0.1mm solid #94a3b8;
    }
    .front {
      width: 100%;
      height: 100%;
      object-fit: fill;
    }
    .label {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100%;
      padding: 4mm 5mm;
      border: 0.3mm solid #334155;
      border-radius: 2mm;
      color: #0f172a;
      font-family: system-ui, sans-serif;
    }
    .label__title {
      font-size: 3mm;
      font-weight: 700;
      letter-spacing: 0.2mm;
      text-transform: uppercase;
      color: #475569;
    }
    .label__code {
      font-family: ui-monospace, Menlo, Consolas, monospace;
      font-size: 7mm;
      font-weight: 800;
      letter-spacing: 0.6mm;
    }
    .label__barcode {
      height: 9mm;
      width: 60mm;
    }
    .label__info {
      font-size: 2.6mm;
      line-height: 1.3;
      color: #334155;
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
      .page__label {
        display: none;
      }
      .slot {
        outline: none;
      }
      .slot--cut {
        outline: 0.1mm solid #94a3b8;
      }
    }
  `,
  template: `
    <div class="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3 print:hidden">
      <div class="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          @if (data(); as d) {
            @if (labels()) {
              <h1 class="text-lg font-bold text-slate-900">{{ d.packs.length }} pack label{{ d.packs.length === 1 ? '' : 's' }}</h1>
              <p class="text-sm text-slate-600">Stick one label on each pack. The shop owner types or scans the code in SynkMart → Warranties → Cards.</p>
            } @else {
              <h1 class="text-lg font-bold text-slate-900">{{ cardCount() }} cards in {{ d.packs.length }} pack{{ d.packs.length === 1 ? '' : 's' }}</h1>
              <p class="text-sm text-slate-600">
                {{ layout().perPage }} per A4 page, {{ layout().orientation }} · {{ pages().length }} pages. In the print dialog choose A4,
                margins “None” and scale 100%.
              </p>
              <div class="mt-2 flex flex-wrap items-center gap-3 text-sm">
                @if (d.design.frontImageUrl) {
                  <select class="dp-input !w-auto" name="sides" [ngModel]="sides()" (ngModelChange)="sides.set($event)" aria-label="Sides">
                    <option value="both">Both sides (duplex printer)</option>
                    <option value="front">Fronts only</option>
                    <option value="back">Backs only (with codes)</option>
                  </select>
                  <select class="dp-input !w-auto" name="flip" [ngModel]="flip()" (ngModelChange)="flip.set($event)" aria-label="Second side">
                    <option value="long">Flip on long edge</option>
                    <option value="short">Flip on short edge</option>
                  </select>
                }
                <label class="inline-flex items-center gap-2 text-slate-700">
                  <input type="checkbox" class="accent-brand-600" [ngModel]="cutLines()" (ngModelChange)="cutLines.set($event)" />
                  Cutting lines
                </label>
              </div>
              @if (d.design.frontImageUrl) {
                <p class="mt-1 text-xs text-slate-500">
                  @if (sides() === 'both') {
                    Turn on two-sided printing with the same flip in the print dialog. Print one test page first to check the sides line up.
                  } @else {
                    One side at a time: print the fronts, put the printed stack back in the tray, then print the backs.
                  }
                </p>
              }
            }
          } @else if (error()) {
            <p class="text-sm text-red-700" role="alert">{{ error() }}</p>
          } @else {
            <p class="text-sm text-slate-500">Loading…</p>
          }
        </div>
        <div class="flex gap-2">
          <a routerLink="/warranty-cards" class="btn-secondary">Back</a>
          @if (data()) {
            <button type="button" class="btn-primary" (click)="print()">Print</button>
          }
        </div>
      </div>
    </div>

    @if (data(); as d) {
      <div class="sheets">
        @if (labels()) {
          @for (page of labelPages(); track $index) {
            <div class="page" [style.width.mm]="labelLayout.pageWidthMm" [style.height.mm]="labelLayout.pageHeightMm">
              @for (pack of page; track pack.id; let i = $index) {
                <div class="slot" [style.left.mm]="labelLayout.slots[i].x" [style.top.mm]="labelLayout.slots[i].y" [style.width.mm]="90" [style.height.mm]="50">
                  <div class="label">
                    <div class="label__title">Warranty cards · pack code</div>
                    <div class="label__code">{{ pack.code }}</div>
                    <dp-barcode-image class="label__barcode" [value]="pack.code" />
                    <div class="label__info">
                      {{ pack.cardCount }} cards · {{ pack.cards[0].number }} – {{ pack.cards[pack.cards.length - 1].number }}<br />
                      Add them in SynkMart → Warranties → Cards → “Add printed cards”.
                    </div>
                  </div>
                </div>
              }
            </div>
          }
        } @else {
          @for (page of pages(); track $index) {
            @if (page.packCode || d.design.frontImageUrl) {
              <p class="page__label" [style.width.mm]="layout().pageWidthMm">
                @if (page.packCode) { Pack {{ page.packCode }} · }
                {{ page.side === 'front' ? 'Front' : 'Back' }}
              </p>
            }
            <div class="page" [style.width.mm]="layout().pageWidthMm" [style.height.mm]="layout().pageHeightMm">
              @for (card of page.slots; track $index; let i = $index) {
                @if (card) {
                  <div
                    class="slot"
                    [class.slot--cut]="cutLines()"
                    [style.left.mm]="layout().slots[i].x"
                    [style.top.mm]="layout().slots[i].y"
                    [style.width.mm]="d.design.cardWidthMm"
                    [style.height.mm]="d.design.cardHeightMm"
                  >
                    @if (page.side === 'front') {
                      <img class="front" [src]="frontUrl()" alt="" />
                    } @else {
                      <dp-warranty-card-face [imageUrl]="backUrl()" [layout]="d.design" [number]="card.number" [url]="card.url" />
                    }
                  </div>
                }
              }
            </div>
          }
        }
      </div>
    }
  `,
})
export class WarrantyPrintComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(WarrantyCardsApiService);

  readonly data = signal<WarrantyPrintSheet | null>(null);
  readonly error = signal<string | null>(null);
  readonly labels = signal(false);
  readonly sides = signal<Sides>('both');
  readonly flip = signal<Flip>('long');
  readonly cutLines = signal(true);
  readonly labelLayout = sheetLayout(LABEL);
  private removePageRule: (() => void) | null = null;

  readonly layout = computed(() => sheetLayout(this.data()?.design ?? { cardWidthMm: 210, cardHeightMm: 74.25, pageMarginMm: 0, gapMm: 0 }));
  readonly frontUrl = computed(() => this.api.imageUrl(this.data()?.design.frontImageUrl ?? null));
  readonly backUrl = computed(() => this.api.imageUrl(this.data()?.design.backImageUrl ?? null));
  readonly cardCount = computed(() => (this.data()?.packs ?? []).reduce((sum, p) => sum + p.cards.length, 0));

  /** Each pack on its own pages: front, back, front, back… (or one side only). */
  readonly pages = computed<Sheet[]>(() => {
    const data = this.data();
    if (!data) return [];
    const sides: Sides = data.design.frontImageUrl ? this.sides() : 'back';
    const options = { front: sides !== 'back', back: sides !== 'front', flip: this.flip() };
    return data.packs.flatMap((pack) =>
      printPages(pack.cards, this.layout(), options).map((page, i) => ({ ...page, packCode: i === 0 ? pack.code : null })),
    );
  });

  readonly labelPages = computed(() => {
    const packs = this.data()?.packs ?? [];
    const perPage = this.labelLayout.perPage;
    const pages: (typeof packs)[] = [];
    for (let i = 0; i < packs.length; i += perPage) pages.push(packs.slice(i, i + perPage));
    return pages;
  });

  constructor() {
    // The print dialog must use the same orientation as the sheet.
    effect(() => {
      const orientation = this.labels() ? this.labelLayout.orientation : this.layout().orientation;
      this.removePageRule?.();
      this.removePageRule = setPrintPage(orientation);
    });
  }

  ngOnInit(): void {
    const query = this.route.snapshot.queryParamMap;
    this.labels.set(query.get('labels') === '1');
    this.api.printSheet({ runId: query.get('runId') ?? undefined, packId: query.get('packId') ?? undefined }).subscribe({
      next: (data) => this.data.set(data),
      error: (err: unknown) => this.error.set(apiErrorMessage(err, 'Could not load the cards to print.')),
    });
  }

  ngOnDestroy(): void {
    this.removePageRule?.();
  }

  print(): void {
    window.print();
  }
}
