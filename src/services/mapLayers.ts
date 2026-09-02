import type { FeatureLike } from 'ol/Feature';
import MVT from 'ol/format/MVT';
import type BaseLayer from 'ol/layer/Base';
import TileLayer from 'ol/layer/Tile';
import VectorTileLayer from 'ol/layer/VectorTile';
import ImageTile from 'ol/source/ImageTile';
import TileSource from 'ol/source/Tile';
import VectorTileSource from 'ol/source/VectorTile';
import XYZ from 'ol/source/XYZ';
import { Fill, Stroke, Style, Text } from 'ol/style';
import type { ElevationColorRange, LayerDefinition, VectorLayerKind } from '../domain/layers';

const xyzSourceCache = new Map<string, XYZ>();
const vectorTileSourceCache = new Map<string, VectorTileSource>();
const demImageSourceCache = new Map<string, ImageTile>();

const majorRoadStyle = new Style({ stroke: new Stroke({ color: '#dd3b2a', width: 2.4 }) });
const motorwayStyle = new Style({ stroke: new Stroke({ color: '#168b55', width: 3.2 }) });
const railwayStyle = new Style({ stroke: new Stroke({ color: '#5d285f', width: 2.2, lineDash: [7, 4] }) });
const riverStyle = [
  new Style({ stroke: new Stroke({ color: 'rgba(255,255,255,0.92)', width: 4.8 }) }),
  new Style({ stroke: new Stroke({ color: '#0878be', width: 2.8 }) }),
];
const largeRiverStyle = [
  new Style({ stroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 5.6 }) }),
  new Style({ stroke: new Stroke({ color: '#075d9a', width: 3.6 }) }),
];
const mediumRiverStyle = [
  new Style({ stroke: new Stroke({ color: 'rgba(255,255,255,0.92)', width: 4.8 }) }),
  new Style({ stroke: new Stroke({ color: '#0878be', width: 2.8 }) }),
];
const contourStyle = new Style({ stroke: new Stroke({ color: '#8a5f26', width: 0.85 }) });
const indexContourStyle = new Style({ stroke: new Stroke({ color: '#704315', width: 1.45 }) });
const auxiliaryContourStyle = new Style({ stroke: new Stroke({ color: '#9a7545', width: 0.75, lineDash: [8, 5] }) });
const riverLabelStyles = new Map<string, Style>();
const contourLabelStyles = new Map<string, Style>();

function sourceLayer(feature: FeatureLike): string {
  return String(feature.get('sourceLayer') ?? feature.get('layer') ?? '');
}

function textStyle(cache: Map<string, Style>, label: string, color: string): Style {
  const cached = cache.get(label);
  if (cached) return cached;
  const style = new Style({
    text: new Text({
      text: label,
      font: '600 12px sans-serif',
      fill: new Fill({ color }),
      stroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 3 }),
      overflow: true,
    }),
  });
  cache.set(label, style);
  return style;
}

function zoomFromResolution(resolution: number): number {
  return resolution > 0 ? Math.log2(156_543.033_928_040_97 / resolution) : 20;
}

export function vectorTileStyle(kind: VectorLayerKind, feature: FeatureLike, resolution = 0): Style | Style[] | undefined {
  const layer = sourceLayer(feature);
  if (kind === 'major-road') {
    if (layer !== 'road') return undefined;
    const motorway = Number(feature.get('motorway')) === 1;
    const roadCategory = Number(feature.get('rdCtg'));
    return motorway ? motorwayStyle : roadCategory === 0 ? majorRoadStyle : undefined;
  }
  if (kind === 'railway') return layer === 'railway' ? railwayStyle : undefined;
  if (kind === 'river') {
    const zoom = zoomFromResolution(resolution);
    if (layer === 'river') {
      const code = Number(feature.get('ftCode'));
      if (code === 55_301) return largeRiverStyle;
      if (code === 55_302) return zoom >= 7 ? mediumRiverStyle : undefined;
      return riverStyle;
    }
    if (layer === 'label' && Number(feature.get('annoCtg')) === 322) {
      const label = String(feature.get('knj') ?? '').trim();
      return label && zoom >= 6 ? textStyle(riverLabelStyles, label, '#174aa3') : undefined;
    }
    return undefined;
  }
  if (layer !== 'contour') return undefined;
  const code = Number(feature.get('ftCode'));
  if (code === 7352) {
    const label = String(feature.get('alti') ?? '').trim();
    return label ? textStyle(contourLabelStyles, `${label} m`, '#704315') : undefined;
  }
  if (code !== 7351 && code !== 7353) return undefined;
  const flag = Number(feature.get('altiFlag'));
  return flag === 0 ? indexContourStyle : flag === 2 ? auxiliaryContourStyle : contourStyle;
}

