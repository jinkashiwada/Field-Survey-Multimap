import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import View from 'ol/View';
import { fromLonLat } from 'ol/proj';
import { appReducer, initialAppState, type AppAction, type AppState } from './appState';

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  sharedView: View;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const sharedView = useMemo(
    () =>
      new View({
        center: fromLonLat([139.908, 35.918]),
        zoom: 14,
        minZoom: 2,
        maxZoom: 20,
      }),
    [],
  );
  const value = useMemo(() => ({ state, dispatch, sharedView }), [state, sharedView]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used inside AppProvider.');
  return context;
}

