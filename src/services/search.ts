import type Feature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import { getCenter } from 'ol/extent';
import { toLonLat } from 'ol/proj';
import { featureDisplayName } from './vectorStyles';

export interface SearchResult {
  label: string;
  longitude: number;
  latitude: number;
  source: 'coordinate' | 'pin' | 'gis';
}

export function parseCoordinateQuery(query: string): SearchResult | null {
  const match = query.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*[,、\s]\s*([+-]?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  let latitude = first;
  let longitude = second;
  if (Math.abs(first) > 90 && Math.abs(second) <= 90) {
    longitude = first;
    latitude = second;
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return {
    label: `座標 ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
    longitude,
    latitude,
    source: 'coordinate',
  };
}

export function searchLocalFeatures(
  query: string,
  pinFeatures: Feature<Geometry>[],
  gisFeatures: Feature<Geometry>[],
  limit = 30,
): SearchResult[] {
  const normalized = query.trim().toLocaleLowerCase('ja');
  if (!normalized) return [];
  const results: SearchResult[] = [];
  for (const [source, features] of [['pin', pinFeatures], ['gis', gisFeatures]] as const) {
    for (const feature of features) {
      const name = featureDisplayName(feature);
      if (!name?.toLocaleLowerCase('ja').includes(normalized)) continue;
      const geometry = feature.getGeometry();
      if (!geometry) continue;
      const [longitude, latitude] = toLonLat(getCenter(geometry.getExtent()));
      if (longitude === undefined || latitude === undefined) continue;
      results.push({ label: name, longitude, latitude, source });
      if (results.length >= limit) return results;
    }
  }
  return results;
}
