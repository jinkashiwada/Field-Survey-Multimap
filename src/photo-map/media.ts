import type { Assets, Photo } from './model';
import { id } from './model';

export const MAX_IMAGE_PIXELS = 64_000_000;
export const MAX_IMAGE_BYTES = 100 * 1024 * 1024;
export async function decodePhoto(
  blob: Blob,
  photo?: Pick<Photo, 'width' | 'height'>,
  edge?: number,
): Promise<ImageBitmap> {
  const scale =
    photo && edge ? Math.min(1, edge / Math.max(photo.width, photo.height)) : 1;
  return createImageBitmap(blob, {
    imageOrientation: 'from-image',
    ...(photo && scale < 1
      ? {
          resizeWidth: Math.max(1, Math.round(photo.width * scale)),
          resizeHeight: Math.max(1, Math.round(photo.height * scale)),
          resizeQuality: 'high' as const,
        }
      : {}),
  });
}
export async function importPhoto(file: File): Promise<Photo> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('JPEG・PNG・WebP形式を選んでください。');
  if (file.size > MAX_IMAGE_BYTES)
    throw new Error('画像は1枚100 MB以下にしてください。');
  // Read dimensions from a small header before allocating decoded pixels.
  const bytes = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
  const dims = headerDimensions(bytes, file.type);
  if (!dims || dims[0] * dims[1] > MAX_IMAGE_PIXELS)
    throw new Error('画像の寸法を確認できないか、6400万画素を超えています。');
  const bitmap = await decodePhoto(file);
  const { width, height } = bitmap;
  bitmap.close();
  if (width * height > MAX_IMAGE_PIXELS)
    throw new Error('画像は6400万画素以下にしてください。');
  return {
    id: id(),
    name: file.name,
    filename: file.name,
    mime: file.type,
    width,
    height,
    capturedAt: '',
    source: '',
    memo: '',
    gcps: [],
    crop: [-0.5, -0.5, width - 0.5, height - 0.5],
    masks: [],
    visible: [true, false],
    opacity: [0.65, 0.65],
  };
}
export function headerDimensions(
  b: Uint8Array,
  mime: string,
): [number, number] | null {
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (mime === 'image/png' && b.length >= 24 && d.getUint32(0) === 0x89504e47)
    return [d.getUint32(16), d.getUint32(20)];
  if (mime === 'image/jpeg' && b[0] === 255 && b[1] === 216) {
    for (let i = 2; i + 8 < b.length;) {
      if (b[i] !== 255) return null;
      while (b[i] === 255) i++;
      const marker = b[i++]!;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (i + 2 > b.length) break;
      const length = d.getUint16(i);
      if (length < 2) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        i + 7 < b.length
      )
        return [d.getUint16(i + 5), d.getUint16(i + 3)];
      i += length;
    }
  }
  if (
    mime === 'image/webp' &&
    b.length >= 30 &&
    String.fromCharCode(...b.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.slice(8, 12)) === 'WEBP'
  ) {
    const type = String.fromCharCode(...b.slice(12, 16));
    if (type === 'VP8X')
      return [
        1 + b[24]! + (b[25]! << 8) + (b[26]! << 16),
        1 + b[27]! + (b[28]! << 8) + (b[29]! << 16),
      ];
    if (type === 'VP8 ')
      return [d.getUint16(26, true) & 0x3fff, d.getUint16(28, true) & 0x3fff];
    if (type === 'VP8L' && b[20] === 0x2f)
      return [
        1 + ((b[21]! | (b[22]! << 8)) & 0x3fff),
        1 + (((b[22]! >> 6) | (b[23]! << 2) | (b[24]! << 10)) & 0x3fff),
      ];
  }
  return null;
}
/** Bounded decoded cache; Blob originals remain separate from render resources. */
export class ImagePool {
  readonly assets: Assets = new Map();
  private bitmaps = new Map<string, { bitmap: ImageBitmap; bytes: number }>();
  private pending = new Map<string, Promise<ImageBitmap>>();
  private decodeQueue: Promise<void> = Promise.resolve();
  private urls = new Map<string, string>();
  private generation = 0;
  async bitmap(photo: Photo, edge = 2048): Promise<ImageBitmap> {
    const key = `${photo.id}:${edge}`;
    const cached = this.bitmaps.get(key);
    if (cached) {
      this.bitmaps.delete(key);
      this.bitmaps.set(key, cached);
      return cached.bitmap;
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    const blob = this.assets.get(photo.id);
    if (!blob) throw new Error('元画像がありません。');
    const generation = this.generation;
    // Serial decoding also bounds transient native-resolution allocations made by decoders.
    const promise = this.decodeQueue
      .then(() => {
        if (generation !== this.generation)
          throw new Error('画像の読込みを中止しました。');
        return decodePhoto(blob, photo, edge);
      })
      .then((bitmap) => {
        if (generation !== this.generation) {
          bitmap.close();
          throw new Error('画像の読込みを中止しました。');
        }
        const bytes = bitmap.width * bitmap.height * 4;
        let size = [...this.bitmaps.values()].reduce(
          (sum, v) => sum + v.bytes,
          0,
        );
        while (size + bytes > 128 * 1024 * 1024 && this.bitmaps.size) {
          const oldest = this.bitmaps.keys().next().value!;
          const old = this.bitmaps.get(oldest)!;
          old.bitmap.close();
          size -= old.bytes;
          this.bitmaps.delete(oldest);
        }
        this.bitmaps.set(key, { bitmap, bytes });
        return bitmap;
      })
      .finally(() => {
        if (this.pending.get(key) === promise) this.pending.delete(key);
      });
    this.pending.set(key, promise);
    this.decodeQueue = promise.then(
      () => undefined,
      () => undefined,
    );
    return promise;
  }
  async previewUrl(photo: Photo, edge = 2048): Promise<string> {
    const key = `${photo.id}:${edge}`;
    const cached = this.urls.get(key);
    if (cached) return cached;
    const generation = this.generation;
    if (edge >= Math.max(photo.width, photo.height)) {
      const original = this.assets.get(photo.id);
      if (!original) throw new Error('元画像がありません。');
      const url = URL.createObjectURL(original);
      this.urls.set(key, url);
      return url;
    }
    const bitmap = await this.bitmap(photo, edge);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({
      type: 'image/webp',
      quality: 0.88,
    });
    if (generation !== this.generation)
      throw new Error('画像の読込みを中止しました。');
    const raced = this.urls.get(key);
    if (raced) return raced;
    const url = URL.createObjectURL(blob);
    this.urls.set(key, url);
    return url;
  }
  clear(): void {
    this.generation++;
    this.bitmaps.forEach((v) => v.bitmap.close());
    this.bitmaps.clear();
    this.pending.clear();
    this.urls.forEach((url) => URL.revokeObjectURL(url));
    this.urls.clear();
    this.assets.clear();
  }
}
