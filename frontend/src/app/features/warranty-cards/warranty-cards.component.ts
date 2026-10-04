import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Permission } from '../../core/config/permissions';
import { CardLayout, WarrantyDesign, WarrantyPack } from '../../core/models/warranty-cards.models';
import { apiErrorMessage } from '../../core/services/api-error.util';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { CardSide, WarrantyCardsApiService } from '../../core/services/warranty-cards-api.service';
import { compressImage } from '../../core/utils/image-compress';
import { SheetLayout, sheetLayout } from '../../core/utils/sheet-layout';
import { ModalComponent } from '../../shared/modal.component';
import { PagerComponent } from '../../shared/pager.component';
import { WarrantyCardFaceComponent } from '../../shared/warranty-card-face.component';

type View = 'packs' | 'designs';
type PackTab = 'AVAILABLE' | 'CLAIMED' | 'VOID' | '';
type NumberKey = Exclude<keyof CardLayout, 'showNumber'>;

interface Field {
  key: NumberKey;
  label: string;
  min: number;
  max: number;
}

/** Editable copy of a design. */
interface DesignForm extends CardLayout {
  id: string;
  name: string;
}

/**
 * Warranty cards printed by DeltaSynk for SynkMart shops that don't print their own.
 * Staff keep card designs (any size), generate packs with claim codes, and print them;
 * the shop owner claims a pack in SynkMart with the code on its label.
 */
