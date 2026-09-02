import { describe, expect, it } from 'vitest';
import type { PinRecord } from '../domain/pins';
import { loadPins, PIN_STORAGE_KEY, savePins } from './pinStorage';

const pin: PinRecord = {
  id: 'pin-1', name: '確認地点', type: 'needs-review', memo: '日本語メモ',
  longitude: 139.9, latitude: 35.9, elevation: 12.3, elevationSource: 'DEM5A',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('pin storage', () => {
  it('returns an empty array for malformed persisted data', () => {
    expect(loadPins({ getItem: () => '{broken' })).toEqual([]);
    expect(loadPins({ getItem: () => JSON.stringify([{ id: 12 }]) })).toEqual([]);
  });

  it('round-trips valid pins under the versioned key', () => {
    let storedKey = '';
    let storedValue = '';
    expect(savePins([pin], { setItem: (key, value) => { storedKey = key; storedValue = value; } })).toBe(true);
    expect(storedKey).toBe(PIN_STORAGE_KEY);
    expect(loadPins({ getItem: () => storedValue })).toEqual([pin]);
  });
});

