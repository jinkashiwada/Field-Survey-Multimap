import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { getPointResolution } from 'ol/proj.js';
import type { ElevationColorRange } from '../domain/layers';
import GeoJSON from 'ol/format/GeoJSON.js';
import LineString from 'ol/geom/LineString.js';
import MultiLineString from 'ol/geom/MultiLineString.js';
import Polygon from 'ol/geom/Polygon.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import PointGeometry from 'ol/geom/Point.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import GeometryCollection from 'ol/geom/GeometryCollection.js';
import type Geometry from 'ol/geom/Geometry.js';
import { colorForElevation, createMapLayer, getSharedLayerSource, getSharedRiverGuideSource } from '../services/mapLayers';
import { estimateElevationRangeAt } from '../services/elevation/range';
import { layerById } from '../config/layers';
import { mapLayerOpacity } from './layerOpacity';
import { drawingWorldPoints } from './geometry';
import { multiply, invert, projectPoint } from './homography';
import { decodePhoto } from './media';
import { inverseOverlay } from './inverse';
import { warp } from './warp';
import type { Matrix3, Photo, Point, Project } from './model';

export interface ExportFrame {
  center: Point;
  resolution: number;
  rotation: number;
  width: number;
  height: number;
  pixelToWorld: Matrix3;
}
export interface ExportVariant {
  id: string;
  label: string;
  baseId: string;
  overlays: string[];
  overlayOpacity: number;
  opacityByLayerId: Record<string, number>;
  ortho: boolean;
  elevationRange?: ElevationColorRange;
  elevationRangeEstimated?: boolean;
}
export interface TileIssue {
  layerId: string;
  errors: number;
  successes: number;
}

function fittedText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (ctx.measureText(value).width <= maxWidth) return value;
  let low = 0, high = value.length;
  while (low < high) {
    const length = Math.ceil((low + high) / 2);
    if (ctx.measureText(`${value.slice(0, length)}…`).width <= maxWidth) low = length;
    else high = length - 1;
  }
  return `${value.slice(0, low)}…`;
}

export function frameFromSelection(map: OlMap, rect: [number, number, number, number], longEdge: number): ExportFrame {
  const size = map.getSize();
  const resolution = map.getView().getResolution();
  if (!size || !resolution || !Number.isInteger(longEdge) || longEdge < 64 || longEdge > 8192)
    throw new Error('出力範囲または解像度が不正です。');
  const [x0, y0, x1, y1] = rect;
  const rw = (x1 - x0) * size[0]!, rh = (y1 - y0) * size[1]!;
  if (rw < 30 || rh < 30) throw new Error('出力範囲をもう少し大きくしてください。');
  const factor = Math.max(Math.max(rw, rh) / longEdge, Math.sqrt(rw * rh / 32_000_000));
  const width = Math.max(1, Math.floor(rw / factor));
  const height = Math.max(1, Math.floor(rh / factor));
  const cx = (x0 + x1) * size[0]! / 2, cy = (y0 + y1) * size[1]! / 2;
  const at = (x: number, y: number) => map.getCoordinateFromPixel([cx + (x - width / 2) * factor, cy + (y - height / 2) * factor]) as Point;
  const p = at(0.5, 0.5), px = at(1.5, 0.5), py = at(0.5, 1.5);
  return {
    center: map.getCoordinateFromPixel([cx, cy]) as Point,
    resolution: resolution * factor,
    rotation: map.getView().getRotation(), width, height,
    pixelToWorld: [px[0] - p[0], py[0] - p[0], p[0], px[1] - p[1], py[1] - p[1], p[1], 0, 0, 1],
  };
}

