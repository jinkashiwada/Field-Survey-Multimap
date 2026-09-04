import { useState } from 'react';
import type View from 'ol/View';
import type { MapLayout } from '../../domain/layout';
import type { ElevationColorRange, PaneLayerState } from '../../domain/layers';
import { paneCountForLayout } from '../../utils/layout';
import { MapPane } from './MapPane';
import type VectorSource from 'ol/source/Vector';
import type Feature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';

interface MapGridProps {
  layout: MapLayout;
  view: View;
  panes: PaneLayerState[];
  onBaseChange: (paneIndex: number, id: string) => void;
  onOverlayToggle: (paneIndex: number, id: string) => void;
  onOpacityChange: (paneIndex: number, id: string, opacity: number) => void;
  onElevationRangeChange: (paneIndex: number, range: ElevationColorRange) => void;
  onAutoElevationRangeChange: (paneIndex: number, enabled: boolean) => void;
  onEstimateElevationRange: (paneIndex: number, viewportSize: readonly [number, number]) => void;
  elevationRangeLoadingPanes: readonly number[];
  onTileError: (message: string) => void;
  onMoveEnd: (paneIndex: number, viewportSize: readonly [number, number]) => void;
  locationSource: VectorSource<Feature<Geometry>>;
  pinSource: VectorSource<Feature<Geometry>>;
  gisSource: VectorSource<Feature<Geometry>>;
  onFeatureSelect: (name: string) => void;
  onRequestPinAt: (longitude: number, latitude: number) => void;
}

export function MapGrid({ layout, view, panes, onBaseChange, onOverlayToggle, onOpacityChange, onElevationRangeChange, onAutoElevationRangeChange, onEstimateElevationRange, elevationRangeLoadingPanes, onTileError, onMoveEnd, locationSource, pinSource, gisSource, onFeatureSelect, onRequestPinAt }: MapGridProps) {
  const paneCount = paneCountForLayout(layout);
  const [activeLayerPaneIndex, setActiveLayerPaneIndex] = useState<number | null>(null);
  const visibleLayerPaneIndex = activeLayerPaneIndex !== null && activeLayerPaneIndex < paneCount
    ? activeLayerPaneIndex
    : null;

  const changeLayerControls = (paneIndex: number, open: boolean) => {
    setActiveLayerPaneIndex((current) => open ? paneIndex : (current === paneIndex ? null : current));
  };

  return (
    <div className={`map-grid map-grid--${layout}`} data-layout={layout}>
      {Array.from({ length: paneCount }, (_, index) => (
        <MapPane
          key={index}
          index={index}
          layerControlsOpen={visibleLayerPaneIndex === index}
          view={view}
          config={panes[index]!}
          onLayerControlsOpenChange={(open) => changeLayerControls(index, open)}
          onBaseChange={(id) => onBaseChange(index, id)}
          onOverlayToggle={(id) => onOverlayToggle(index, id)}
          onOpacityChange={(id, opacity) => onOpacityChange(index, id, opacity)}
          onElevationRangeChange={(range) => onElevationRangeChange(index, range)}
          onAutoElevationRangeChange={(enabled) => onAutoElevationRangeChange(index, enabled)}
          onEstimateElevationRange={(viewportSize) => onEstimateElevationRange(index, viewportSize)}
          elevationRangeLoading={elevationRangeLoadingPanes.includes(index)}
          onTileError={onTileError}
          onMoveEnd={(viewportSize) => onMoveEnd(index, viewportSize)}
          locationSource={locationSource}
          pinSource={pinSource}
          gisSource={gisSource}
          onFeatureSelect={onFeatureSelect}
          onRequestPinAt={onRequestPinAt}
        />
      ))}
    </div>
  );
}
