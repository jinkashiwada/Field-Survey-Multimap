import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import View from 'ol/View';
import { fromLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import { appReducer, initialAppState, type AppAction, type AppState } from './appState';
import { parseUrlState } from '../services/urlState';

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  sharedView: View;
  locationSource: VectorSource<Feature<Geometry>>;
  pinSource: VectorSource<Feature<Geometry>>;
  gisSource: VectorSource<Feature<Geometry>>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const urlState = useMemo(() => parseUrlState(window.location.hash), []);
  const [state, dispatch] = useReducer(appReducer, {
    ...initialAppState,
    layout: urlState.layout,
    panes: urlState.panes,
  });
  const sharedView = useMemo(
    () =>
      new View({
        center: fromLonLat([urlState.longitude, urlState.latitude]),
        zoom: urlState.zoom,
        rotation: urlState.rotation,
        minZoom: 2,
        maxZoom: 20,
      }),
    [urlState],
  );
  const locationSource = useMemo(() => new VectorSource<Feature<Geometry>>(), []);
  const pinSource = useMemo(() => new VectorSource<Feature<Geometry>>(), []);
  const gisSource = useMemo(() => new VectorSource<Feature<Geometry>>(), []);
  const value = useMemo(
    () => ({ state, dispatch, sharedView, locationSource, pinSource, gisSource }),
    [state, sharedView, locationSource, pinSource, gisSource],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used inside AppProvider.');
  return context;
}
