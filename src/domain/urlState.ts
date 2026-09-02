import type { MapLayout } from './layout';
import type { PaneLayerState } from './layers';

export interface UrlMapState {
  longitude: number;
  latitude: number;
  zoom: number;
  rotation: number;
  layout: MapLayout;
  panes: PaneLayerState[];
}

