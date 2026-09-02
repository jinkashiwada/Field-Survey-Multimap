import { describe, expect, it } from 'vitest';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { fromLonLat, toLonLat } from 'ol/proj';
import { readGeoJson, readKml, writeGeoJson, writeKml } from './formats';

function samples() {
  return [
    new Feature({ geometry: new Point(fromLonLat([139.9, 35.9])), name: '日本語地点', memo: '痕跡' }),
    new Feature({ geometry: new LineString([[139.8, 35.8], [139.9, 35.9]].map((coordinate) => fromLonLat(coordinate))), name: '利根川' }),
  ];
}

describe('GeoJSON import/export', () => {
  it('round-trips coordinates and Japanese attributes', () => {
    const parsed = readGeoJson(writeGeoJson(samples()));
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.get('name')).toBe('日本語地点');
    const point = parsed[0]?.getGeometry() as Point;
    expect(toLonLat(point.getCoordinates())[0]).toBeCloseTo(139.9, 6);
  });
});

describe('KML import/export', () => {
  it('round-trips supported geometries and Japanese names', () => {
    const parsed = readKml(writeKml(samples()));
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.get('name')).toBe('日本語地点');
    expect(parsed[1]?.getGeometry()?.getType()).toBe('LineString');
  });
});
