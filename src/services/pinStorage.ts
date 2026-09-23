import type { PinRecord, PinType } from '../domain/pins';
import type { SharedPin } from './pinShare';

export const PIN_STORAGE_KEY = 'flood-multimap:pins:v1';
const PIN_TYPES: readonly PinType[] = ['trace-candidate', 'needs-review', 'danger', 'memo'];

function isPinRecord(value: unknown): value is PinRecord {
  if (!value || typeof value !== 'object') return false;
  const pin = value as Partial<PinRecord>;
  return typeof pin.id === 'string'
    && typeof pin.name === 'string'
    && typeof pin.memo === 'string'
    && PIN_TYPES.includes(pin.type as PinType)
    && typeof pin.longitude === 'number' && Number.isFinite(pin.longitude)
    && typeof pin.latitude === 'number' && Number.isFinite(pin.latitude)
    && (pin.elevation === null || typeof pin.elevation === 'number')
    && (pin.elevationSource === null || typeof pin.elevationSource === 'string')
    && typeof pin.createdAt === 'string'
    && typeof pin.updatedAt === 'string';
}

export function loadPins(storage: Pick<Storage, 'getItem'> = localStorage): PinRecord[] {
  try {
    const raw = storage.getItem(PIN_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPinRecord);
  } catch {
    return [];
  }
}

export function savePins(pins: readonly PinRecord[], storage: Pick<Storage, 'setItem'> = localStorage): boolean {
  try {
    storage.setItem(PIN_STORAGE_KEY, JSON.stringify(pins));
    return true;
  } catch {
    return false;
  }
}

function matchesSharedPin(saved: PinRecord, received: SharedPin): boolean {
  return saved.name === received.name
    && saved.type === received.type
    && saved.memo === received.memo
    && saved.longitude === received.longitude
    && saved.latitude === received.latitude
    && saved.elevation === received.elevation
    && saved.elevationSource === received.elevationSource;
}

export function saveReceivedPin(
  pin: SharedPin,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): 'saved' | 'already-saved' | 'failed' {
  const pins = loadPins(storage);
  if (pins.some((saved) => matchesSharedPin(saved, pin))) return 'already-saved';
  const now = new Date().toISOString();
  const record: PinRecord = {
    ...pin,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  return savePins([...pins, record], storage) ? 'saved' : 'failed';
}
