import { describe, expect, it } from 'vitest';
import { mapLayerOpacity } from './layerOpacity';

describe('mapLayerOpacity', () => {
  it('uses one pane-wide opacity for overlays and preserves base opacity', () => {
    const state = { overlayOpacity: .42, opacityByLayerId: { hazard: .1, river: .8, base: .63 } };
    expect(mapLayerOpacity({ id: 'hazard', layerRole: 'overlay', defaultOpacity: .65 }, state)).toBe(.42);
    expect(mapLayerOpacity({ id: 'river', layerRole: 'overlay', defaultOpacity: .75 }, state)).toBe(.42);
    expect(mapLayerOpacity({ id: 'base', layerRole: 'base', defaultOpacity: 1 }, state)).toBe(.63);
  });
});
