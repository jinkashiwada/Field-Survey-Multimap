import { layerById } from '../config/layers';
import type { MapLayout } from '../domain/layout';
import type { PaneLayerState } from '../domain/layers';
import type { UrlMapState } from '../domain/urlState';

const LAYOUTS = new Set<MapLayout>(['single', 'split-horizontal', 'split-vertical', 'quad']);
const VERSION = '1';

function defaultPanes(): PaneLayerState[] {
  return Array.from({ length: 4 }, (_, index) => {
    const baseLayerId = index === 1 ? 'gsi-seamlessphoto' : 'gsi-std';
    return {
      baseLayerId,
      overlayLayerIds: [],
      opacityByLayerId: { [baseLayerId]: 1 },
      elevationColorRange: { minimum: 0, maximum: 20 },
    };
  });
}

export function defaultUrlState(): UrlMapState {
  return {
    longitude: 139.908,
    latitude: 35.918,
    zoom: 14,
    rotation: 0,
    layout: 'split-vertical',
    panes: defaultPanes(),
  };
}

function finiteInRange(value: string | null, minimum: number, maximum: number, fallback: number): number {
  if (value === null || value.trim() === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : fallback;
}

function parsePane(params: URLSearchParams, index: number, fallback: PaneLayerState): PaneLayerState {
  const requestedBase = params.get(`b${index}`);
  const baseDefinition = requestedBase ? layerById.get(requestedBase) : undefined;
  const baseLayerId = baseDefinition?.layerRole === 'base' ? baseDefinition.id : fallback.baseLayerId;
  const opacityByLayerId: Record<string, number> = {
    [baseLayerId]: layerById.get(baseLayerId)?.defaultOpacity ?? 1,
  };
  const overlayLayerIds: string[] = [];
  const overlayValue = params.get(`o${index}`);
  if (overlayValue) {
    for (const encoded of overlayValue.split(',')) {
      const [id, opacityValue] = encoded.split('@');
      const definition = id ? layerById.get(id) : undefined;
      if (!id || definition?.layerRole !== 'overlay' || overlayLayerIds.includes(id)) continue;
      overlayLayerIds.push(id);
      opacityByLayerId[id] = finiteInRange(opacityValue ?? null, 0, 1, definition.defaultOpacity);
    }
  }
  const baseOpacity = params.get(`a${index}`);
  opacityByLayerId[baseLayerId] = finiteInRange(baseOpacity, 0, 1, opacityByLayerId[baseLayerId]!);
  const elevationValues = params.get(`e${index}`)?.split(':') ?? [];
  const minimum = finiteInRange(elevationValues[0] ?? null, -500, 8_000, fallback.elevationColorRange.minimum);
  const maximum = finiteInRange(elevationValues[1] ?? null, -500, 8_000, fallback.elevationColorRange.maximum);
  const elevationColorRange = maximum > minimum
    ? { minimum, maximum }
    : fallback.elevationColorRange;
  return { baseLayerId, overlayLayerIds, opacityByLayerId, elevationColorRange };
}

export function parseUrlState(hash: string): UrlMapState {
  const fallback = defaultUrlState();
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  if (params.get('v') !== VERSION) return fallback;
  const requestedLayout = params.get('layout') as MapLayout | null;
  return {
    longitude: finiteInRange(params.get('lon'), -180, 180, fallback.longitude),
    latitude: finiteInRange(params.get('lat'), -85.05112878, 85.05112878, fallback.latitude),
    zoom: finiteInRange(params.get('z'), 2, 20, fallback.zoom),
    rotation: finiteInRange(params.get('rot'), -Math.PI * 2, Math.PI * 2, fallback.rotation),
    layout: requestedLayout && LAYOUTS.has(requestedLayout) ? requestedLayout : fallback.layout,
    panes: fallback.panes.map((pane, index) => parsePane(params, index, pane)),
  };
}

export function serializeUrlState(state: UrlMapState): string {
  const params = new URLSearchParams();
  params.set('v', VERSION);
  params.set('lon', state.longitude.toFixed(6));
  params.set('lat', state.latitude.toFixed(6));
  params.set('z', state.zoom.toFixed(3));
  params.set('rot', state.rotation.toFixed(6));
  params.set('layout', state.layout);
  state.panes.slice(0, 4).forEach((pane, index) => {
    params.set(`b${index}`, pane.baseLayerId);
    params.set(`a${index}`, (pane.opacityByLayerId[pane.baseLayerId] ?? 1).toFixed(2));
    if (pane.baseLayerId === 'gsi-relief-custom') {
      params.set(`e${index}`, `${pane.elevationColorRange.minimum.toFixed(1)}:${pane.elevationColorRange.maximum.toFixed(1)}`);
    }
    if (pane.overlayLayerIds.length > 0) {
      params.set(`o${index}`, pane.overlayLayerIds
        .map((id) => `${id}@${(pane.opacityByLayerId[id] ?? layerById.get(id)?.defaultOpacity ?? 1).toFixed(2)}`)
        .join(','));
    }
  });
  return `#${params.toString()}`;
}
