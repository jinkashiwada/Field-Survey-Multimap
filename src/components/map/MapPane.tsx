import { useEffect, useRef } from 'react';
import OlMap from 'ol/Map';
import type View from 'ol/View';
import { defaults as defaultControls } from 'ol/control/defaults';

interface MapPaneProps {
  index: number;
  view: View;
}

export function MapPane({ index, view }: MapPaneProps) {
  const targetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const map = new OlMap({
      target,
      layers: [],
      view,
      controls: defaultControls({ attribution: false, rotate: false }),
    });
    const observer = new ResizeObserver(() => map.updateSize());
    observer.observe(target);
    requestAnimationFrame(() => map.updateSize());

    return () => {
      observer.disconnect();
      map.setTarget(undefined);
    };
  }, [view]);

  return (
    <section className="map-pane" data-testid="map-pane" aria-label={`地図画面${index + 1}`}>
      <header className="pane-header">
        <strong>画面 {index + 1}</strong>
      </header>
      <div ref={targetRef} className="map-target" />
      <div className="center-crosshair" aria-hidden="true" />
    </section>
  );
}

