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
  onEstimateElevationRange: (paneIndex: number) => void;
  elevationRangeLoadingPane: number | null;
  onTileError: (message: string) => void;
  onMoveEnd: () => void;
  locationSource: VectorSource<Feature<Geometry>>;
  pinSource: VectorSource<Feature<Geometry>>;
  gisSource: VectorSource<Feature<Geometry>>;
  onFeatureSelect: (name: string) => void;
  onRequestPinAt: (longitude: number, latitude: number) => void;
}

export function MapGrid({ layout, view, panes, onBaseChange, onOverlayToggle, onOpacityChange, onElevationRangeChange, onEstimateElevationRange, elevationRangeLoadingPane, onTileError, onMoveEnd, locationSource, pinSource, gisSource, onFeatureSelect, onRequestPinAt }: MapGridProps) {
  const paneCount = paneCountForLayout(layout);
  return (
    <div className={`map-grid map-grid--${layout}`} data-layout={layout}>
      {Array.from({ length: paneCount }, (_, index) => (
        <MapPane
          key={index}
          index={index}
          view={view}
          config={panes[index]!}
          onBaseChange={(id) => onBaseChange(index, id)}
          onOverlayToggle={(id) => onOverlayToggle(index, id)}
          onOpacityChange={(id, opacity) => onOpacityChange(index, id, opacity)}
          onElevationRangeChange={(range) => onElevationRangeChange(index, range)}
          onEstimateElevationRange={() => onEstimateElevationRange(index)}
          elevationRangeLoading={elevationRangeLoadingPane === index}
          onTileError={onTileError}
          onMoveEnd={onMoveEnd}
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
