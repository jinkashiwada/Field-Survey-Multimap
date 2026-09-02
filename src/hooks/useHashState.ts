import { useEffect } from 'react';
import { toLonLat } from 'ol/proj';
import type View from 'ol/View';
import type { AppState } from '../state/appState';
import { serializeUrlState } from '../services/urlState';

export function useHashState(state: AppState, view: View): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const replaceHash = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const center = view.getCenter();
        if (!center) return;
        const [longitude = 139.908, latitude = 35.918] = toLonLat(center);
        const hash = serializeUrlState({
          longitude,
          latitude,
          zoom: view.getZoom() ?? 14,
          rotation: view.getRotation(),
          layout: state.layout,
          panes: state.panes,
        });
        const url = new URL(window.location.href);
        url.hash = hash.slice(1);
        window.history.replaceState(window.history.state, '', url);
      }, 250);
    };
    view.on(['change:center', 'change:resolution', 'change:rotation'], replaceHash);
    replaceHash();
    return () => {
      view.un(['change:center', 'change:resolution', 'change:rotation'], replaceHash);
      if (timer) clearTimeout(timer);
    };
  }, [state, view]);
}
