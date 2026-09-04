import { useEffect, useRef, useState } from 'react';
import OlMap from 'ol/Map';
import type MapBrowserEvent from 'ol/MapBrowserEvent';
import type View from 'ol/View';
import LayerGroup from 'ol/layer/Group';
import Collection from 'ol/Collection';
import VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';
import type Feature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import { toLonLat } from 'ol/proj';
import { defaults as defaultControls } from 'ol/control/defaults';
import type { ElevationColorRange, PaneLayerState } from '../../domain/layers';
import { layerById } from '../../config/layers';
import { createMapLayer, getSharedLayerSource } from '../../services/mapLayers';
import { PaneLayerControls } from '../layers/PaneLayerControls';
import { locationStyle } from '../../services/locationStyle';
import { featureDisplayName, gisStyle, pinStyle } from '../../services/vectorStyles';
import { copyText } from '../../services/clipboard';
import { ElevationQuickControls } from '../layers/ElevationQuickControls';

interface ContextLocation {
  left: number;
  top: number;
  longitude: number;
  latitude: number;
  coordinate: number[];
}

interface MapPaneProps {
  index: number;
  layerControlsOpen: boolean;
  view: View;
  config: PaneLayerState;
  onLayerControlsOpenChange: (open: boolean) => void;
  onBaseChange: (id: string) => void;
  onOverlayToggle: (id: string) => void;
  onOpacityChange: (id: string, opacity: number) => void;
  onElevationRangeChange: (range: ElevationColorRange) => void;
  onAutoElevationRangeChange: (enabled: boolean) => void;
  onEstimateElevationRange: (viewportSize: readonly [number, number]) => void;
  elevationRangeLoading: boolean;
  onTileError: (message: string) => void;
  onMoveEnd: (viewportSize: readonly [number, number]) => void;
  locationSource: VectorSource<Feature<Geometry>>;
  pinSource: VectorSource<Feature<Geometry>>;
  gisSource: VectorSource<Feature<Geometry>>;
  onFeatureSelect: (name: string) => void;
  onRequestPinAt: (longitude: number, latitude: number) => void;
}

