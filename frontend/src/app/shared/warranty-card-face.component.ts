import { Component, input } from '@angular/core';
import { CardLayout } from '../core/models/warranty-cards.models';
import { BarcodeImageComponent, QrImageComponent } from './code-image.component';

/**
 * The back of one warranty card: the design's artwork with this card's barcode (number)
 * and QR code (link) placed on top. Keeps the card's shape at any width, so the same
 * component serves the design preview and the print sheet. Mirrors SynkMart's version.
 */
@Component({
  selector: 'dp-warranty-card-face',
  standalone: true,
  imports: [BarcodeImageComponent, QrImageComponent],
  host: { class: 'block' },
  styles: `
    .face {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #fff;
      container-type: inline-size;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .art {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
    }
    .code {
      position: absolute;
      background: #fff;
    }
    .qr {
      padding: 0.4cqw;
      aspect-ratio: 1;
    }
    .barcode {
      display: flex;
      flex-direction: column;
      padding: 0.3cqw 0.4cqw;
    }
    .barcode dp-barcode-image {
      flex: 1;
      min-height: 0;
    }
    .number {
      font-family: ui-monospace, Menlo, Consolas, monospace;
      font-size: 1.05cqw;
      font-weight: 700;
      letter-spacing: 0.05cqw;
      line-height: 1.2;
      text-align: center;
      color: #000;
    }
  `,
  template: `
    <div class="face" [style.aspect-ratio]="layout().cardWidthMm + ' / ' + layout().cardHeightMm">
      @if (imageUrl()) {
        <img class="art" [src]="imageUrl()" alt="" />
      }
      <div class="code qr" [style.left.%]="layout().qrX" [style.top.%]="layout().qrY" [style.width.%]="layout().qrSize">
        <dp-qr-image class="h-full w-full" [value]="url()" />
      </div>
      <div
        class="code barcode"
        [style.left.%]="layout().barcodeX"
        [style.top.%]="layout().barcodeY"
        [style.width.%]="layout().barcodeWidth"
        [style.height.%]="layout().barcodeHeight"
      >
        <dp-barcode-image [value]="number()" />
        @if (layout().showNumber) {
          <div class="number">{{ number() }}</div>
        }
      </div>
    </div>
  `,
})
export class WarrantyCardFaceComponent {
  readonly imageUrl = input<string | null>(null);
  readonly layout = input.required<CardLayout>();
  readonly number = input.required<string>();
  readonly url = input.required<string>();
}
