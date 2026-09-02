import { useCallback, useState } from 'react';
import Feature from 'ol/Feature';
import Circle from 'ol/geom/Circle';
import Point from 'ol/geom/Point';
import type VectorSource from 'ol/source/Vector';
import type View from 'ol/View';
import { fromLonLat } from 'ol/proj';
import type Geometry from 'ol/geom/Geometry';
import type { LocationUiState } from '../domain/location';
import { getGeolocationErrorMessage } from '../services/geolocation';

export function useGeolocation(view: View, source: VectorSource<Feature<Geometry>>) {
  const [status, setStatus] = useState<LocationUiState>({ state: 'idle', message: '' });

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus({ state: 'error', message: 'このブラウザーは位置情報に対応していません。' });
      return;
    }
    setStatus({ state: 'loading', message: '現在位置を取得しています…' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const center = fromLonLat([position.coords.longitude, position.coords.latitude]);
        source.clear();
        source.addFeatures([
          new Feature({ geometry: new Circle(center, Math.max(1, position.coords.accuracy)), kind: 'accuracy' }),
          new Feature({ geometry: new Point(center), kind: 'position' }),
        ]);
        view.animate({ center, zoom: Math.max(view.getZoom() ?? 0, 16), duration: 450 });
        setStatus({ state: 'success', message: `現在位置を表示しました（精度 約${Math.round(position.coords.accuracy)} m）。` });
      },
      (error) => setStatus({ state: 'error', message: getGeolocationErrorMessage(error) }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }, [source, view]);

  return { status, locate };
}