@Component({
  selector: 'dp-warranty-cards',
  standalone: true,
  imports: [DatePipe, FormsModule, MatIconModule, ModalComponent, PagerComponent, WarrantyCardFaceComponent],
  templateUrl: './warranty-cards.component.html',
})
export class WarrantyCardsComponent implements OnInit {
  private readonly api = inject(WarrantyCardsApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly canManage = computed(() => this.auth.can(Permission.WARRANTY_CARDS_MANAGE));
  readonly view = signal<View>('packs');

  // --- Packs ---
  readonly packTabs: { value: PackTab; label: string }[] = [
    { value: 'AVAILABLE', label: 'Not claimed' },
    { value: 'CLAIMED', label: 'Claimed' },
    { value: 'VOID', label: 'Cancelled' },
    { value: '', label: 'All' },
  ];
  readonly packTab = signal<PackTab>('');
  readonly packs = signal<WarrantyPack[]>([]);
  readonly packCounts = signal<Record<string, number>>({});
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = 25;
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  search = '';

  /** "Generate packs" dialog. */
  readonly generating = signal(false);
  readonly saving = signal(false);
  readonly dialogError = signal<string | null>(null);
  genDesignId = '';
  genPackCount = 5;
  genCardsPerPack = 20;

  /** "Cancel pack" dialog. */
  readonly voiding = signal<WarrantyPack | null>(null);
  voidReason = '';

  // --- Designs ---
  readonly designs = signal<WarrantyDesign[]>([]);
  readonly printableDesigns = computed(() => this.designs().filter((d) => d.backImageUrl));
  readonly editing = signal<DesignForm | null>(null);
  readonly creatingDesign = signal(false);
  readonly designBusy = signal(false);
  newDesignName = '';
  private uploadSide: CardSide = 'back';

  readonly sampleNumber = '912345678901';
  readonly sampleUrl = 'https://synkmart.deltasynk.com/w/912345678901';
  readonly sizeFields: Field[] = [
    { key: 'cardWidthMm', label: 'Width (mm)', min: 20, max: 297 },
    { key: 'cardHeightMm', label: 'Height (mm)', min: 20, max: 297 },
    { key: 'pageMarginMm', label: 'Page margin (mm)', min: 0, max: 30 },
    { key: 'gapMm', label: 'Space between cards (mm)', min: 0, max: 30 },
  ];
  readonly qrFields: Field[] = [
    { key: 'qrX', label: 'From left', min: 0, max: 97 },
    { key: 'qrY', label: 'From top', min: 0, max: 95 },
    { key: 'qrSize', label: 'Size', min: 3, max: 60 },
  ];
  readonly barcodeFields: Field[] = [
    { key: 'barcodeX', label: 'From left', min: 0, max: 95 },
    { key: 'barcodeY', label: 'From top', min: 0, max: 97 },
    { key: 'barcodeWidth', label: 'Width', min: 5, max: 100 },
    { key: 'barcodeHeight', label: 'Height', min: 3, max: 80 },
  ];

  ngOnInit(): void {
    this.loadPacks();
    this.loadDesigns();
  }

  setView(view: View): void {
    this.view.set(view);
    if (view === 'designs') this.loadDesigns();
    else this.loadPacks();
  }

  imageUrl(path: string | null): string | null {
    return this.api.imageUrl(path);
  }

  // --- Packs ---------------------------------------------------------------

  setPackTab(tab: PackTab): void {
    this.packTab.set(tab);
    this.page.set(1);
    this.loadPacks();
  }

  applySearch(): void {
    this.page.set(1);
    this.loadPacks();
  }

  goTo(page: number): void {
    this.page.set(page);
    this.loadPacks();
  }

  countFor(tab: PackTab): number | null {
    return tab ? (this.packCounts()[tab] ?? 0) : null;
  }

  loadPacks(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api
      .packs({ status: this.packTab(), q: this.search.trim(), page: this.page(), pageSize: this.pageSize })
      .subscribe({
        next: (res) => {
          this.packs.set(res.items);
          this.total.set(res.total);
          this.packCounts.set(res.counts ?? {});
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loadError.set(apiErrorMessage(err, 'Could not load card packs.'));
          this.loading.set(false);
        },
      });
  }

  openGenerate(): void {
    this.genDesignId = this.printableDesigns()[0]?.id ?? '';
    this.dialogError.set(null);
    this.generating.set(true);
  }

  /** Sheets needed for one pack with the chosen design. */
  pagesPerPack(): number {
    const design = this.designs().find((d) => d.id === this.genDesignId);
    if (!design || design.sheet.perPage < 1 || !this.genCardsPerPack) return 0;
    return Math.ceil(this.genCardsPerPack / design.sheet.perPage);
  }

  generate(): void {
    if (!this.genDesignId || this.genPackCount < 1 || this.genCardsPerPack < 1) return;
    this.saving.set(true);
    this.dialogError.set(null);
    this.api
      .createPacks({ designId: this.genDesignId, packCount: Math.floor(this.genPackCount), cardsPerPack: Math.floor(this.genCardsPerPack) })
      .subscribe({
        next: (run) => {
          this.saving.set(false);
          this.generating.set(false);
          this.toast.success(`${run.packCount} pack(s) with ${run.cardCount} cards created. Print them now.`);
          void this.router.navigate(['/print/warranty-cards'], { queryParams: { runId: run.runId } });
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.dialogError.set(apiErrorMessage(err, 'Could not create the packs.'));
        },
      });
  }

  print(pack: WarrantyPack, what: 'cards' | 'labels', whole: boolean): void {
    void this.router.navigate(['/print/warranty-cards'], {
      queryParams: { ...(whole ? { runId: pack.runId } : { packId: pack.id }), ...(what === 'labels' ? { labels: 1 } : {}) },
    });
  }

  openVoid(pack: WarrantyPack): void {
    this.voidReason = '';
    this.dialogError.set(null);
    this.voiding.set(pack);
  }

  submitVoid(): void {
    const pack = this.voiding();
    if (!pack) return;
    if (this.voidReason.trim().length < 3) {
      this.dialogError.set('Say why the pack is cancelled (e.g. lost in delivery).');
      return;
    }
    this.saving.set(true);
    this.api.voidPack(pack.id, this.voidReason.trim()).subscribe({
      next: () => {
        this.saving.set(false);
        this.voiding.set(null);
        this.toast.success(`Pack ${pack.code} cancelled. It can no longer be claimed.`);
        this.loadPacks();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.dialogError.set(apiErrorMessage(err, 'Could not cancel the pack.'));
      },
    });
  }

  // --- Designs -------------------------------------------------------------

  loadDesigns(): void {
    this.api.designs().subscribe({
      next: (designs) => this.designs.set(designs),
      error: (err: unknown) => this.toast.error(apiErrorMessage(err, 'Could not load card designs.')),
    });
  }

  openNewDesign(): void {
    this.newDesignName = '';
    this.dialogError.set(null);
    this.creatingDesign.set(true);
  }

  createDesign(): void {
    const name = this.newDesignName.trim();
    if (name.length < 2) {
      this.dialogError.set('Give the design a name, e.g. “SynkMart standard 4 per page”.');
      return;
    }
    this.saving.set(true);
    this.api.createDesign({ name }).subscribe({
      next: (design) => {
        this.saving.set(false);
        this.creatingDesign.set(false);
        this.loadDesigns();
        this.edit(design);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.dialogError.set(apiErrorMessage(err, 'Could not create the design.'));
      },
    });
  }

  edit(design: WarrantyDesign): void {
    const { sheet: _sheet, frontImageUrl: _f, backImageUrl: _b, packCount: _p, updatedAt: _u, ...form } = design;
    this.editing.set({ ...form });
    this.view.set('designs');
  }

  editingDesign(): WarrantyDesign | null {
    const form = this.editing();
    return form ? (this.designs().find((d) => d.id === form.id) ?? null) : null;
  }

  /** Cards per A4 page for the size being edited. */
  sheet(form: DesignForm): SheetLayout {
    const positive = (v: number, fallback: number) => (Number(v) > 0 ? Number(v) : fallback);
    return sheetLayout({
      cardWidthMm: positive(form.cardWidthMm, 210),
      cardHeightMm: positive(form.cardHeightMm, 74.25),
      pageMarginMm: Math.max(0, Number(form.pageMarginMm) || 0),
      gapMm: Math.max(0, Number(form.gapMm) || 0),
    });
  }

  saveDesign(form: DesignForm): void {
    const { id, ...body } = form;
    for (const field of this.sizeFields) body[field.key] = Number(body[field.key]) || 0;
    this.designBusy.set(true);
    this.api.updateDesign(id, { ...body, name: body.name.trim() }).subscribe({
      next: (design) => {
        this.designBusy.set(false);
        this.toast.success(`Design “${design.name}” saved.`);
        this.loadDesigns();
      },
      error: (err: unknown) => {
        this.designBusy.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the design.'));
      },
    });
  }

  deleteDesign(form: DesignForm): void {
    if (!confirm(`Delete the design “${form.name}”?`)) return;
    this.api.deleteDesign(form.id).subscribe({
      next: () => {
        this.editing.set(null);
        this.toast.success('Design deleted.');
        this.loadDesigns();
      },
      error: (err: unknown) => this.toast.error(apiErrorMessage(err, 'Could not delete the design.')),
    });
  }

  pickImage(side: CardSide, input: HTMLInputElement): void {
    this.uploadSide = side;
    input.click();
  }

  async onImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const form = this.editing();
    if (!file || !form) return;
    this.designBusy.set(true);
    try {
      // 3508 px = 297 mm at 300 dpi: sharp enough for any card that fits on A4.
      const image = await compressImage(file, { maxSide: 3508, quality: 0.92 });
      URL.revokeObjectURL(image.previewUrl);
      this.api.uploadImage(form.id, this.uploadSide, image.blob).subscribe({
        next: () => {
          this.designBusy.set(false);
          this.loadDesigns();
        },
        error: (err: unknown) => {
          this.designBusy.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not upload the picture.'));
        },
      });
    } catch {
      this.designBusy.set(false);
      this.toast.error('That file is not a picture we can use. Use a JPG, PNG or WebP.');
    }
  }

  removeImage(side: CardSide): void {
    const form = this.editing();
    if (!form) return;
    this.api.removeImage(form.id, side).subscribe({
      next: () => this.loadDesigns(),
      error: (err: unknown) => this.toast.error(apiErrorMessage(err, 'Could not remove the picture.')),
    });
  }
}
