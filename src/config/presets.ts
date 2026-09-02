import type { MapLayout } from '../domain/layout';
import type { PaneLayerState } from '../domain/layers';
import { layerById } from './layers';

export interface PresetDefinition {
  id: string;
  title: string;
  description: string;
  layout: MapLayout;
  panes: PaneLayerState[];
}

function pane(baseLayerId: string, overlayLayerIds: string[] = []): PaneLayerState {
  const ids = [baseLayerId, ...overlayLayerIds];
  return {
    baseLayerId,
    overlayLayerIds,
    opacityByLayerId: Object.fromEntries(ids.map((id) => [id, layerById.get(id)?.defaultOpacity ?? 1])),
    elevationColorRange: { minimum: 0, maximum: 20 },
    autoElevationRange: false,
  };
}

export const presetRegistry: readonly PresetDefinition[] = [
  {
    id: 'field-overview', title: '現地概況', description: '標準地図と全国最新写真を比較します。', layout: 'split-vertical',
    panes: [pane('gsi-std'), pane('gsi-seamlessphoto')],
  },
  {
    id: 'terrain-and-flood', title: '地形と浸水', description: '治水地形分類と想定最大規模の洪水浸水を比較します。', layout: 'split-vertical',
    panes: [pane('gsi-pale', ['gsi-lcmfc2']), pane('gsi-pale', ['hazard-flood-l2'])],
  },
  {
    id: 'elevation-and-flood', title: '標高と浸水', description: '色別標高図と想定最大規模の洪水浸水を比較します。', layout: 'split-vertical',
    panes: [pane('gsi-relief'), pane('gsi-pale', ['hazard-flood-l2'])],
  },
  {
    id: 'microtopography', title: '微地形確認', description: '陰影起伏図と全国最新写真を比較します。', layout: 'split-vertical',
    panes: [pane('gsi-hillshade'), pane('gsi-seamlessphoto')],
  },
  {
    id: 'survey-overview', title: '痕跡調査総覧', description: '基図・写真・地形・浸水を4画面で総覧します。', layout: 'quad',
    panes: [pane('gsi-std'), pane('gsi-seamlessphoto'), pane('gsi-pale', ['gsi-lcmfc2']), pane('gsi-pale', ['hazard-flood-l2'])],
  },
] as const;
