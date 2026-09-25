import type OlMap from 'ol/Map.js';

export async function captureSurface(
  map: OlMap,
  caption: string,
): Promise<Blob> {
  map.renderSync();
  const size = map.getSize()!;
  const canvas = document.createElement('canvas');
  canvas.width = size[0]!;
  canvas.height = size[1]! + 52;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  map
    .getViewport()
    .querySelectorAll<HTMLCanvasElement>('canvas')
    .forEach((c) => {
      if (!c.width) return;
      ctx.save();
      ctx.globalAlpha = Number(c.parentElement?.style.opacity || 1);
      ctx.setTransform(new DOMMatrix(c.style.transform || undefined));
      ctx.drawImage(c, 0, 0);
      ctx.restore();
    });
  ctx.fillStyle = '#172d37';
  ctx.font = '12px sans-serif';
  const chunks =
    caption.match(
      new RegExp(`.{1,${Math.max(20, Math.floor(canvas.width / 12))}}`, 'gu'),
    ) ?? [];
  chunks
    .slice(0, 3)
    .forEach((line, i) => ctx.fillText(line, 8, size[1]! + 15 + i * 15));
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('画面画像を保存できません。')),
      'image/png',
    ),
  );
}
