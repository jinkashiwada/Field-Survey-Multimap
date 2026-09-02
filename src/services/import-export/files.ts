import type Feature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import { formatFromFile, readGeoJson, readKml, writeGeoJson, writeKml, type GisFormat } from './formats';

export const MAX_GIS_FILE_SIZE = 20 * 1024 * 1024;
export const MAX_GIS_FEATURES = 50_000;

export async function parseGisFile(file: File): Promise<Feature<Geometry>[]> {
  if (file.size > MAX_GIS_FILE_SIZE) throw new Error(`${file.name}は20 MBを超えるため読み込めません。`);
  const format = formatFromFile(file);
  if (!format) throw new Error(`${file.name}はKMLまたはGeoJSONではありません。`);
  const text = await file.text();
  let features: Feature<Geometry>[];
  try {
    features = format === 'kml' ? readKml(text) : readGeoJson(text);
  } catch {
    throw new Error(`${file.name}を解析できませんでした。ファイル形式を確認してください。`);
  }
  if (features.length > MAX_GIS_FEATURES) throw new Error(`${file.name}は50,000地物を超えるため読み込めません。`);
  if (features.length === 0) throw new Error(`${file.name}に対応する地物がありません。`);
  return features;
}

function timestampForFile(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function createExport(features: readonly Feature<Geometry>[], format: GisFormat) {
  const isKml = format === 'kml';
  return {
    text: isKml ? writeKml(features) : writeGeoJson(features),
    mime: isKml ? 'application/vnd.google-earth.kml+xml' : 'application/geo+json',
    filename: `flood-multimap-${timestampForFile()}.${isKml ? 'kml' : 'geojson'}`,
  };
}

export function downloadExport(features: readonly Feature<Geometry>[], format: GisFormat): void {
  const output = createExport(features, format);
  const url = URL.createObjectURL(new Blob([output.text], { type: `${output.mime};charset=utf-8` }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = output.filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

