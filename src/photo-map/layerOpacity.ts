import type { LayerDefinition, PaneLayerState } from '../domain/layers';

/** A single pane control sets the effective opacity of every overlay. */
export function mapLayerOpacity(
  definition: Pick<LayerDefinition, 'id' | 'layerRole' | 'defaultOpacity'>,
  state: Pick<PaneLayerState, 'overlayOpacity' | 'opacityByLayerId'>,
): number {
  return definition.layerRole === 'overlay'
    ? (state.overlayOpacity ?? 1)
    : (state.opacityByLayerId[definition.id] ?? definition.defaultOpacity);
}
