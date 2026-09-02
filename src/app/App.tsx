import { useEffect } from 'react';
import { MapGrid } from '../components/map/MapGrid';
import { LayoutToolbar } from '../components/toolbar/LayoutToolbar';
import { useViewport } from '../hooks/useViewport';
import { AppProvider, useAppContext } from '../state/AppContext';
import { normalizeLayout } from '../utils/layout';
import { presetRegistry } from '../config/presets';
import { supportsQuad } from '../utils/layout';
import { useCallback } from 'react';
import { useCenterStatus } from '../hooks/useCenterStatus';
import { useGeolocation } from '../hooks/useGeolocation';
import { CenterStatusBar } from '../components/map/CenterStatusBar';

function AppContent() {
  const { state, dispatch, sharedView, locationSource } = useAppContext();
  const viewport = useViewport();
  const effectiveLayout = normalizeLayout(state.layout, viewport);
  const reportTileError = useCallback((message: string) => dispatch({ type: 'notify', message }), [dispatch]);
  const { status: centerStatus, updateAfterMove } = useCenterStatus(sharedView);
  const { status: locationStatus, locate } = useGeolocation(sharedView, locationSource);

  useEffect(() => {
    if (locationStatus.message) dispatch({ type: 'notify', message: locationStatus.message });
  }, [dispatch, locationStatus.message]);

  useEffect(() => {
    if (state.layout === 'quad' && effectiveLayout !== 'quad') {
      dispatch({ type: 'set-layout', layout: effectiveLayout });
      dispatch({ type: 'notify', message: 'この画面サイズでは4画面を表示できないため、2画面へ切り替えました。' });
    } else if (state.layout !== effectiveLayout) {
      dispatch({ type: 'set-layout', layout: effectiveLayout });
    }
  }, [dispatch, effectiveLayout, state.layout]);

  return (
    <main className="app-shell">
      <header className="app-titlebar">
        <div>
          <p className="eyebrow">Version 0.1</p>
          <h1>水害調査マルチマップ</h1>
        </div>
      </header>
      <LayoutToolbar
        activeLayout={effectiveLayout}
        viewport={viewport}
        onChange={(layout) => dispatch({ type: 'set-layout', layout })}
        onPreset={(id) => {
          const preset = presetRegistry.find((candidate) => candidate.id === id);
          if (preset) dispatch({ type: 'apply-preset', preset, paneLimit: preset.layout === 'quad' && !supportsQuad(viewport) ? 2 : undefined });
        }}
        onLocate={locate}
        locationLoading={locationStatus.state === 'loading'}
      />
      {state.notice && (
        <div className="notice" role="status">
          <span>{state.notice}</span>
          <button type="button" aria-label="通知を閉じる" onClick={() => dispatch({ type: 'clear-notice' })}>×</button>
        </div>
      )}
      <MapGrid
        layout={effectiveLayout}
        view={sharedView}
        panes={state.panes}
        onBaseChange={(paneIndex, layerId) => dispatch({ type: 'set-base-layer', paneIndex, layerId })}
        onOverlayToggle={(paneIndex, layerId) => dispatch({ type: 'toggle-overlay', paneIndex, layerId })}
        onOpacityChange={(paneIndex, layerId, opacity) => dispatch({ type: 'set-opacity', paneIndex, layerId, opacity })}
        onTileError={reportTileError}
        onMoveEnd={updateAfterMove}
        locationSource={locationSource}
      />
      <CenterStatusBar status={centerStatus} />
    </main>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
