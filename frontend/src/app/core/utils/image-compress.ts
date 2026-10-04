export interface CompressedImage {
  blob: Blob;
  /** Object URL for previewing; revoke it with URL.revokeObjectURL when done. */
  previewUrl: string;
  originalBytes: number;
  bytes: number;
  width: number;
  height: number;
}

export class ImageCompressError extends Error {
  constructor(readonly reason: 'notImage' | 'tooLarge' | 'unreadable') {
    super(reason);
  }
}

/** Refuse absurd files before even decoding them. */
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

/**
 * Shrinks a photo in the browser before upload: resizes so the longest side is at most
 * `maxSide` px and re-encodes as WebP (JPEG where WebP encoding is unsupported).
 * A typical 4–8 MB phone photo becomes ~60–150 KB. EXIF orientation is respected, and
 * metadata (e.g. GPS) is dropped because only pixels are redrawn.
 */
export async function compressImage(
  file: File,
  { maxSide = 1200, quality = 0.82 }: { maxSide?: number; quality?: number } = {},
): Promise<CompressedImage> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
    throw new ImageCompressError('notImage');
  }
  if (file.size > MAX_INPUT_BYTES) throw new ImageCompressError('tooLarge');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // e.g. HEIC on browsers that cannot decode it
    throw new ImageCompressError('unreadable');
  }

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageCompressError('unreadable');
  ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background, not black
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let blob = await toBlob(canvas, 'image/webp', quality);
  // Safari < 14 silently returns PNG for unsupported types.
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
  if (!blob) throw new ImageCompressError('unreadable');

  // Already-small images can grow when re-encoded; keep the original then.
  if (blob.size >= file.size && scale === 1 && /^image\/(jpeg|webp|png)$/.test(file.type)) {
    blob = file;
  }

  return {
    blob,
    previewUrl: URL.createObjectURL(blob),
    originalBytes: file.size,
    bytes: blob.size,
    width,
    height,
  };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** "4.2 MB", "96 KB" */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
