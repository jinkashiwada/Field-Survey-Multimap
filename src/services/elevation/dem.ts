export interface DemDefinition {
  id: string;
  title: string;
  zoom: number;
  url: string;
}

export interface TilePixel {
  tileX: number;
  tileY: number;
  pixelX: number;
  pixelY: number;
  zoom: number;
}

export interface ElevationResult {
  elevation: number;
  source: string;
}

export const demPriority: readonly DemDefinition[] = [
  { id: 'dem1a', title: 'DEM1A', zoom: 17, url: 'https://cyberjapandata.gsi.go.jp/xyz/dem1a_png/{z}/{x}/{y}.png' },
  { id: 'dem5a', title: 'DEM5A', zoom: 15, url: 'https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png' },
  { id: 'dem5b', title: 'DEM5B', zoom: 15, url: 'https://cyberjapandata.gsi.go.jp/xyz/dem5b_png/{z}/{x}/{y}.png' },
  { id: 'dem5c', title: 'DEM5C', zoom: 15, url: 'https://cyberjapandata.gsi.go.jp/xyz/dem5c_png/{z}/{x}/{y}.png' },
  { id: 'dem10b', title: 'DEM10B', zoom: 14, url: 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png' },
] as const;

const TILE_SIZE = 256;
const MAX_LATITUDE = 85.05112878;
const tilePromiseCache = new Map<string, Promise<ImageData | null>>();

export function decodeElevationRgb(red: number, green: number, blue: number): number | null {
  const value = 65_536 * red + 256 * green + blue;
  if (value === 8_388_608) return null;
  return (value < 8_388_608 ? value : value - 16_777_216) * 0.01;
}

export function calculateTilePixel(longitude: number, latitude: number, zoom: number): TilePixel {
  const scale = 2 ** zoom;
  const safeLongitude = Math.min(179.999999999, Math.max(-180, longitude));
  const safeLatitude = Math.min(MAX_LATITUDE, Math.max(-MAX_LATITUDE, latitude));
  const x = ((safeLongitude + 180) / 360) * scale;
  const latitudeRadians = safeLatitude * Math.PI / 180;
  const y = (1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2 * scale;
  const tileX = Math.min(scale - 1, Math.max(0, Math.floor(x)));
  const tileY = Math.min(scale - 1, Math.max(0, Math.floor(y)));
  return {
    tileX,
    tileY,
    pixelX: Math.min(255, Math.max(0, Math.floor((x - tileX) * TILE_SIZE))),
    pixelY: Math.min(255, Math.max(0, Math.floor((y - tileY) * TILE_SIZE))),
    zoom,
  };
}

function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('PNG画像を読み込めませんでした。')); };
    image.src = url;
  });
}

async function loadTileImageData(url: string, signal: AbortSignal): Promise<ImageData | null> {
  const response = await fetch(url, { signal, mode: 'cors', credentials: 'omit' });
  if (!response.ok) return null;
  const blob = await response.blob();
  const drawable = typeof createImageBitmap === 'function' ? await createImageBitmap(blob) : await imageFromBlob(blob);
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(drawable, 0, 0, TILE_SIZE, TILE_SIZE);
  if ('close' in drawable && typeof drawable.close === 'function') drawable.close();
  return context.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
}

function getTileImageData(url: string, signal: AbortSignal): Promise<ImageData | null> {
  const cached = tilePromiseCache.get(url);
  if (cached) return cached;
  const promise = loadTileImageData(url, signal).catch((error: unknown) => {
    tilePromiseCache.delete(url);
    throw error;
  });
  tilePromiseCache.set(url, promise);
  return promise;
}

export async function fetchElevation(longitude: number, latitude: number, signal: AbortSignal): Promise<ElevationResult | null> {
  for (const dem of demPriority) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const result = await fetchElevationFromDem(dem, longitude, latitude, signal);
      if (result) return result;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
    }
  }
  return null;
}

export async function fetchElevationFromDem(
  dem: DemDefinition,
  longitude: number,
  latitude: number,
  signal: AbortSignal,
): Promise<ElevationResult | null> {
  const coordinate = calculateTilePixel(longitude, latitude, dem.zoom);
  const url = dem.url
    .replace('{z}', String(coordinate.zoom))
    .replace('{x}', String(coordinate.tileX))
    .replace('{y}', String(coordinate.tileY));
  const image = await getTileImageData(url, signal);
  if (!image) return null;
  const offset = (coordinate.pixelY * TILE_SIZE + coordinate.pixelX) * 4;
  const elevation = decodeElevationRgb(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
  return elevation === null ? null : { elevation, source: dem.title };
}
