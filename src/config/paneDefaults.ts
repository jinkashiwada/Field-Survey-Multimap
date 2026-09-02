import type { PaneLayerState } from '../domain/layers';
import { layerById } from './layers';

export const DEFAULT_REFERENCE_OVERLAY_IDS = [
  'gsi-vector-major-road',
  'gsi-vector-railway',
  'gsi-vector-river',
  'gsi-vector-contour',
] as const;

export function createPaneLayerState(
  baseLayerId: string,
  additionalOverlayLayerIds: readonly string[] = [],
): PaneLayerState {
  const overlayLayerIds = [...new Set([
    ...additionalOverlayLayerIds,
    ...DEFAULT_REFERENCE_OVERLAY_IDS,
  ])];
  const ids = [baseLayerId, ...overlayLayerIds];
  return {
    baseLayerId,
    overlayLayerIds,
    opacityByLayerId: Object.fromEntries(
      ids.map((id) => [id, layerById.get(id)?.defaultOpacity ?? 1]),
    ),
    elevationColorRange: { minimum: 0, maximum: 20 },
    autoElevationRange: false,
  };
}

export function createDefaultPaneLayerState(index: number): PaneLayerState {
  return createPaneLayerState(index === 1 ? 'gsi-seamlessphoto' : 'gsi-std');
}