export function scaleBar(frame: Pick<ExportFrame, 'center' | 'resolution'>, maxPixels = 150) {
  const metresPerPixel = getPointResolution('EPSG:3857', frame.resolution, frame.center, 'm');
  const target = maxPixels * metresPerPixel;
  const power = 10 ** Math.floor(Math.log10(target));
  const distance = [5, 2, 1].map((n) => n * power).find((n) => n <= target) ?? power;
  return { pixels: distance / metresPerPixel, label: distance >= 1000 ? `${distance / 1000} km` : `${distance} m` };
}
export function northAngle(frame: ExportFrame): number {
  const point = worldToOutput(frame, [frame.center[0], frame.center[1] + 1000]);
  return point ? Math.atan2(point[0] - frame.width / 2, -(point[1] - frame.height / 2)) : 0;
}

export function estimateExportElevationRange(frame: ExportFrame, signal: AbortSignal): Promise<ElevationColorRange | null> {
  const points: Point[] = [];
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
    const world = projectPoint(frame.pixelToWorld, [
      frame.width * (column + .5) / 4,
      frame.height * (row + .5) / 4,
    ]);
    if (world) points.push(world);
  }
  return estimateElevationRangeAt(points, signal);
}

function aborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('中止しました。', 'AbortError');
}

function renderComplete(map: OlMap, signal: AbortSignal, warning: (message: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      if (error) reject(error); else resolve();
    };
    const cancel = () => finish(new DOMException('中止しました。', 'AbortError'));
    const timer = window.setTimeout(() => { warning('地図の取得が完了していない部分があります。取得済み部分を使用します。'); finish(); }, 25000);
    signal.addEventListener('abort', cancel, { once: true });
    map.once('rendercomplete', () => finish());
    map.renderSync();
    if (signal.aborted) cancel();
  });
}

