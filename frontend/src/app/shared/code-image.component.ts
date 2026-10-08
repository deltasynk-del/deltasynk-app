import { Component, ElementRef, effect, input, viewChild } from '@angular/core';

/** Barcode drawn as SVG (Code 128, or EAN-13 for product labels); scales to the size of its container. */
@Component({
  selector: 'dp-barcode-image',
  standalone: true,
  host: { class: 'block' },
  template: `<svg #svg class="block h-full w-full" preserveAspectRatio="none" role="img" [attr.aria-label]="value()"></svg>`,
})
export class BarcodeImageComponent {
  readonly value = input.required<string>();
  readonly format = input<'CODE128' | 'EAN13'>('CODE128');
  private readonly svg = viewChild<ElementRef<SVGElement>>('svg');

  constructor() {
    effect(() => {
      const svg = this.svg()?.nativeElement;
      const value = this.value();
      const format = this.format();
      if (svg && value) void this.render(svg, value, format);
    });
  }

  private async render(svg: SVGElement, value: string, format: string): Promise<void> {
    const { default: JsBarcode } = await import('jsbarcode');
    JsBarcode(svg, value, { format, displayValue: false, margin: 0, width: 2, height: 60 });
    // JsBarcode sets a fixed pixel size; keep its viewBox and let CSS decide the size.
    const width = svg.getAttribute('width')?.replace('px', '');
    const height = svg.getAttribute('height')?.replace('px', '');
    if (width && height) svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.removeAttribute('style');
  }
}

/** QR code drawn as SVG; fills its (square) container. */
@Component({
  selector: 'dp-qr-image',
  standalone: true,
  host: { class: 'block' },
  template: `<span #host class="block h-full w-full [&>svg]:h-full [&>svg]:w-full" role="img" [attr.aria-label]="value()"></span>`,
})
export class QrImageComponent {
  readonly value = input.required<string>();
  private readonly host = viewChild<ElementRef<HTMLElement>>('host');

  constructor() {
    effect(() => {
      const host = this.host()?.nativeElement;
      const value = this.value();
      if (host && value) void this.render(host, value);
    });
  }

  private async render(host: HTMLElement, value: string): Promise<void> {
    // qrcode is CommonJS: once bundled, its functions are only on the default export.
    const module = await import('qrcode');
    const QRCode = module.default ?? module;
    host.innerHTML = await QRCode.toString(value, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
  }
}
