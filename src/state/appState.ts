import type { MapLayout } from '../domain/layout';

export interface AppState {
  layout: MapLayout;
  notice: string | null;
}

export type AppAction =
  | { type: 'set-layout'; layout: MapLayout }
  | { type: 'notify'; message: string }
  | { type: 'clear-notice' };

export const initialAppState: AppState = {
  layout: 'split-vertical',
  notice: null,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'set-layout':
      return { ...state, layout: action.layout };
    case 'notify':
      return { ...state, notice: action.message };
    case 'clear-notice':
      return { ...state, notice: null };
  }
}

