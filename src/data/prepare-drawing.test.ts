import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, prepareDrawing, type DrawingTools } from './prepare-drawing';

/**
 * The bundled sheet's own size, read from the file rather than copied into the
 * source: the cap the re-encoder applies is that sheet's long side, and a
 * literal here would drift the day the sheet is replaced.
 */
const sampleSize = (): { width: number; height: number } => {
  const bytes = readFileSync('data/drawing-sheet1.webp');
  return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
};

const file = (type: string, size = 1_000): File =>
  ({ name: 'sheet', size, type } as unknown as File);

interface Drawn { width: number; height: number }

const tools = (overrides: Partial<DrawingTools> & { decoded?: Drawn } = {}): DrawingTools & { drawn: Drawn[] } => {
  const drawn: Drawn[] = [];
  const decoded = overrides.decoded ?? { width: 5_000, height: 3_500 };
  return {
    drawn,
    decode: overrides.decode ?? (async () => ({ ...decoded, close() {} })),
    encode: overrides.encode ?? ((_source, width, height) => {
      drawn.push({ width, height });
      return `data:image/webp;base64,${width}x${height}`;
    }),
    longSideCap: overrides.longSideCap ?? (async () => sampleSize().width),
  };
};

describe('prepareDrawing: what it refuses', () => {
  test('a file of another type is refused before anything is decoded', async () => {
    const kit = tools({ decode: async () => { throw new Error('should not decode'); } });
    expect(await prepareDrawing(file('image/heic'), kit)).toEqual({ ok: false, code: 'TYPE' });
  });

  test('the accepted types are the three the dialog offers', () => {
    expect(ACCEPTED_IMAGE_TYPES).toEqual(['image/png', 'image/jpeg', 'image/webp']);
  });

  test('a file over the size limit is refused', async () => {
    expect(await prepareDrawing(file('image/png', MAX_IMAGE_BYTES + 1), tools()))
      .toEqual({ ok: false, code: 'SIZE' });
  });

  test('a file that does not decode as an image is refused', async () => {
    const kit = tools({ decode: async () => { throw new Error('not an image'); } });
    expect(await prepareDrawing(file('image/png'), kit)).toEqual({ ok: false, code: 'DECODE' });
  });
});

describe('prepareDrawing: the re-encoding', () => {
  test('the long side is capped at the bundled sheet’s long side, in proportion', async () => {
    const kit = tools({ decoded: { width: 5_000, height: 3_500 } });
    const result = await prepareDrawing(file('image/png', 8_400_000), kit);
    const cap = sampleSize().width;

    expect(result).toMatchObject({ ok: true, width: cap });
    expect(kit.drawn).toEqual([{ width: cap, height: Math.round(3_500 * (cap / 5_000)) }]);
  });

  test('a portrait image is capped on its own long side', async () => {
    const kit = tools({ decoded: { width: 1_000, height: 6_000 } });
    await prepareDrawing(file('image/png'), kit);
    const cap = sampleSize().width;

    expect(kit.drawn).toEqual([{ width: Math.round(1_000 * (cap / 6_000)), height: cap }]);
  });

  test('a small image is not upscaled', async () => {
    const kit = tools({ decoded: { width: 300, height: 200 } });
    await prepareDrawing(file('image/webp'), kit);

    expect(kit.drawn).toEqual([{ width: 300, height: 200 }]);
  });

  test('the data URL the encoder returns is the drawing the package keeps', async () => {
    const kit = tools({ decoded: { width: 300, height: 200 } });

    expect(await prepareDrawing(file('image/webp'), kit))
      .toEqual({ ok: true, dataUrl: 'data:image/webp;base64,300x200', width: 300, height: 200 });
  });

  test('a browser that cannot write WebP is re-encoded as JPEG at the same quality', async () => {
    const qualities: number[] = [];
    const kit = tools({
      decoded: { width: 300, height: 200 },
      encode: (_source, _width, _height, type, quality) => {
        qualities.push(quality);
        return `data:image/png;base64,${type}`;
      },
    });
    const result = await prepareDrawing(file('image/png'), kit);

    expect(result).toEqual({ ok: true, dataUrl: 'data:image/png;base64,image/jpeg', width: 300, height: 200 });
    expect(qualities).toEqual([0.85, 0.85]);
  });
});