export async function renderMapVariant(frame: ExportFrame, variant: ExportVariant, signal: AbortSignal, warning: (message: string) => void, transparent = false, onTileIssues?: (issues: TileIssue[]) => void): Promise<HTMLCanvasElement> {
  aborted(signal);
  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-100000px;top:0;width:${frame.width}px;height:${frame.height}px;pointer-events:none`;
  document.body.append(container);
  const definitions = [variant.baseId, ...variant.overlays].map((id) => layerById.get(id)).filter((v) => !!v);
  const elevationRange = variant.elevationRange ?? { minimum: 0, maximum: 20 };
  const layers = definitions.map((definition) => {
    const layer = createMapLayer(definition,
      mapLayerOpacity(definition, variant),
      elevationRange);
    layer.setMaxZoom(24);
    layer.setZIndex(definition.layerRole === 'base' ? 0 : 20);
    return layer;
  });
  const map = new OlMap({ target: container, pixelRatio: 1, layers, controls: [], interactions: [], view: new View({
    center: frame.center, resolution: frame.resolution, rotation: frame.rotation,
    constrainResolution: false, enableRotation: true,
  }) });
  map.setSize([frame.width, frame.height]);
  const tileStats = new Map<string, TileIssue>();
  const cleanup = definitions.map((definition) => {
    const sources = [getSharedLayerSource(definition, elevationRange),
      ...(definition.vectorKind === 'river' ? [getSharedRiverGuideSource(definition)] : [])];
    const stats: TileIssue = { layerId: definition.id, errors: 0, successes: 0 };
    tileStats.set(definition.id, stats);
    const onError = () => { stats.errors += 1; };
    const onEnd = () => { stats.successes += 1; };
    sources.forEach((source) => { source.on('tileloaderror', onError); source.on('tileloadend', onEnd); });
    return () => sources.forEach((source) => { source.un('tileloaderror', onError); source.un('tileloadend', onEnd); });
  });
  try {
    await renderComplete(map, signal, warning);
    aborted(signal);
    // A missing tile can mean that this geographic tile has no published data.
    // It must never hide other successfully rendered tiles from the same layer.
    onTileIssues?.([...tileStats.values()].filter((stats) => stats.errors > 0));
    const canvas = document.createElement('canvas');
    canvas.width = frame.width; canvas.height = frame.height;
    const ctx = canvas.getContext('2d')!;
    if (!transparent) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, frame.width, frame.height); }
    container.querySelectorAll<HTMLCanvasElement>('.ol-layer canvas').forEach((layerCanvas) => {
      if (!layerCanvas.width || layerCanvas.parentElement?.style.display === 'none') return;
      try {
        const probe = document.createElement('canvas'); probe.width = probe.height = 1;
        const pc = probe.getContext('2d')!;
        pc.drawImage(layerCanvas, 0, 0, 1, 1); pc.getImageData(0, 0, 1, 1);
        ctx.save();
        ctx.globalAlpha = Number(layerCanvas.parentElement?.style.opacity || 1);
        ctx.setTransform(new DOMMatrix(layerCanvas.style.transform || undefined));
        ctx.drawImage(layerCanvas, 0, 0);
        ctx.restore();
      } catch { warning('読取り制限のある地図レイヤーを出力から除外しました。'); }
    });
    return canvas;
  } finally {
    cleanup.forEach((remove) => remove());
    map.setTarget(undefined); map.dispose(); container.remove();
  }
}

export async function compositePhotos(canvas: HTMLCanvasElement, frame: ExportFrame, photos: Photo[], opacity: number, assets: Map<string, Blob>, signal: AbortSignal, progress: (message: string) => void) {
  const ctx = canvas.getContext('2d')!;
  for (const [index, photo] of photos.entries()) {
    aborted(signal);
    const original = assets.get(photo.id);
    if (!original || !photo.registration) continue;
    progress(`オルソ写真を重畳中 ${index + 1}/${photos.length}`);
    const blob = await warp({
      bitmap: await decodePhoto(original, photo, Math.max(frame.width, frame.height)),
      sourceWidth: photo.width, sourceHeight: photo.height,
      matrix: multiply(photo.registration.inverse, frame.pixelToWorld),
      width: frame.width, height: frame.height,
      crop: photo.crop, masks: photo.masks,
    }, signal);
    const bitmap = await createImageBitmap(blob);
    ctx.globalAlpha = opacity;
    ctx.drawImage(bitmap, 0, 0);
    ctx.globalAlpha = 1;
    bitmap.close();
  }
}

function worldToOutput(frame: ExportFrame, p: Point): Point | null {
  return projectPoint(invert(frame.pixelToWorld), p);
}
export function drawAnnotations(canvas: HTMLCanvasElement, frame: ExportFrame, project: Project, includeDrawings: boolean) {
  const ctx = canvas.getContext('2d')!;
  const path = (world: number[][], close = false) => {
    const pixels = world.map((coordinate) => worldToOutput(frame, coordinate as Point));
    if (pixels.some((point) => !point)) return false;
    ctx.beginPath();
    pixels.forEach((point, index) => index ? ctx.lineTo(point![0], point![1]) : ctx.moveTo(point![0], point![1]));
    if (close) ctx.closePath();
    return true;
  };
  ctx.lineWidth = Math.max(1.5, frame.width / 2200);
  ctx.strokeStyle = '#bd245d'; ctx.fillStyle = '#bd245d33';
  const drawGeometry = (geometry: Geometry) => {
    if (geometry instanceof LineString) { if (path(geometry.getCoordinates())) ctx.stroke(); }
    else if (geometry instanceof MultiLineString) geometry.getCoordinates().forEach((line) => { if (path(line)) ctx.stroke(); });
    else if (geometry instanceof Polygon) geometry.getCoordinates().forEach((ring) => { if (path(ring, true)) { ctx.fill(); ctx.stroke(); } });
    else if (geometry instanceof MultiPolygon) geometry.getCoordinates().flat().forEach((ring) => { if (path(ring, true)) { ctx.fill(); ctx.stroke(); } });
    else if (geometry instanceof PointGeometry) {
      const point = worldToOutput(frame, geometry.getCoordinates() as Point);
      if (point) { ctx.beginPath(); ctx.arc(point[0], point[1], Math.max(3, frame.width / 900), 0, 2 * Math.PI); ctx.fill(); }
    } else if (geometry instanceof MultiPoint) geometry.getPoints().forEach(drawGeometry);
    else if (geometry instanceof GeometryCollection) geometry.getGeometries().forEach(drawGeometry);
  };
  for (const dataset of project.gis.filter((item) => item.visible)) {
    const features = new GeoJSON().readFeatures(dataset.data, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
    for (const feature of features) {
      const geometry = feature.getGeometry();
      if (geometry) drawGeometry(geometry);
    }
  }
  if (includeDrawings) for (const drawing of project.drawings.filter((d) => d.visible)) {
    const world = drawingWorldPoints(drawing, project.photos);
    if (!world) continue;
    const pixels = world.map((p) => worldToOutput(frame, p));
    if (pixels.some((p) => !p)) continue;
    ctx.beginPath();
    pixels.forEach((p, i) => i ? ctx.lineTo(p![0], p![1]) : ctx.moveTo(p![0], p![1]));
    if (drawing.type === 'Polygon') { ctx.closePath(); ctx.fillStyle = '#ee4b8e33'; ctx.fill(); }
    ctx.lineWidth = Math.max(2, frame.width / 1800);
    ctx.strokeStyle = '#ee4b8e';
    ctx.setLineDash(drawing.classification === 'estimated' ? [8, 5] : []);
    ctx.stroke(); ctx.setLineDash([]);
  }
}

export function drawMapChrome(canvas: HTMLCanvasElement, frame: ExportFrame, variant: ExportVariant, photoSources: string[], gisCount = 0): void {
  const ids = [variant.baseId, ...variant.overlays];
  const attributions = [...new Set(ids.map((id) => layerById.get(id)?.attribution).filter((value) => !!value))];
  const ctx = canvas.getContext('2d')!;
  const u = Math.min(canvas.width / 850, canvas.height / 650);
  const footer = 66 * u;
  const bx = 18 * u, by = canvas.height - footer - 14 * u;
  const bar = scaleBar(frame, canvas.width * .21);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, canvas.height - footer, canvas.width, footer);
  ctx.fillStyle = '#ffffffeb';
  ctx.fillRect(bx - 7 * u, by - 31 * u, bar.pixels + 22 * u, 43 * u);
  ctx.fillStyle = '#102a36'; ctx.font = `bold ${13 * u}px sans-serif`;
  ctx.fillText(bar.label, bx, by - 12 * u);
  ctx.fillStyle = '#102a36'; ctx.fillRect(bx, by - 7 * u, bar.pixels / 2, 7 * u);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + bar.pixels / 2, by - 7 * u, bar.pixels / 2, 7 * u);
  ctx.strokeStyle = '#102a36'; ctx.lineWidth = 1.5 * u;
  ctx.strokeRect(bx, by - 7 * u, bar.pixels, 7 * u);
  const nx = canvas.width - 33 * u, ny = 43 * u;
  ctx.fillStyle = '#ffffffeb'; ctx.fillRect(nx - 23 * u, ny - 31 * u, 46 * u, 59 * u);
  ctx.save(); ctx.translate(nx, ny); ctx.rotate(northAngle(frame));
  ctx.fillStyle = '#123b52'; ctx.beginPath(); ctx.moveTo(0, -16 * u); ctx.lineTo(-10 * u, 13 * u); ctx.lineTo(0, 7 * u); ctx.lineTo(10 * u, 13 * u); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#102a36'; ctx.font = `bold ${13 * u}px sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('N', nx, ny - 19 * u); ctx.textAlign = 'start';
  ctx.font = `${12 * u}px sans-serif`;
  const credit = 'powered by Tokyo University of Science';
  const creditWidth = ctx.measureText(credit).width + 20 * u;
  ctx.fillText(fittedText(ctx, `出典：${attributions.join(' / ')}${photoSources.length ? ` / 写真 ${photoSources.length}枚` : ''}${gisCount ? ` / 持込みGIS ${gisCount}件` : ''}`, canvas.width - 24 * u - creditWidth), 12 * u, canvas.height - 45 * u);
  if (ids.includes('gsi-relief'))
    ctx.fillText(fittedText(ctx, '海域部は海上保安庁海洋情報部の資料を使用して作成', canvas.width - 24 * u), 12 * u, canvas.height - 27 * u);
  ctx.fillText(fittedText(ctx, '簡易オルソ化・回転・重畳等の加工あり / 詳細：sources.txt', canvas.width - 24 * u), 12 * u, canvas.height - 8 * u);
  ctx.textAlign = 'right'; ctx.font = `bold ${12 * u}px sans-serif`;
  ctx.fillText(credit, canvas.width - 12 * u, canvas.height - 45 * u);
  ctx.textAlign = 'start';
}

