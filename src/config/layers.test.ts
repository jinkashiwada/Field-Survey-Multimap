import { describe, expect, it } from 'vitest';
import type { LayerDefinition } from '../domain/layers';
import { layerRegistry, validateLayerRegistry } from './layers';

describe('layer registry', () => {
  it('contains the required definitions and added lightweight layers with valid fields', () => {
    expect(layerRegistry.length).toBeGreaterThanOrEqual(13);
    expect(layerRegistry.map((layer) => layer.id)).toEqual(expect.arrayContaining([
      'gsi-seamlessphoto',
      'gsi-relief-custom',
      'gsi-vector-major-road',
      'gsi-vector-railway',
      'gsi-vector-river',
      'gsi-vector-contour',
    ]));
    expect(layerRegistry.find((layer) => layer.id === 'gsi-seamlessphoto')?.minZoom).toBe(2);
    expect(layerRegistry.find((layer) => layer.id === 'gsi-vector-river')?.minZoom).toBe(7);
    expect(validateLayerRegistry(layerRegistry)).toEqual([]);
  });

  it('detects duplicate IDs and missing required fields', () => {
    const broken: LayerDefinition[] = [
      layerRegistry[0]!,
      { ...layerRegistry[0]!, titleJa: '', sourcePageUrl: '' },
    ];
    expect(validateLayerRegistry(broken)).toContain('duplicate id: gsi-std');
    expect(validateLayerRegistry(broken)).toContain('gsi-std: missing titleJa');
    expect(validateLayerRegistry(broken)).toContain('gsi-std: missing sourcePageUrl');
  });
});
