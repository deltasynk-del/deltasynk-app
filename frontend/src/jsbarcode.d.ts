/** jsbarcode ships its typings without a `types` entry, so declare the part we use. */
declare module 'jsbarcode' {
  interface JsBarcodeOptions {
    format?: string;
    width?: number;
    height?: number;
    displayValue?: boolean;
    margin?: number;
    background?: string;
    lineColor?: string;
  }
  export default function JsBarcode(element: SVGElement | string, data: string, options?: JsBarcodeOptions): void;
}
