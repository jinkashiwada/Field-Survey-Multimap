const RIVER_INFORMATION_MAP_URL = 'https://www.river.go.jp/kawabou/pc/tmlist';
export const HYDROLOGICAL_DATABASE_MAP_URL = 'https://www1.river.go.jp/cgi-bin/SelectMap.do';

const DEFAULT_LONGITUDE = 139.908;
const DEFAULT_LATITUDE = 35.918;
const DEFAULT_ZOOM = 12;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function buildRiverObservationMapUrl(longitude: number, latitude: number, zoom: number): string {
  const safeLongitude = Math.max(-180, Math.min(180, finiteOr(longitude, DEFAULT_LONGITUDE)));
  const safeLatitude = Math.max(-85, Math.min(85, finiteOr(latitude, DEFAULT_LATITUDE)));
  const safeZoom = Math.max(5, Math.min(18, Math.round(finiteOr(zoom, DEFAULT_ZOOM))));
  const parameters = new URLSearchParams({
    clat: safeLatitude.toFixed(6),
    clon: safeLongitude.toFixed(6),
    fld: '0',
    zm: String(safeZoom),
  });
  return `${RIVER_INFORMATION_MAP_URL}?${parameters.toString()}`;
}
