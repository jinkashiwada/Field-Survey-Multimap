import { useEffect, useRef, useState } from 'react';
import { MapGrid } from '../components/map/MapGrid';
import { LayoutToolbar } from '../components/toolbar/LayoutToolbar';
import { useViewport } from '../hooks/useViewport';
import { AppProvider, useAppContext } from '../state/AppContext';
import { normalizeLayout, paneCountForLayout } from '../utils/layout';
import { presetRegistry } from '../config/presets';
import { supportsQuad } from '../utils/layout';
import { useCallback } from 'react';
import { useCenterStatus } from '../hooks/useCenterStatus';
import { useGeolocation } from '../hooks/useGeolocation';
import { CenterStatusBar } from '../components/map/CenterStatusBar';
import { usePins } from '../hooks/usePins';
import { PinPanel } from '../components/pins/PinPanel';
import { GisPanel } from '../components/layers/GisPanel';
import { parseGisFile, downloadExport } from '../services/import-export/files';
import type { Extent } from 'ol/extent';
import { fromLonLat, toLonLat } from 'ol/proj';
import { useHashState } from '../hooks/useHashState';
import { copyText } from '../services/clipboard';
import { ShareFallbackDialog } from '../components/toolbar/ShareFallbackDialog';
import { SettingsPanel } from '../components/toolbar/SettingsPanel';
import { estimateVisibleElevationRange } from '../services/elevation/range';
import { SearchPanel } from '../components/toolbar/SearchPanel';
import { ObservationSitesPanel } from '../components/toolbar/ObservationSitesPanel';
import { buildMapShareUrl, parseSharedPin } from '../services/pinShare';
import { PinShareDialog } from '../components/pins/PinShareDialog';
import { SharedPinBanner } from '../components/pins/SharedPinBanner';
import type { PinRecord } from '../domain/pins';
import type { UrlMapState } from '../domain/urlState';

