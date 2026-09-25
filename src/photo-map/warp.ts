import type { Matrix3, Photo, Point } from './model';
import { bounds, footprint, multiply } from './homography';

export interface WarpRequest {
  bitmap: ImageBitmap;
  sourceWidth: number;
  sourceHeight: number;
  matrix: Matrix3;
  width: number;
  height: number;
  crop?: Photo['crop'];
  masks?: Point[][];
}
export interface RasterGrid {
  bounds: [number, number, number, number];
  width: number;
  height: number;
  resolution: number;
}
export function rasterGrid(
  photo: Photo,
  longEdge = 4096,
  explicit?: [number, number, number, number] | null,
): RasterGrid {
  const polygon = footprint(photo);
  if (!polygon)
    throw new Error(
      '投影範囲が発散しています。地平線などを切り抜いてください。',
    );
  const extent = explicit ?? bounds(polygon);
  const dx = extent[2] - extent[0],
    dy = extent[3] - extent[1];
  if (!(dx > 0 && dy > 0) || !extent.every(Number.isFinite))
    throw new Error('出力範囲が不正です。');
  if (!Number.isInteger(longEdge) || longEdge < 64 || longEdge > 8192)
    throw new Error('出力の長辺は64〜8192 pxで指定してください。');
  let resolution = Math.max(dx, dy) / longEdge;
  if ((dx * dy) / resolution ** 2 > 32_000_000)
    resolution = Math.sqrt((dx * dy) / 32_000_000);
  const width = Math.ceil(dx / resolution),
    height = Math.ceil(dy / resolution);
  return {
    bounds: [
      extent[0],
      extent[3] - height * resolution,
      extent[0] + width * resolution,
      extent[3],
    ],
    width,
    height,
    resolution,
  };
}
export function gridToWorld(grid: RasterGrid): Matrix3 {
  return [
    grid.resolution,
    0,
    grid.bounds[0] + grid.resolution / 2,
    0,
    -grid.resolution,
    grid.bounds[3] - grid.resolution / 2,
    0,
    0,
    1,
  ];
}
export function worldFile(grid: RasterGrid): string {
  return (
    [
      grid.resolution,
      0,
      0,
      -grid.resolution,
      grid.bounds[0] + grid.resolution / 2,
      grid.bounds[3] - grid.resolution / 2,
    ]
      .map((n) => String(n))
      .join('\n') + '\n'
  );
}
export function photoWarp(
  photo: Photo,
  grid: RasterGrid,
  bitmap: ImageBitmap,
): WarpRequest {
  return {
    bitmap,
    sourceWidth: photo.width,
    sourceHeight: photo.height,
    matrix: multiply(photo.registration!.inverse, gridToWorld(grid)),
    width: grid.width,
    height: grid.height,
    crop: photo.crop,
    masks: photo.masks,
  };
}
export function warp(
  request: WarpRequest,
  signal?: AbortSignal,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      request.bitmap.close();
      reject(new DOMException('中止しました。', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('./warp.worker.ts', import.meta.url), {
      type: 'module',
    });
    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('中止しました。', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (
      event: MessageEvent<{ progress?: number; blob?: Blob; error?: string }>,
    ) => {
      if (event.data.progress !== undefined) onProgress?.(event.data.progress);
      if (event.data.blob) {
        cleanup();
        resolve(event.data.blob);
      }
      if (event.data.error) {
        cleanup();
        reject(new Error(event.data.error));
      }
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error('画像変換に失敗しました。'));
    };
    worker.postMessage(request, [request.bitmap]);
  });
}
