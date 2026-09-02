import Feature from 'ol/Feature';
import { describe, expect, it } from 'vitest';
import { vectorTileStyle } from './mapLayers';

const WEB_MERCATOR_MAX_RESOLUTION = 156_543.033_928_040_97;

function resolutionAtZoom(zoom: number): number {
  return WEB_MERCATOR_MAX_RESOLUTION / (2 ** zoom);
}

function riverFeature(code: number): Feature {
  const feature = new Feature();
  feature.setProperties({ sourceLayer: 'river', ftCode: code });
  return feature;
}

describe('river vector-tile style', () => {
  it('shows only large generalized rivers at very small zooms', () => {
    expect(vectorTileStyle('river', riverFeature(55_301), resolutionAtZoom(5))).toBeDefined();
    expect(vectorTileStyle('river', riverFeature(55_302), resolutionAtZoom(5))).toBeUndefined();
  });

  it('adds medium generalized rivers from zoom 7', () => {
    expect(vectorTileStyle('river', riverFeature(55_302), resolutionAtZoom(6))).toBeUndefined();
    expect(vectorTileStyle('river', riverFeature(55_302), resolutionAtZoom(7))).toBeDefined();
  });

  it('keeps detailed river features visible at field-survey zooms', () => {
    expect(vectorTileStyle('river', riverFeature(5_201), resolutionAtZoom(11))).toBeDefined();
  });
});
