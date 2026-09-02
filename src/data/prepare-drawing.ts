import sampleSheetUrl from '../../data/drawing-sheet1.webp';

/**
 * The image a person attaches never reaches the package as the file they chose.
 * It is decoded, drawn onto a canvas no larger than the bundled sheet and
 * written out again as WebP, because the package is kept in `localStorage`,
 * which holds a few megabytes per origin and grows a third under base64. All
 * canvas work is here, so the splitter and the store stay testable without a
 * DOM, and this module is the only place a browser image API is called.
 */

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const QUALITY = 0.85;

export type DrawingErrorCode = 'TYPE' | 'SIZE' | 'DECODE';
export interface DrawingError { ok: false; code: DrawingErrorCode }
export interface PreparedDrawing { ok: true; dataUrl: string; width: number; height: number }

export interface DecodedImage { width: number; height: number; close?: () => void }

export interface DrawingTools {
  decode: (file: Blob) => Promise<DecodedImage>;
  encode: (source: DecodedImage, width: number, height: number, type: string, quality: number) => string;
  /** The long side of the bundled sheet: the size a drawing is worth keeping at. */
  longSideCap: () => Promise<number>;
}

const loadSampleSize = async (): Promise<number> => new Promise(resolve => {
  const image = new Image();
  image.addEventListener('load', () => resolve(Math.max(image.naturalWidth, image.naturalHeight)), { once: true });
  // A sheet that will not load must not block the person: fall back to the
  // decoded image's own size, which the caller then leaves unscaled.
  image.addEventListener('error', () => resolve(Number.POSITIVE_INFINITY), { once: true });
  image.src = sampleSheetUrl;
});

const browserTools: DrawingTools = {
  decode: file => createImageBitmap(file),
  encode: (source, width, height, type, quality) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(source as unknown as CanvasImageSource, 0, 0, width, height);
    return canvas.toDataURL(type, quality);
  },
  longSideCap: loadSampleSize,
};

export async function prepareDrawing(
  file: File,
  tools: DrawingTools = browserTools,
): Promise<PreparedDrawing | DrawingError> {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return { ok: false, code: 'TYPE' };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, code: 'SIZE' };

  let decoded: DecodedImage;
  try {
    decoded = await tools.decode(file);
  } catch {
    return { ok: false, code: 'DECODE' };
  }

  try {
    const cap = await tools.longSideCap();
    const scale = Math.min(1, cap / Math.max(decoded.width, decoded.height));
    const width = Math.round(decoded.width * scale);
    const height = Math.round(decoded.height * scale);
    let dataUrl = tools.encode(decoded, width, height, 'image/webp', QUALITY);
    // Safari wrote PNG for years where WebP was asked for; a JPEG of the same
    // quality is the one other format every target browser writes.
    if (!dataUrl.startsWith('data:image/webp')) dataUrl = tools.encode(decoded, width, height, 'image/jpeg', QUALITY);
    return { ok: true, dataUrl, width, height };
  } finally {
    decoded.close?.();
  }
}
