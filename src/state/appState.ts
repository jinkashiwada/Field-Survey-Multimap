import type { MapLayout } from '../domain/layout';
import type { PaneLayerState } from '../domain/layers';
import type { PresetDefinition } from '../config/presets';
import { layerById } from '../config/layers';

export interface AppState {
  layout: MapLayout;
  notice: string | null;
  panes: PaneLayerState[];
}

export type AppAction =
  | { type: 'set-layout'; layout: MapLayout }
  | { type: 'set-base-layer'; paneIndex: number; layerId: string }
  | { type: 'toggle-overlay'; paneIndex: number; layerId: string }
  | { type: 'set-opacity'; paneIndex: number; layerId: string; opacity: number }
  | { type: 'apply-preset'; preset: PresetDefinition; paneLimit?: number }
  | { type: 'notify'; message: string; preserveExisting?: boolean }
  | { type: 'clear-notice' };

export const initialAppState: AppState = {
  layout: 'split-vertical',
  notice: null,
  panes: Array.from({ length: 4 }, (_, index) => ({
    baseLayerId: index === 1 ? 'gsi-seamlessphoto' : 'gsi-std',
    overlayLayerIds: [],
    opacityByLayerId: { [index === 1 ? 'gsi-seamlessphoto' : 'gsi-std']: 1 },
  })),
};

function updatePane(state: AppState, paneIndex: number, update: (pane: PaneLayerState) => PaneLayerState): AppState {
  return { ...state, panes: state.panes.map((pane, index) => index === paneIndex ? update(pane) : pane) };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'set-layout':
      return { ...state, layout: action.layout };
    case 'set-base-layer':
      return updatePane(state, action.paneIndex, (pane) => ({
        ...pane,
        baseLayerId: action.layerId,
        opacityByLayerId: {
          ...pane.opacityByLayerId,
          [action.layerId]: pane.opacityByLayerId[action.layerId] ?? layerById.get(action.layerId)?.defaultOpacity ?? 1,
        },
      }));
    case 'toggle-overlay':
      return updatePane(state, action.paneIndex, (pane) => {
        const exists = pane.overlayLayerIds.includes(action.layerId);
        return {
          ...pane,
          overlayLayerIds: exists ? pane.overlayLayerIds.filter((id) => id !== action.layerId) : [...pane.overlayLayerIds, action.layerId],
          opacityByLayerId: {
            ...pane.opacityByLayerId,
            [action.layerId]: pane.opacityByLayerId[action.layerId] ?? layerById.get(action.layerId)?.defaultOpacity ?? 1,
          },
        };
      });
    case 'set-opacity':
      return updatePane(state, action.paneIndex, (pane) => ({
        ...pane,
        opacityByLayerId: { ...pane.opacityByLayerId, [action.layerId]: Math.min(1, Math.max(0, action.opacity)) },
      }));
    case 'apply-preset': {
      const limit = action.paneLimit ?? action.preset.panes.length;
      const selected = action.preset.panes.slice(0, limit);
      return {
        ...state,
        layout: limit < action.preset.panes.length ? 'split-vertical' : action.preset.layout,
        panes: state.panes.map((pane, index) => selected[index] ? structuredClone(selected[index]) : pane),
        notice: limit < action.preset.panes.length
          ? `${action.preset.title}は4画面版です。この画面では先頭2画面を表示します。`
          : action.preset.description,
      };
    }
    case 'notify':
      return state.notice === action.message || (action.preserveExisting && state.notice)
        ? state
        : { ...state, notice: action.message };
    case 'clear-notice':
      return { ...state, notice: null };
  }
}
