import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { createMapLayer, getSharedLayerSource } from '../services/mapLayers';
import { layerById } from '../config/layers';
import { multiply } from './homography';
import { rasterGrid, warp } from './warp';
import type { Photo, Project, Matrix3 } from './model';

/** Capture only public reference layers, never photo overlays or application controls. */
export async function inverseOverlay(
  photo: Photo,
  project: Project,
  signal: AbortSignal,
  onWarning: (message: string) => void,
): Promise<Blob> {
  const grid = rasterGrid(photo, 1536);
  const ids = [
    ...(project.inverse.baseLayerId ? [project.inverse.baseLayerId] : []),
    ...project.inverse.overlayIds,
  ];
  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-10000px;top:0;width:${grid.width}px;height:${grid.height}px;pointer-events:none`;
  document.body.append(container);
  const layers = ids.map((id) =>
    createMapLayer(layerById.get(id)!, 1, { minimum: 0, maximum: 20 }),
  );
  const map = new OlMap({
    target: container,
    pixelRatio: 1,
    layers,
    controls: [],
    interactions: [],
    view: new View({
      center: [
        (grid.bounds[0] + grid.bounds[2]) / 2,
        (grid.bounds[1] + grid.bounds[3]) / 2,
      ],
      resolution: grid.resolution,
      constrainResolution: false,
    }),
  });
  map.setSize([grid.width, grid.height]);
  const failed = new Set<string>();
  const subscriptions = ids.map((id) => {
    const source = getSharedLayerSource(layerById.get(id)!, {
      minimum: 0,
      maximum: 20,
    });
    const error = () => {
      if (!failed.has(id)) {
        failed.add(id);
        onWarning(
          `${layerById.get(id)!.titleJa}の一部を取得できません。取得できた情報で編集を継続できます。`,
        );
      }
    };
    source.on('tileloaderror', error);
    return () => source.un('tileloaderror', error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        resolve();
      };
      const abort = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new DOMException('中止しました。', 'AbortError'));
      };
      const timer = window.setTimeout(() => {
        onWarning(
          '地図の取得が完了しない部分があります。取得済み部分だけを逆投影します。',
        );
        done();
      }, 12000);
      signal.addEventListener('abort', abort, { once: true });
      map.once('rendercomplete', done);
      map.renderSync();
      if (signal.aborted) abort();
    });
    if (signal.aborted) throw new DOMException('中止しました。', 'AbortError');
    const canvas = document.createElement('canvas');
    canvas.width = grid.width;
    canvas.height = grid.height;
    const ctx = canvas.getContext('2d')!;
    container
      .querySelectorAll<HTMLCanvasElement>('.ol-layer canvas')
      .forEach((c) => {
        if (!c.width) return;
        try {
          // Test the individual layer before compositing so a failed one cannot taint the whole canvas.
          const probe = document.createElement('canvas');
          probe.width = 1;
          probe.height = 1;
          const pc = probe.getContext('2d')!;
          pc.drawImage(c, 0, 0, 1, 1);
          pc.getImageData(0, 0, 1, 1);
          const transform = new DOMMatrix(c.style.transform || undefined);
          ctx.save();
          ctx.globalAlpha = Number(c.parentElement?.style.opacity || 1);
          ctx.setTransform(transform);
          ctx.drawImage(c, 0, 0);
          ctx.restore();
        } catch {
          onWarning('読取りが制限された地図レイヤーを逆投影から除外しました。');
        }
      });
    const scale = Math.min(1, 2048 / Math.max(photo.width, photo.height)),
      width = Math.max(1, Math.round(photo.width * scale)),
      height = Math.max(1, Math.round(photo.height * scale));
    const pixelToPhoto: Matrix3 = [
      photo.width / width,
      0,
      photo.width / width / 2 - 0.5,
      0,
      photo.height / height,
      photo.height / height / 2 - 0.5,
      0,
      0,
      1,
    ];
    const worldToRaster: Matrix3 = [
      1 / grid.resolution,
      0,
      -grid.bounds[0] / grid.resolution - 0.5,
      0,
      -1 / grid.resolution,
      grid.bounds[3] / grid.resolution - 0.5,
      0,
      0,
      1,
    ];
    const blob = await warp(
      {
        bitmap: await createImageBitmap(canvas),
        sourceWidth: grid.width,
        sourceHeight: grid.height,
        matrix: multiply(
          multiply(worldToRaster, photo.registration!.h),
          pixelToPhoto,
        ),
        width,
        height,
      },
      signal,
    );
    const masked = new OffscreenCanvas(width, height),
      mc = masked.getContext('2d')!,
      bitmap = await createImageBitmap(blob);
    const sx = width / photo.width,
      sy = height / photo.height,
      [x0, y0, x1, y1] = photo.crop;
    mc.beginPath();
    mc.rect((x0 + 0.5) * sx, (y0 + 0.5) * sy, (x1 - x0) * sx, (y1 - y0) * sy);
    mc.clip();
    mc.drawImage(bitmap, 0, 0);
    bitmap.close();
    return masked.convertToBlob({ type: 'image/png' });
  } finally {
    subscriptions.forEach((remove) => remove());
    map.setTarget(undefined);
    map.dispose();
    container.remove();
  }
}
