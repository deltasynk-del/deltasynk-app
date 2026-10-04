import { Component, ElementRef, effect, input, viewChild } from '@angular/core';

/** Code 128 barcode drawn as SVG; scales to the size of its container. */
@Component({
  selector: 'dp-barcode-image',
  standalone: true,
  host: { class: 'block' },
  template: `<svg #svg class="block h-full w-full" preserveAspectRatio="none" role="img" [attr.aria-label]="value()"></svg>`,
})
export class BarcodeImageComponent {
  readonly value = input.required<string>();
  private readonly svg = viewChild<ElementRef<SVGElement>>('svg');

  constructor() {
    effect(() => {
      const svg = this.svg()?.nativeElement;
      const value = this.value();
      if (svg && value) void this.render(svg, value);
    });
  }

  private async render(svg: SVGElement, value: string): Promise<void> {
    const { default: JsBarcode } = await import('jsbarcode');
    JsBarcode(svg, value, { format: 'CODE128', displayValue: false, margin: 0, width: 2, height: 60 });
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
    const QRCode = await import('qrcode');
    host.innerHTML = await QRCode.toString(value, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
  }
}
