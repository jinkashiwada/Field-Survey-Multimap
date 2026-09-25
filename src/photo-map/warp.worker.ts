import { projectPoint } from './homography';
import { pointInRing } from './geometry';
import type { WarpRequest } from './warp';

self.onmessage = async (event: MessageEvent<WarpRequest>) => {
  try {
    const {
      bitmap,
      sourceWidth,
      sourceHeight,
      matrix,
      width,
      height,
      crop,
      masks = [],
    } = event.data;
    const source = new OffscreenCanvas(bitmap.width, bitmap.height),
      sw = bitmap.width,
      sh = bitmap.height;
    const sc = source.getContext('2d', { willReadFrequently: true })!;
    sc.drawImage(bitmap, 0, 0);
    bitmap.close();
    const input = sc.getImageData(0, 0, sw, sh).data;
    const output = new OffscreenCanvas(width, height),
      ctx = output.getContext('2d')!;
    // Row strips cap transient memory; inverse sampling avoids forward-map holes.
    for (let y0 = 0; y0 < height; y0 += 64) {
      const rows = Math.min(64, height - y0),
        strip = new ImageData(width, rows);
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < width; x++) {
          const p = projectPoint(matrix, [x, y + y0]);
          if (!p) continue;
          if (
            p[0] < -0.5 ||
            p[1] < -0.5 ||
            p[0] > sourceWidth - 0.5 ||
            p[1] > sourceHeight - 0.5
          )
            continue;
          if (
            crop &&
            (p[0] < crop[0] ||
              p[1] < crop[1] ||
              p[0] > crop[2] ||
              p[1] > crop[3])
          )
            continue;
          if (masks.some((r) => pointInRing(p, r))) continue;
          const sx = ((p[0] + 0.5) * sw) / sourceWidth - 0.5,
            sy = ((p[1] + 0.5) * sh) / sourceHeight - 0.5;
          const ix = Math.floor(sx),
            iy = Math.floor(sy),
            fx = sx - ix,
            fy = sy - iy;
          const dest = (y * width + x) * 4;
          let alpha = 0;
          const rgb = [0, 0, 0];
          for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++) {
              const offset =
                (Math.max(0, Math.min(sh - 1, iy + dy)) * sw +
                  Math.max(0, Math.min(sw - 1, ix + dx))) *
                4;
              const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy),
                a = input[offset + 3]! / 255;
              alpha += weight * a;
              for (let c = 0; c < 3; c++)
                rgb[c]! += input[offset + c]! * weight * a;
            }
          if (alpha > 0)
            for (let c = 0; c < 3; c++) strip.data[dest + c] = rgb[c]! / alpha;
          strip.data[dest + 3] = 255 * alpha;
        }
      ctx.putImageData(strip, 0, y0);
      self.postMessage({ progress: Math.min(1, (y0 + rows) / height) });
    }
    self.postMessage({
      blob: await output.convertToBlob({ type: 'image/png' }),
    });
  } catch {
    self.postMessage({
      error: '画像変換に失敗しました。画像サイズと投影範囲を確認してください。',
    });
  }
};
