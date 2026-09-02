import { describe, expect, it } from 'vitest';
import type { LayerDefinition } from '../domain/layers';
import { layerRegistry, validateLayerRegistry } from './layers';

describe('layer registry', () => {
  it('contains all 13 required definitions with valid fields', () => {
    expect(layerRegistry).toHaveLength(13);
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

