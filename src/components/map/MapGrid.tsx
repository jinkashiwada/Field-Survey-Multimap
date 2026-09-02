import type View from 'ol/View';
import type { MapLayout } from '../../domain/layout';
import type { PaneLayerState } from '../../domain/layers';
import { paneCountForLayout } from '../../utils/layout';
import { MapPane } from './MapPane';

interface MapGridProps {
  layout: MapLayout;
  view: View;
  panes: PaneLayerState[];
  onBaseChange: (paneIndex: number, id: string) => void;
  onOverlayToggle: (paneIndex: number, id: string) => void;
  onOpacityChange: (paneIndex: number, id: string, opacity: number) => void;
  onTileError: (message: string) => void;
}

export function MapGrid({ layout, view, panes, onBaseChange, onOverlayToggle, onOpacityChange, onTileError }: MapGridProps) {
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
          onTileError={onTileError}
        />
      ))}
    </div>
  );
}