function AppContent() {
  const { state, dispatch, sharedView, locationSource, pinSource, gisSource } = useAppContext();
  const viewport = useViewport();
  const [pinPanelOpen, setPinPanelOpen] = useState(false);
  const [gisPanelOpen, setGisPanelOpen] = useState(false);
  const [gisCount, setGisCount] = useState(0);
  const [gisExtent, setGisExtent] = useState<Extent | null>(null);
  const [shareFallbackOpen, setShareFallbackOpen] = useState(false);
  const [shareFallbackUrl, setShareFallbackUrl] = useState('');
  const [receivedPin, setReceivedPin] = useState(() => parseSharedPin(window.location.hash));
  const [pinShare, setPinShare] = useState<{ pin: PinRecord; map: UrlMapState } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [observationSitesOpen, setObservationSitesOpen] = useState(false);
  const [elevationRangeLoadingPanes, setElevationRangeLoadingPanes] = useState<number[]>([]);
  const [pinLocation, setPinLocation] = useState<{
    longitude: number;
    latitude: number;
    elevation: number | null;
    elevationSource: string | null;
  } | null>(null);
  const effectiveLayout = normalizeLayout(state.layout, viewport);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const elevationRangeAbortRef = useRef<AbortController | null>(null);
  const autoElevationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paneSizesRef = useRef(new Map<number, readonly [number, number]>());
  const latestStateRef = useRef(state);
  const effectiveLayoutRef = useRef(effectiveLayout);
  const tileErrorTimesRef = useRef(new Map<string, number>());
  const reportTileError = useCallback((message: string) => {
    const now = Date.now();
    const previous = tileErrorTimesRef.current.get(message) ?? 0;
    if (now - previous < 30_000) return;
    tileErrorTimesRef.current.set(message, now);
    dispatch({ type: 'notify', message, preserveExisting: true });
  }, [dispatch]);
  const { status: centerStatus, updateAfterMove } = useCenterStatus(sharedView);
  const { status: locationStatus, locate } = useGeolocation(sharedView, locationSource);
  const { pins, addPin, updatePin, deletePin, clearPins } = usePins(pinSource, receivedPin.pin);
  useHashState(state, sharedView, receivedPin.pin);
  const currentMapState = (): UrlMapState => {
    const [longitude = 139.908, latitude = 35.918] = toLonLat(sharedView.getCenter() ?? fromLonLat([139.908, 35.918]));
    return { longitude, latitude, zoom: sharedView.getZoom() ?? 14, rotation: sharedView.getRotation(), layout: effectiveLayout, panes: state.panes };
  };
  const dismissSharedPin = () => {
    setReceivedPin({ pin: null, error: null });
    // Remove the payload immediately so saving/dismissing then reloading cannot import it again.
    window.history.replaceState(window.history.state, '', buildMapShareUrl(window.location.href, currentMapState()));
  };
  const selectFeature = useCallback((message: string) => dispatch({ type: 'notify', message }), [dispatch]);
  const requestPinAt = useCallback((longitude: number, latitude: number) => {
    setPinLocation({ longitude, latitude, elevation: null, elevationSource: null });
    setPinPanelOpen(true);
  }, []);
  const estimateElevationRanges = useCallback((
    paneIndices: readonly number[],
    viewportSize: readonly [number, number],
    mode: 'manual' | 'automatic',
  ) => {
    const targets = [...new Set(paneIndices)];
    if (targets.length === 0) return;
    elevationRangeAbortRef.current?.abort();
    const controller = new AbortController();
    elevationRangeAbortRef.current = controller;
    setElevationRangeLoadingPanes(targets);
    void estimateVisibleElevationRange(sharedView, controller.signal, viewportSize)
      .then((range) => {
        if (controller.signal.aborted) return;
        if (range) {
          targets.forEach((paneIndex) => dispatch({ type: 'set-elevation-range', paneIndex, range }));
          if (mode === 'manual') {
            dispatch({ type: 'notify', message: `表示範囲の16地点から標高レンジを${range.minimum}～${range.maximum} mに推定しました。` });
          }
        } else if (mode === 'manual') {
          dispatch({ type: 'notify', message: '表示範囲から十分な標高値を取得できませんでした。手動レンジを使用してください。' });
        }
      })
      .catch((error: unknown) => {
        if (mode === 'manual' && !(error instanceof DOMException && error.name === 'AbortError')) {
          dispatch({ type: 'notify', message: '標高レンジの推定に失敗しました。地図操作は継続できます。' });
        }
      })
      .finally(() => {
        if (elevationRangeAbortRef.current === controller) {
          elevationRangeAbortRef.current = null;
          setElevationRangeLoadingPanes([]);
        }
      });
  }, [dispatch, sharedView]);
  const estimateElevationRangeManually = useCallback((paneIndex: number, viewportSize: readonly [number, number]) => {
    if (autoElevationTimerRef.current) clearTimeout(autoElevationTimerRef.current);
    estimateElevationRanges([paneIndex], viewportSize, 'manual');
  }, [estimateElevationRanges]);
  const handleMapMoveEnd = useCallback((paneIndex: number, viewportSize: readonly [number, number]) => {
    paneSizesRef.current.set(paneIndex, viewportSize);
    updateAfterMove();
    if (autoElevationTimerRef.current) clearTimeout(autoElevationTimerRef.current);
    autoElevationTimerRef.current = setTimeout(() => {
      const currentState = latestStateRef.current;
      const visiblePaneCount = paneCountForLayout(effectiveLayoutRef.current);
      const targets = currentState.panes
        .slice(0, visiblePaneCount)
        .map((pane, index) => ({ pane, index }))
        .filter(({ pane }) => pane.baseLayerId === 'gsi-relief-custom' && pane.autoElevationRange)
        .map(({ index }) => index);
      if (targets.length === 0) return;
      const samplingSize = paneSizesRef.current.get(targets[0]!) ?? viewportSize;
      estimateElevationRanges(targets, samplingSize, 'automatic');
    }, 300);
  }, [estimateElevationRanges, updateAfterMove]);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    let imported = 0;
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const features = await parseGisFile(file);
        gisSource.addFeatures(features);
        imported += features.length;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : `${file.name}を読み込めませんでした。`);
      }
    }
    setGisCount(gisSource.getFeatures().length);
    const extent = gisSource.getExtent();
    setGisExtent(extent ? [...extent] as Extent : null);
    if (imported > 0) dispatch({ type: 'notify', message: `${imported}地物を読み込みました。必要に応じて「全地物へ移動」を選択してください。` });
    if (failures.length > 0) dispatch({ type: 'notify', message: failures.join(' ') });
  }, [dispatch, gisSource]);

  const exportAll = useCallback((format: 'kml' | 'geojson') => {
    const features = [...pinSource.getFeatures().filter((feature) => feature.getId() !== 'shared-preview'), ...gisSource.getFeatures()];
    if (features.length === 0) {
      dispatch({ type: 'notify', message: '出力するピンまたはGIS地物がありません。' });
      return;
    }
    try {
      downloadExport(features, format);
      dispatch({ type: 'notify', message: `${format === 'kml' ? 'KML' : 'GeoJSON'}を出力しました。` });
    } catch {
      dispatch({ type: 'notify', message: 'ファイルを出力できませんでした。' });
    }
  }, [dispatch, gisSource, pinSource]);

  useEffect(() => {
    if (locationStatus.message) dispatch({ type: 'notify', message: locationStatus.message });
  }, [dispatch, locationStatus.message]);

  useEffect(() => {
    latestStateRef.current = state;
    effectiveLayoutRef.current = effectiveLayout;
  }, [effectiveLayout, state]);

  useEffect(() => {
    if (state.layout === 'quad' && effectiveLayout !== 'quad') {
      dispatch({ type: 'set-layout', layout: effectiveLayout });
      dispatch({ type: 'notify', message: 'この画面サイズでは4画面を表示できないため、2画面へ切り替えました。' });
    } else if (state.layout !== effectiveLayout) {
      dispatch({ type: 'set-layout', layout: effectiveLayout });
    }
  }, [dispatch, effectiveLayout, state.layout]);

  useEffect(() => () => {
    elevationRangeAbortRef.current?.abort();
    if (autoElevationTimerRef.current) clearTimeout(autoElevationTimerRef.current);
  }, []);

  return (
    <main className="app-shell">
      <h1 className="visually-hidden">水害調査マルチマップ</h1>
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
        onAddPin={() => {
          setPinLocation({
            longitude: centerStatus.longitude,
            latitude: centerStatus.latitude,
            elevation: centerStatus.elevation,
            elevationSource: centerStatus.elevationSource,
          });
          setPinPanelOpen(true);
        }}
        onImport={() => { setGisPanelOpen(true); fileInputRef.current?.click(); }}
        onExportKml={() => exportAll('kml')}
        onExportGeoJson={() => exportAll('geojson')}
        onShare={() => {
          const url = buildMapShareUrl(window.location.href, currentMapState());
          void copyText(url).then((copied) => {
            if (copied) dispatch({ type: 'notify', message: '表示URLをコピーしました。' });
            else { setShareFallbackUrl(url); setShareFallbackOpen(true); }
          });
        }}
        onSearch={() => setSearchOpen(true)}
        onObservationSites={() => setObservationSitesOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept=".kml,.geojson,.json,application/vnd.google-earth.kml+xml,application/geo+json"
        multiple
        aria-label="KMLまたはGeoJSONファイルを選択"
        onChange={(event) => {
          if (event.target.files) void importFiles(event.target.files);
          event.target.value = '';
        }}
      />
      {state.notice && (
        <div className="notice" role="status">
          <span>{state.notice}</span>
          <button type="button" aria-label="通知を閉じる" onClick={() => dispatch({ type: 'clear-notice' })}>×</button>
        </div>
      )}
      <SharedPinBanner
        pin={receivedPin.pin}
        error={receivedPin.error}
        onDismiss={dismissSharedPin}
        onFocus={() => {
          if (receivedPin.pin) sharedView.animate({ center: fromLonLat([receivedPin.pin.longitude, receivedPin.pin.latitude]), duration: 300 });
        }}
        onSave={() => {
          if (!receivedPin.pin) return;
          addPin(receivedPin.pin);
          dismissSharedPin();
          dispatch({ type: 'notify', message: '共有ピンを自分のピンに保存しました。' });
        }}
      />
      <MapGrid
        layout={effectiveLayout}
        view={sharedView}
        panes={state.panes}
        onBaseChange={(paneIndex, layerId) => dispatch({ type: 'set-base-layer', paneIndex, layerId })}
        onOverlayToggle={(paneIndex, layerId) => dispatch({ type: 'toggle-overlay', paneIndex, layerId })}
        onOpacityChange={(paneIndex, layerId, opacity) => dispatch({ type: 'set-opacity', paneIndex, layerId, opacity })}
        onElevationRangeChange={(paneIndex, range) => dispatch({ type: 'set-elevation-range', paneIndex, range })}
        onAutoElevationRangeChange={(paneIndex, enabled) => dispatch({ type: 'set-auto-elevation-range', paneIndex, enabled })}
        onEstimateElevationRange={estimateElevationRangeManually}
        elevationRangeLoadingPanes={elevationRangeLoadingPanes}
        onTileError={reportTileError}
        onMoveEnd={handleMapMoveEnd}
        locationSource={locationSource}
        pinSource={pinSource}
        gisSource={gisSource}
        onFeatureSelect={selectFeature}
        onRequestPinAt={requestPinAt}
      />
      <CenterStatusBar status={centerStatus} />
      <PinPanel
        open={pinPanelOpen}
        pins={pins}
        longitude={pinLocation?.longitude ?? centerStatus.longitude}
        latitude={pinLocation?.latitude ?? centerStatus.latitude}
        elevation={pinLocation ? pinLocation.elevation : centerStatus.elevation}
        elevationSource={pinLocation ? pinLocation.elevationSource : centerStatus.elevationSource}
        onClose={() => { setPinPanelOpen(false); setPinLocation(null); }}
        onAdd={(pin) => { addPin(pin); dispatch({ type: 'notify', message: '選択地点にピンを追加しました。' }); }}
        onUpdate={(pin) => { updatePin(pin); dispatch({ type: 'notify', message: 'ピンを更新しました。' }); }}
        onDelete={deletePin}
        onClear={clearPins}
        onGoTo={(pin) => sharedView.animate({ center: fromLonLat([pin.longitude, pin.latitude]), zoom: Math.max(sharedView.getZoom() ?? 0, 16), duration: 400 })}
        onShare={(pin) => setPinShare({ pin, map: currentMapState() })}
      />
      <GisPanel
        open={gisPanelOpen}
        count={gisCount}
        canFit={gisExtent !== null}
        onClose={() => setGisPanelOpen(false)}
        onChooseFile={() => fileInputRef.current?.click()}
        onDrop={(files) => void importFiles(files)}
        onFit={() => { if (gisExtent) sharedView.fit(gisExtent, { padding: [80, 80, 80, 80], maxZoom: 17, duration: 450 }); }}
        onClear={() => { gisSource.clear(); setGisCount(0); setGisExtent(null); }}
      />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SearchPanel
        open={searchOpen}
        pinFeatures={() => pinSource.getFeatures()}
        gisFeatures={() => gisSource.getFeatures()}
        onClose={() => setSearchOpen(false)}
        onGoTo={(result) => {
          sharedView.animate({ center: fromLonLat([result.longitude, result.latitude]), zoom: Math.max(sharedView.getZoom() ?? 0, 15), duration: 400 });
          setSearchOpen(false);
          dispatch({ type: 'notify', message: `${result.label}へ移動しました。` });
        }}
      />
      <ObservationSitesPanel
        open={observationSitesOpen}
        longitude={centerStatus.longitude}
        latitude={centerStatus.latitude}
        zoom={centerStatus.zoom}
        onClose={() => setObservationSitesOpen(false)}
      />
      <ShareFallbackDialog open={shareFallbackOpen} url={shareFallbackUrl} onClose={() => setShareFallbackOpen(false)} />
      {pinShare && <PinShareDialog key={pinShare.pin.id} pin={pinShare.pin} map={pinShare.map} onClose={() => setPinShare(null)} />}
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
