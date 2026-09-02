import type View from 'ol/View';
import type { MapLayout } from '../../domain/layout';
import { paneCountForLayout } from '../../utils/layout';
import { MapPane } from './MapPane';

interface MapGridProps {
  layout: MapLayout;
  view: View;
}

export function MapGrid({ layout, view }: MapGridProps) {
  const paneCount = paneCountForLayout(layout);
  return (
    <div className={`map-grid map-grid--${layout}`} data-layout={layout}>
      {Array.from({ length: paneCount }, (_, index) => (
        <MapPane key={index} index={index} view={view} />
      ))}
    </div>
  );
}