let reliefLegendPromise: Promise<HTMLImageElement> | null = null;
function reliefLegend(): Promise<HTMLImageElement> {
  if (!reliefLegendPromise) reliefLegendPromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('国土地理院の色別標高図凡例を読み込めません。'));
    image.src = `${import.meta.env.BASE_URL}legends/Relief_hanrei.png`;
  }).catch((error) => { reliefLegendPromise = null; throw error; });
  return reliefLegendPromise!;
}

export async function drawElevationLegend(canvas: HTMLCanvasElement, variant: ExportVariant, isCurrent: () => boolean = () => true): Promise<void> {
  const u = Math.min(canvas.width / 850, canvas.height / 650);
  const x = 12 * u, y = 52 * u;
  const ctx = canvas.getContext('2d')!;
  if (variant.baseId === 'gsi-relief') {
    const image = await reliefLegend();
    if (!isCurrent()) return;
    const width = Math.min(canvas.width * .25, canvas.height * .37 * 380 / 345);
    const height = width * 345 / 380;
    ctx.fillStyle = '#ffffffed'; ctx.fillRect(x - 5 * u, y - 5 * u, width + 10 * u, height + 10 * u);
    ctx.drawImage(image, 86, 35, 380, 345, x, y, width, height);
  } else if (variant.baseId === 'gsi-relief-custom') {
    const range = variant.elevationRange;
    if (!range) throw new Error('解析用色別標高図の凡例に必要な標高レンジがありません。');
    const width = 172 * u, height = 220 * u;
    ctx.fillStyle = '#ffffffed'; ctx.fillRect(x - 5 * u, y - 5 * u, width + 10 * u, height + 10 * u);
    ctx.fillStyle = '#102a36'; ctx.font = `bold ${12 * u}px sans-serif`;
    ctx.fillText('標高（m）・解析用', x + 8 * u, y + 16 * u);
    const rampX = x + 12 * u, rampY = y + 28 * u, rampW = 26 * u, rampH = 165 * u;
    for (let i = 0; i < 165; i++) {
      const fraction = 1 - i / 164;
      const value = range.minimum + (range.maximum - range.minimum) * fraction;
      const [r, g, b] = colorForElevation(value, range);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(rampX, rampY + i * u, rampW, u + .5);
    }
    ctx.strokeStyle = '#52676c'; ctx.lineWidth = u; ctx.strokeRect(rampX, rampY, rampW, rampH);
    ctx.fillStyle = '#102a36'; ctx.font = `${11 * u}px sans-serif`;
    for (let i = 0; i <= 4; i++) {
      const value = range.maximum - (range.maximum - range.minimum) * i / 4;
      const py = rampY + rampH * i / 4;
      ctx.fillText(`${Number(value.toFixed(1))} m`, rampX + rampW + 9 * u, py + 4 * u);
    }
    ctx.fillText(variant.elevationRangeEstimated === false ? '標高未取得・設定済みレンジ' : 'DEM10Bから自動推定', x + 8 * u, y + 210 * u);
  }
}

