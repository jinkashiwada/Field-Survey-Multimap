import { describe, expect, it } from 'vitest';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import { parseCoordinateQuery, searchLocalFeatures } from './search';

describe('search', () => {
  it('parses latitude-longitude and longitude-latitude pairs', () => {
    expect(parseCoordinateQuery('35.6904, 139.8688')).toMatchObject({ latitude: 35.6904, longitude: 139.8688 });
    expect(parseCoordinateQuery('139.8688 35.6904')).toMatchObject({ latitude: 35.6904, longitude: 139.8688 });
    expect(parseCoordinateQuery('999, 999')).toBeNull();
  });

  it('searches named local features', () => {
    const feature = new Feature({ geometry: new Point(fromLonLat([139.9, 35.9])), name: '利根川' });
    const results = searchLocalFeatures('利根', [], [feature]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ label: '利根川', source: 'gis' });
  });
});
