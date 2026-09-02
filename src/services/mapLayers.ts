import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import type { LayerDefinition } from '../domain/layers';

const sourceCache = new Map<string, XYZ>();

export function getSharedXyzSource(definition: LayerDefinition): XYZ {
  const cached = sourceCache.get(definition.id);
  if (cached) return cached;
  const source = new XYZ({
    url: definition.url,
    minZoom: definition.minZoom,
    maxZoom: definition.maxZoom,
    crossOrigin: 'anonymous',
    attributions: definition.attribution,
    transition: 150,
  });
  sourceCache.set(definition.id, source);
  return source;
}

export function createRasterLayer(definition: LayerDefinition, opacity: number): TileLayer<XYZ> {
  return new TileLayer({
    source: getSharedXyzSource(definition),
    minZoom: definition.minZoom,
    maxZoom: definition.maxZoom + 1,
    opacity,
    properties: { layerId: definition.id },
  });
}

