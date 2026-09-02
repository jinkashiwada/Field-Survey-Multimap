import { useCallback, useEffect, useState } from 'react';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import type Geometry from 'ol/geom/Geometry';
import { fromLonLat } from 'ol/proj';
import type VectorSource from 'ol/source/Vector';
import type { PinRecord } from '../domain/pins';
import { loadPins, savePins } from '../services/pinStorage';

type NewPin = Omit<PinRecord, 'id' | 'createdAt' | 'updatedAt'>;

function pinFeature(pin: PinRecord): Feature<Geometry> {
  const feature = new Feature<Geometry>({
    geometry: new Point(fromLonLat([pin.longitude, pin.latitude])),
    name: pin.name,
    pinType: pin.type,
    memo: pin.memo,
    elevation: pin.elevation,
    elevationSource: pin.elevationSource,
    createdAt: pin.createdAt,
    updatedAt: pin.updatedAt,
  });
  feature.setId(pin.id);
  return feature;
}

export function usePins(source: VectorSource<Feature<Geometry>>) {
  const [pins, setPins] = useState<PinRecord[]>(loadPins);

  useEffect(() => {
    source.clear();
    source.addFeatures(pins.map(pinFeature));
    savePins(pins);
  }, [pins, source]);

  const addPin = useCallback((input: NewPin) => {
    const now = new Date().toISOString();
    const record: PinRecord = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    setPins((current) => [...current, record]);
    return record;
  }, []);

  const updatePin = useCallback((record: PinRecord) => {
    setPins((current) => current.map((pin) => pin.id === record.id ? { ...record, updatedAt: new Date().toISOString() } : pin));
  }, []);

  const deletePin = useCallback((id: string) => setPins((current) => current.filter((pin) => pin.id !== id)), []);
  const clearPins = useCallback(() => setPins([]), []);

  return { pins, addPin, updatePin, deletePin, clearPins };
}