export function MapPane({ index, layerControlsOpen, view, config, onLayerControlsOpenChange, onBaseChange, onOverlayToggle, onOpacityChange, onElevationRangeChange, onAutoElevationRangeChange, onEstimateElevationRange, elevationRangeLoading, onTileError, onMoveEnd, locationSource, pinSource, gisSource, onFeatureSelect, onRequestPinAt }: MapPaneProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rasterGroupRef = useRef(new LayerGroup());
  const onMoveEndRef = useRef(onMoveEnd);
  const [contextLocation, setContextLocation] = useState<ContextLocation | null>(null);

  useEffect(() => {
    onMoveEndRef.current = onMoveEnd;
  }, [onMoveEnd]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const map = new OlMap({
      target,
      layers: [
        rasterGroupRef.current,
        new VectorLayer({ source: gisSource, style: gisStyle, zIndex: 30 }),
        new VectorLayer({ source: pinSource, style: pinStyle, zIndex: 40 }),
        new VectorLayer({ source: locationSource, style: locationStyle, zIndex: 50 }),
      ],
      view,
      controls: defaultControls({ rotate: false, attributionOptions: { collapsible: true } }),
    });
    const observer = new ResizeObserver(() => map.updateSize());
    const reportMoveEnd = () => {
      const size = map.getSize();
      onMoveEndRef.current([size?.[0] ?? target.clientWidth, size?.[1] ?? target.clientHeight]);
    };
    map.on('moveend', reportMoveEnd);
    const selectFeature = (event: unknown) => {
      const mapEvent = event as MapBrowserEvent<PointerEvent>;
      const feature = map.forEachFeatureAtPixel(mapEvent.pixel, (candidate) => candidate);
      if (feature) {
        const name = featureDisplayName(feature);
        if (name) onFeatureSelect(`選択地物：${name}`);
      }
      setContextLocation(null);
    };
    map.on('singleclick', selectFeature);
    let hoverFrame = 0;
    const showHoverName = (event: PointerEvent) => {
      cancelAnimationFrame(hoverFrame);
      hoverFrame = requestAnimationFrame(() => {
        const tooltip = tooltipRef.current;
        if (!tooltip) return;
        const pixel = map.getEventPixel(event);
        const feature = map.forEachFeatureAtPixel(pixel, (candidate) => candidate, { hitTolerance: 5 });
        const name = feature ? featureDisplayName(feature) : null;
        if (!name) {
          tooltip.hidden = true;
          target.style.cursor = '';
          return;
        }
        tooltip.textContent = name;
        tooltip.style.left = `${Math.min((pixel[0] ?? 0) + 12, target.clientWidth - 24)}px`;
        tooltip.style.top = `${Math.min((pixel[1] ?? 0) + 12, target.clientHeight - 24)}px`;
        tooltip.hidden = false;
        target.style.cursor = 'pointer';
      });
    };
    const openContextMenu = (event: MouseEvent | PointerEvent) => {
      event.preventDefault();
      const pixel = map.getEventPixel(event);
      const coordinate = map.getCoordinateFromPixel(pixel);
      if (!coordinate) return;
      const [longitude, latitude] = toLonLat(coordinate);
      if (longitude === undefined || latitude === undefined) return;
      setContextLocation({
        left: Math.min(pixel[0] ?? 0, Math.max(8, target.clientWidth - 230)),
        top: Math.min(pixel[1] ?? 0, Math.max(44, target.clientHeight - 230)),
        longitude,
        latitude,
        coordinate,
      });
    };
    let longPressTimer = 0;
    let longPressPointerId: number | null = null;
    let touchStart: [number, number] | null = null;
    let suppressContextMenuUntil = 0;
    let multiTouchGesture = false;
    const activeTouchPointers = new Set<number>();
    const cancelLongPress = () => {
      window.clearTimeout(longPressTimer);
      longPressTimer = 0;
      longPressPointerId = null;
      touchStart = null;
    };
    const startLongPress = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      activeTouchPointers.add(event.pointerId);
      cancelLongPress();
      if (activeTouchPointers.size !== 1) {
        multiTouchGesture = true;
        suppressContextMenuUntil = Date.now() + 1_500;
        return;
      }
      longPressPointerId = event.pointerId;
      touchStart = [event.clientX, event.clientY];
      longPressTimer = window.setTimeout(() => {
        if (activeTouchPointers.size === 1 && longPressPointerId === event.pointerId) openContextMenu(event);
      }, 650);
    };
    const checkLongPressMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !touchStart || event.pointerId !== longPressPointerId) return;
      if (activeTouchPointers.size !== 1) {
        cancelLongPress();
        return;
      }
      if (Math.hypot(event.clientX - touchStart[0], event.clientY - touchStart[1]) > 10) cancelLongPress();
    };
    const finishTouch = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      activeTouchPointers.delete(event.pointerId);
      if (event.pointerId === longPressPointerId || activeTouchPointers.size !== 1) cancelLongPress();
      if (multiTouchGesture && activeTouchPointers.size === 0) {
        suppressContextMenuUntil = Date.now() + 1_000;
        multiTouchGesture = false;
      }
    };
    const openSeparatedContextMenu = (event: MouseEvent | PointerEvent) => {
      if (Date.now() < suppressContextMenuUntil) {
        event.preventDefault();
        return;
      }
      openContextMenu(event);
    };
    target.addEventListener('pointermove', showHoverName);
    target.addEventListener('contextmenu', openSeparatedContextMenu);
    target.addEventListener('pointerdown', startLongPress);
    target.addEventListener('pointermove', checkLongPressMove);
    target.addEventListener('pointerup', finishTouch);
    target.addEventListener('pointercancel', finishTouch);
    observer.observe(target);
    requestAnimationFrame(() => map.updateSize());

    return () => {
      observer.disconnect();
      cancelAnimationFrame(hoverFrame);
      cancelLongPress();
      activeTouchPointers.clear();
      target.removeEventListener('pointermove', showHoverName);
      target.removeEventListener('contextmenu', openSeparatedContextMenu);
      target.removeEventListener('pointerdown', startLongPress);
      target.removeEventListener('pointermove', checkLongPressMove);
      target.removeEventListener('pointerup', finishTouch);
      target.removeEventListener('pointercancel', finishTouch);
      map.un('moveend', reportMoveEnd);
      map.un('singleclick', selectFeature);
      map.setTarget(undefined);
    };
  }, [gisSource, locationSource, onFeatureSelect, onRequestPinAt, pinSource, view]);

  useEffect(() => {
    const definitions = [config.baseLayerId, ...config.overlayLayerIds]
      .map((id) => layerById.get(id))
      .filter((definition) => definition !== undefined);
    const layers = definitions.map((definition) => createMapLayer(
      definition,
      config.opacityByLayerId[definition.id] ?? definition.defaultOpacity,
      config.elevationColorRange,
    ));
    rasterGroupRef.current.setLayers(new Collection(layers));

    const listeners = definitions.map((definition) => {
      const source = getSharedLayerSource(definition, config.elevationColorRange);
      const listener = () => onTileError(`${definition.titleJa}の一部を取得できませんでした。`);
      source.on('tileloaderror', listener);
      return { source, listener };
    });
    return () => listeners.forEach(({ source, listener }) => source.un('tileloaderror', listener));
  }, [config, onTileError]);

  return (
    <section className="map-pane" data-testid="map-pane" aria-label={`地図画面${index + 1}`}>
      <div ref={targetRef} className="map-target" />
      <PaneLayerControls
        index={index}
        open={layerControlsOpen}
        config={config}
        onOpenChange={onLayerControlsOpenChange}
        onBaseChange={onBaseChange}
        onOverlayToggle={onOverlayToggle}
        onOpacityChange={onOpacityChange}
        onElevationRangeChange={onElevationRangeChange}
      />
      {config.baseLayerId === 'gsi-relief-custom' && (
        <ElevationQuickControls
          paneNumber={index + 1}
          minimum={config.elevationColorRange.minimum}
          maximum={config.elevationColorRange.maximum}
          automatic={config.autoElevationRange}
          loading={elevationRangeLoading}
          onEstimate={() => onEstimateElevationRange([
            targetRef.current?.clientWidth ?? window.innerWidth,
            targetRef.current?.clientHeight ?? window.innerHeight,
          ])}
          onAutomaticChange={onAutoElevationRangeChange}
        />
      )}
      <div ref={tooltipRef} className="map-feature-tooltip" role="tooltip" hidden />
      {contextLocation && (
        <div
          className="map-context-menu"
          role="menu"
          aria-label="地点操作"
          style={{ left: contextLocation.left, top: contextLocation.top }}
        >
          <strong>{contextLocation.latitude.toFixed(6)}, {contextLocation.longitude.toFixed(6)}</strong>
          <button type="button" role="menuitem" onClick={() => {
            onRequestPinAt(contextLocation.longitude, contextLocation.latitude);
            setContextLocation(null);
          }}>ここにピンを追加</button>
          <button type="button" role="menuitem" onClick={() => {
            view.animate({ center: contextLocation.coordinate, duration: 300 });
            setContextLocation(null);
          }}>ここを中心に移動</button>
          <button type="button" role="menuitem" onClick={() => {
            void copyText(`${contextLocation.latitude.toFixed(6)}, ${contextLocation.longitude.toFixed(6)}`)
              .then((copied) => onFeatureSelect(copied ? '座標をコピーしました。' : '座標をコピーできませんでした。'));
            setContextLocation(null);
          }}>座標をコピー</button>
          <a
            role="menuitem"
            href={`https://maps.gsi.go.jp/#16/${contextLocation.latitude}/${contextLocation.longitude}/&base=std&ls=std&disp=1`}
            target="_blank"
            rel="noreferrer"
            onClick={() => setContextLocation(null)}
          >地理院地図で開く</a>
          <a
            role="menuitem"
            href={`https://www.google.com/maps?q=${contextLocation.latitude},${contextLocation.longitude}`}
            target="_blank"
            rel="noreferrer"
            title="選択した座標をGoogleへ送信します"
            onClick={() => setContextLocation(null)}
          >Googleマップで開く</a>
          <button type="button" role="menuitem" onClick={() => setContextLocation(null)}>閉じる</button>
        </div>
      )}
      <div className="center-crosshair" aria-hidden="true" />
    </section>
  );
}
