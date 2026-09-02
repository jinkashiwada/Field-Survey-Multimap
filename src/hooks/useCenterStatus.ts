import { useCallback, useEffect, useRef, useState } from 'react';
import type View from 'ol/View';
import { toLonLat } from 'ol/proj';
import type { CenterStatus } from '../domain/location';
import { fetchElevation } from '../services/elevation/dem';

const FALLBACK_CENTER: [number, number] = [139.908, 35.918];

export function useCenterStatus(view: View) {
  const [status, setStatus] = useState<CenterStatus>({
    longitude: FALLBACK_CENTER[0], latitude: FALLBACK_CENTER[1], zoom: 14,
    elevation: null, elevationSource: null, elevationState: 'loading',
  });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);

  const updateAfterMove = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    abortRef.current?.abort();
    const center = view.getCenter();
    if (!center) return;
    const [longitude = FALLBACK_CENTER[0], latitude = FALLBACK_CENTER[1]] = toLonLat(center);
    const zoom = view.getZoom() ?? 0;
    setStatus((previous) => ({ ...previous, longitude, latitude, zoom, elevationState: 'loading' }));
    const controller = new AbortController();
    abortRef.current = controller;
    timeoutRef.current = setTimeout(() => {
      void fetchElevation(longitude, latitude, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setStatus({
            longitude, latitude, zoom,
            elevation: result?.elevation ?? null,
            elevationSource: result?.source ?? null,
            elevationState: result ? 'available' : 'unavailable',
          });
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setStatus({ longitude, latitude, zoom, elevation: null, elevationSource: null, elevationState: 'unavailable' });
          }
        });
    }, 300);
  }, [view]);

  useEffect(() => {
    const initialTimer = window.setTimeout(updateAfterMove, 0);
    return () => {
      window.clearTimeout(initialTimer);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      abortRef.current?.abort();
    };
  }, [updateAfterMove]);

  return { status, updateAfterMove };
}
