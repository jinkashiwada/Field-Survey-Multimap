import { describe, expect, it } from 'vitest';
import type { PinRecord } from '../domain/pins';
import { loadPins, PIN_STORAGE_KEY, savePins, saveReceivedPin } from './pinStorage';

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

  it('saves a received pin once and does not duplicate the same shared link', () => {
    let stored: string | null = JSON.stringify([pin]);
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value; },
    };
    const received = {
      name: '共有地点', type: 'trace-candidate' as const, memo: 'QRから受信',
      longitude: 139.9, latitude: 35.9, elevation: 3.2, elevationSource: 'DEM5A',
    };
    expect(saveReceivedPin(received, storage)).toBe('saved');
    expect(saveReceivedPin(received, storage)).toBe('already-saved');
    const saved = JSON.parse(stored ?? '[]') as PinRecord[];
    expect(saved).toHaveLength(2);
    expect(saved[1]).toMatchObject(received);
    expect(saved[1]?.id).toBeTruthy();
  });
});
