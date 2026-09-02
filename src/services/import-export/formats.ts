import Feature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import GeoJSON from 'ol/format/GeoJSON';
import KML from 'ol/format/KML';

export type GisFormat = 'geojson' | 'kml';
const SUPPORTED_GEOMETRIES = new Set([
  'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon',
]);

const geoJsonFormat = new GeoJSON();
const kmlFormat = new KML({ extractStyles: false, showPointNames: false });
const projectionOptions = { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' } as const;

function filterSupported(features: Feature<Geometry>[]): Feature<Geometry>[] {
  return features.filter((feature) => {
    const geometry = feature.getGeometry();
    return Boolean(geometry && SUPPORTED_GEOMETRIES.has(geometry.getType()));
  });
}

export function readGeoJson(text: string): Feature<Geometry>[] {
  return filterSupported(geoJsonFormat.readFeatures(text, projectionOptions) as Feature<Geometry>[]);
}

export function readKml(text: string): Feature<Geometry>[] {
  return filterSupported(kmlFormat.readFeatures(text, projectionOptions) as Feature<Geometry>[]);
}

export function writeGeoJson(features: readonly Feature<Geometry>[]): string {
  return geoJsonFormat.writeFeatures([...features], projectionOptions);
}

export function writeKml(features: readonly Feature<Geometry>[]): string {
  return kmlFormat.writeFeatures([...features], projectionOptions);
}

export function formatFromFile(file: Pick<File, 'name' | 'type'>): GisFormat | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.geojson') || name.endsWith('.json') || file.type === 'application/geo+json') return 'geojson';
  if (name.endsWith('.kml') || file.type === 'application/vnd.google-earth.kml+xml') return 'kml';
  return null;
}