export async function decorateMap(canvas: HTMLCanvasElement, frame: ExportFrame, variant: ExportVariant, photoSources: string[], gisCount = 0): Promise<HTMLCanvasElement> {
  drawMapChrome(canvas, frame, variant, photoSources, gisCount);
  await drawElevationLegend(canvas, variant);
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNGを作成できません。')), 'image/png'));
}

export async function obliquePair(photo: Photo, project: Project, assets: Map<string, Blob>, edge: number, signal: AbortSignal, warning: (message: string) => void): Promise<[Blob, Blob]> {
  const original = assets.get(photo.id);
  if (!original || !photo.registration) throw new Error('斜め画像の出力に必要な写真または行列がありません。');
  const referenceProject = { ...project, inverse: { ...project.inverse, baseLayerId: 'gsi-seamlessphoto', overlayIds: [], gis: false, drawings: false } };
  const reference = await inverseOverlay(photo, referenceProject, signal, warning, edge);
  const scale = Math.min(1, edge / Math.max(photo.width, photo.height), Math.sqrt(32_000_000 / (photo.width * photo.height)));
  const width = Math.max(1, Math.floor(photo.width * scale)), height = Math.max(1, Math.floor(photo.height * scale));
  const after = await warp({
    bitmap: await decodePhoto(original, photo, edge), sourceWidth: photo.width, sourceHeight: photo.height,
    matrix: [photo.width / width, 0, photo.width / width / 2 - .5, 0, photo.height / height, photo.height / height / 2 - .5, 0, 0, 1],
    width, height, crop: photo.crop, masks: photo.masks,
  }, signal);
  return [reference, after];
}

