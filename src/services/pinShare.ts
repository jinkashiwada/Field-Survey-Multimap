import { pinTypeLabels, type PinRecord } from '../domain/pins';
import type { UrlMapState } from '../domain/urlState';
import { serializeUrlState } from './urlState';
import { compactShareUrl } from './compactUrl';

export type SharedPin = Pick<PinRecord, 'name' | 'type' | 'memo' | 'longitude' | 'latitude' | 'elevation' | 'elevationSource'>;
const MAX_PAYLOAD_LENGTH = 24_000;

function isSharedPin(value: unknown): value is SharedPin {
  if (!value || typeof value !== 'object') return false;
  const pin = value as Partial<SharedPin>;
  return typeof pin.name === 'string' && pin.name.length > 0 && pin.name.length <= 100
    && typeof pin.type === 'string' && Object.hasOwn(pinTypeLabels, pin.type)
    && typeof pin.memo === 'string' && pin.memo.length <= 2000
    && typeof pin.longitude === 'number' && Number.isFinite(pin.longitude) && Math.abs(pin.longitude) <= 180
    && typeof pin.latitude === 'number' && Number.isFinite(pin.latitude) && Math.abs(pin.latitude) <= 85.05112878
    && (pin.elevation === null || (typeof pin.elevation === 'number' && Number.isFinite(pin.elevation)))
    && (pin.elevationSource === null || (typeof pin.elevationSource === 'string' && pin.elevationSource.length <= 100));
}

// Whitelist fields: UUIDs, timestamps and unrelated local data are never shared.
function selectFields(pin: SharedPin, includeMemo = true): SharedPin {
  return {
    name: pin.name, type: pin.type, memo: includeMemo ? pin.memo : '',
    longitude: pin.longitude, latitude: pin.latitude,
    elevation: pin.elevation, elevationSource: pin.elevationSource,
  };
}

export function appendSharedPin(hash: string, pin: SharedPin | null): string {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  params.delete('pin');
  if (pin) {
    if (!isSharedPin(pin)) throw new Error('共有できないピン情報です。名称・座標・メモを確認してください。');
    params.set('pin', JSON.stringify({ v: 1, ...selectFields(pin) }));
  }
  return `#${params.toString()}`;
}

export function parseSharedPin(hash: string): { pin: SharedPin | null; error: string | null } {
  const invalid = { pin: null, error: '共有ピンを読み込めませんでした。URLの欠損や対応バージョンを確認してください。地図は引き続き利用できます。' };
  // Bound input before parsing JSON from an untrusted URL.
  if (hash.length > MAX_PAYLOAD_LENGTH) return invalid;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.get('shareError') === '1') return invalid;
  const raw = params.get('pin');
  if (raw === null) return { pin: null, error: null };
  if (params.get('v') !== '1' || params.getAll('pin').length !== 1) return invalid;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isSharedPin(value) || (value as { v?: unknown }).v !== 1) return invalid;
    return { pin: selectFields(value), error: null };
  } catch {
    return invalid;
  }
}

export function buildPinShareUrl(pageUrl: string, map: UrlMapState, pin: SharedPin, includeMemo: boolean): string {
  const url = new URL(pageUrl);
  url.hash = appendSharedPin(serializeUrlState({ ...map, longitude: pin.longitude, latitude: pin.latitude }), selectFields(pin, includeMemo));
  if (url.href.length > MAX_PAYLOAD_LENGTH) {
    throw new Error('共有URLが長すぎます。メモを含めずに共有するか、KML・GeoJSON出力を利用してください。');
  }
  return url.href;
}

export function buildMapShareUrl(pageUrl: string, map: UrlMapState): string {
  const url = new URL(pageUrl);
  url.hash = serializeUrlState(map);
  return url.href;
}

export async function buildCompactPinShareUrl(pageUrl: string, map: UrlMapState, pin: SharedPin, includeMemo: boolean): Promise<string> {
  return compactShareUrl(buildPinShareUrl(pageUrl, map, pin, includeMemo));
}

export async function buildCompactMapShareUrl(pageUrl: string, map: UrlMapState): Promise<string> {
  return compactShareUrl(buildMapShareUrl(pageUrl, map));
}
