import Feature from 'ol/Feature';
import LayerGroup from 'ol/layer/Group';
import { describe, expect, it } from 'vitest';
import { layerById } from '../config/layers';
import { createMapLayer, riverGuideStyle, vectorTileStyle } from './mapLayers';

const WEB_MERCATOR_MAX_RESOLUTION = 156_543.033_928_040_97;

function resolutionAtZoom(zoom: number): number {
  return WEB_MERCATOR_MAX_RESOLUTION / (2 ** zoom);
}

function feature(sourceLayer: string, code: number): Feature {
  const feature = new Feature();
  feature.setProperties({ sourceLayer, ftCode: code });
  return feature;
}

describe('river vector-tile style', () => {
  it('keeps large and medium generalized rivers as continuity guides', () => {
    expect(riverGuideStyle(feature('river', 55_301), resolutionAtZoom(7))).toBeDefined();
    expect(riverGuideStyle(feature('river', 55_301), resolutionAtZoom(13))).toBeDefined();
    expect(riverGuideStyle(feature('river', 55_302), resolutionAtZoom(13))).toBeDefined();
  });

  it('keeps small and tiny generalized rivers as dashed guides when detail tiles have no line', () => {
    expect(riverGuideStyle(feature('river', 55_303), resolutionAtZoom(7))).toBeDefined();
    expect(riverGuideStyle(feature('river', 55_303), resolutionAtZoom(13))).toBeDefined();
    expect(riverGuideStyle(feature('river', 55_304), resolutionAtZoom(16))).toBeDefined();
  });

  it('draws detailed river lines and water areas without duplicating generalized lines', () => {
    expect(vectorTileStyle('river', feature('river', 5_201), resolutionAtZoom(11))).toBeDefined();
    expect(vectorTileStyle('river', feature('river', 55_301), resolutionAtZoom(11))).toBeUndefined();
    expect(vectorTileStyle('river', feature('waterarea', 5_000), resolutionAtZoom(11))).toBeDefined();
  });

  it('builds the river overlay from a continuity guide and a detail layer', () => {
    const definition = layerById.get('gsi-vector-river')!;
    const layer = createMapLayer(definition, definition.defaultOpacity, { minimum: 0, maximum: 20 });
    expect(layer).toBeInstanceOf(LayerGroup);
    expect((layer as LayerGroup).getLayers().getLength()).toBe(2);
  });
});