export async function decorateOblique(blob: Blob, note: string): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  const footer = Math.max(58, Math.round(bitmap.width * .025));
  canvas.width = bitmap.width; canvas.height = bitmap.height + footer;
  const ctx = canvas.getContext('2d')!;
  const imageHeight = bitmap.height;
  ctx.drawImage(bitmap, 0, 0); bitmap.close();
  ctx.fillStyle = '#fff'; ctx.fillRect(0, imageHeight, canvas.width, footer);
  ctx.fillStyle = '#17333b'; ctx.font = `${Math.max(11, Math.round(canvas.width / 280))}px sans-serif`;
  ctx.fillText(fittedText(ctx, note, canvas.width - 20), 10, imageHeight + Math.max(18, footer * .35));
  ctx.textAlign = 'center'; ctx.font = `bold ${Math.max(12, Math.round(canvas.width / 240))}px sans-serif`;
  ctx.fillText('powered by Tokyo University of Science', canvas.width / 2, canvas.height - 10);
  return canvasBlob(canvas);
}

export function sourcesText(variants: ExportVariant[], photos: Photo[], project: Project): string {
  const ids = new Set<string>([...variants.flatMap((v) => [v.baseId, ...v.overlays]), ...(photos.length ? ['gsi-seamlessphoto'] : [])]);
  return [
    '浸水域判読支援ツール：画像比較出力',
    '地図・航空写真・ハザード情報は簡易オルソ化、回転、切抜き、重畳等の加工を行っています。',
    '全国最新写真の撮影時期は地域によって異なり、災害前の写真とは限りません。_reference は時期を保証しない比較用画像です。',
    '',
    ...[...ids].map((id) => { const layer = layerById.get(id); return layer ? `${layer.titleJa}\n出典：${layer.attribution}\n詳細：${layer.sourcePageUrl}${id === 'gsi-relief' ? '\n海域部は海上保安庁海洋情報部の資料を使用して作成' : ''}\n` : ''; }),
    ...variants.filter((variant) => variant.baseId === 'gsi-relief-custom').map((variant) => `解析用色別標高図の配色範囲：${variant.elevationRange?.minimum ?? '不明'}〜${variant.elevationRange?.maximum ?? '不明'} m（${variant.elevationRangeEstimated === false ? '標高未取得のため設定済みレンジ' : '出力範囲内のDEM10B標本から推定'}）\n`),
    ...photos.map((photo, index) => `photo_${String(index + 1).padStart(3, '0')}：${photo.name} / 撮影日時：${photo.capturedAt || '未入力'} / 出典：${photo.source || '未入力'}\n`),
    ...project.gis.filter((dataset) => dataset.visible).map((dataset) => `持込みGIS：${dataset.name} / 出典・利用条件は持込み元で確認してください。\n`),
  ].join('\n');
}