export function getSharedXyzSource(definition: LayerDefinition): XYZ {
  const cached = xyzSourceCache.get(definition.id);
  if (cached) return cached;
  const source = new XYZ({
    url: definition.url,
    minZoom: definition.minZoom,
    maxZoom: definition.maxZoom,
    crossOrigin: 'anonymous',
    attributions: definition.attribution,
    transition: 150,
  });
  xyzSourceCache.set(definition.id, source);
  return source;
}

function getSharedVectorTileSource(definition: LayerDefinition): VectorTileSource {
  const key = definition.url;
  const cached = vectorTileSourceCache.get(key);
  if (cached) return cached;
  const source = new VectorTileSource({
    url: definition.url,
    minZoom: 4,
    maxZoom: 16,
    format: new MVT({ layerName: 'sourceLayer' }),
    attributions: definition.attribution,
    transition: 100,
  });
  vectorTileSourceCache.set(key, source);
  return source;
}

function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('DEM画像を読み込めませんでした。')); };
    image.src = url;
  });
}

const elevationPalette = [
  [49, 54, 149],
  [116, 173, 209],
  [255, 255, 191],
  [244, 109, 67],
  [165, 0, 38],
] as const;

function colorForElevation(value: number, range: ElevationColorRange): readonly number[] {
  const normalized = Math.min(1, Math.max(0, (value - range.minimum) / (range.maximum - range.minimum)));
  const scaled = normalized * (elevationPalette.length - 1);
  const lowerIndex = Math.floor(scaled);
  const upperIndex = Math.min(elevationPalette.length - 1, lowerIndex + 1);
  const fraction = scaled - lowerIndex;
  const lower = elevationPalette[lowerIndex]!;
  const upper = elevationPalette[upperIndex]!;
  return lower.map((channel, index) => Math.round(channel + (upper[index]! - channel) * fraction));
}

async function renderDemTile(url: string, range: ElevationColorRange, signal: AbortSignal): Promise<HTMLCanvasElement> {
  const response = await fetch(url, { signal, mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`DEM tile ${response.status}`);
  const blob = await response.blob();
  const drawable = typeof createImageBitmap === 'function' ? await createImageBitmap(blob) : await imageFromBlob(blob);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('DEM再配色用Canvasを初期化できません。');
  context.drawImage(drawable, 0, 0, 256, 256);
  if ('close' in drawable && typeof drawable.close === 'function') drawable.close();
  const image = context.getImageData(0, 0, 256, 256);
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const encoded = 65_536 * image.data[offset]! + 256 * image.data[offset + 1]! + image.data[offset + 2]!;
    if (encoded === 8_388_608) {
      image.data[offset + 3] = 0;
      continue;
    }
    const elevation = (encoded < 8_388_608 ? encoded : encoded - 16_777_216) * 0.01;
    const [red, green, blue] = colorForElevation(elevation, range);
    image.data[offset] = red!;
    image.data[offset + 1] = green!;
    image.data[offset + 2] = blue!;
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function getSharedDemSource(definition: LayerDefinition, range: ElevationColorRange): ImageTile {
  const key = `${range.minimum}:${range.maximum}`;
  const cached = demImageSourceCache.get(key);
  if (cached) return cached;
  const source = new ImageTile({
    loader: async (zoom, tileX, tileY, options) => {
      const url = definition.url
        .replace('{z}', String(zoom))
        .replace('{x}', String(tileX))
        .replace('{y}', String(tileY));
      return renderDemTile(url, range, options.signal);
    },
    minZoom: 2,
    maxZoom: 14,
    crossOrigin: 'anonymous',
    attributions: definition.attribution,
    transition: 100,
    interpolate: false,
  });
  if (demImageSourceCache.size >= 8) {
    const oldest = demImageSourceCache.keys().next().value as string | undefined;
    if (oldest) demImageSourceCache.delete(oldest);
  }
  demImageSourceCache.set(key, source);
  return source;
}

export function getSharedLayerSource(definition: LayerDefinition, range: ElevationColorRange): TileSource {
  if (definition.sourceType === 'gsi-vector-tile') return getSharedVectorTileSource(definition);
  if (definition.sourceType === 'dem-rgb') return getSharedDemSource(definition, range);
  return getSharedXyzSource(definition);
}

export function createMapLayer(
  definition: LayerDefinition,
  opacity: number,
  elevationRange: ElevationColorRange,
): BaseLayer {
  const common = {
    minZoom: Math.max(0, definition.minZoom - 0.01),
    maxZoom: definition.maxZoom + 1,
    opacity,
    properties: { layerId: definition.id },
  };
  if (definition.sourceType === 'gsi-vector-tile' && definition.vectorKind) {
    return new VectorTileLayer({
      ...common,
      source: getSharedVectorTileSource(definition),
      declutter: true,
      style: (feature, resolution) => vectorTileStyle(definition.vectorKind!, feature, resolution),
    });
  }
  if (definition.sourceType === 'dem-rgb') {
    return new TileLayer({ ...common, source: getSharedDemSource(definition, elevationRange), cacheSize: 128 });
  }
  return new TileLayer({ ...common, source: getSharedXyzSource(definition) });
}
