import { useEffect, useRef } from 'react';
import OlMap from 'ol/Map';
import type View from 'ol/View';
import LayerGroup from 'ol/layer/Group';
import Collection from 'ol/Collection';
import VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';
import type Feature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import { defaults as defaultControls } from 'ol/control/defaults';
import type { PaneLayerState } from '../../domain/layers';
import { layerById } from '../../config/layers';
import { createRasterLayer, getSharedXyzSource } from '../../services/mapLayers';
import { PaneLayerControls } from '../layers/PaneLayerControls';
import { locationStyle } from '../../services/locationStyle';

interface MapPaneProps {
  index: number;
  view: View;
  config: PaneLayerState;
  onBaseChange: (id: string) => void;
  onOverlayToggle: (id: string) => void;
  onOpacityChange: (id: string, opacity: number) => void;
  onTileError: (message: string) => void;
  onMoveEnd: () => void;
  locationSource: VectorSource<Feature<Geometry>>;
}

export function MapPane({ index, view, config, onBaseChange, onOverlayToggle, onOpacityChange, onTileError, onMoveEnd, locationSource }: MapPaneProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const rasterGroupRef = useRef(new LayerGroup());

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const map = new OlMap({
      target,
      layers: [rasterGroupRef.current, new VectorLayer({ source: locationSource, style: locationStyle, zIndex: 50 })],
      view,
      controls: defaultControls({ rotate: false, attributionOptions: { collapsible: true } }),
    });
    const observer = new ResizeObserver(() => map.updateSize());
    map.on('moveend', onMoveEnd);
    observer.observe(target);
    requestAnimationFrame(() => map.updateSize());

    return () => {
      observer.disconnect();
      map.un('moveend', onMoveEnd);
      map.setTarget(undefined);
    };
  }, [locationSource, onMoveEnd, view]);

  useEffect(() => {
    const definitions = [config.baseLayerId, ...config.overlayLayerIds]
      .map((id) => layerById.get(id))
      .filter((definition) => definition !== undefined);
    const layers = definitions.map((definition) => createRasterLayer(
      definition,
      config.opacityByLayerId[definition.id] ?? definition.defaultOpacity,
    ));
    rasterGroupRef.current.setLayers(new Collection(layers));

    const listeners = definitions.map((definition) => {
      const source = getSharedXyzSource(definition);
      const listener = () => onTileError(`${definition.titleJa}の一部を取得できませんでした。`);
      source.on('tileloaderror', listener);
      return { source, listener };
    });
    return () => listeners.forEach(({ source, listener }) => source.un('tileloaderror', listener));
  }, [config, onTileError]);

  return (
    <section className="map-pane" data-testid="map-pane" aria-label={`地図画面${index + 1}`}>
      <header className="pane-header">
        <strong>画面 {index + 1}</strong>
        <PaneLayerControls
          index={index}
          config={config}
          onBaseChange={onBaseChange}
          onOverlayToggle={onOverlayToggle}
          onOpacityChange={onOpacityChange}
        />
      </header>
      <div ref={targetRef} className="map-target" />
      <div className="center-crosshair" aria-hidden="true" />
    </section>
  );
}
