import { describe, expect, it } from 'vitest';
import { appendSharedPin, buildMapShareUrl, buildPinShareUrl, parseSharedPin, type SharedPin } from './pinShare';
import { defaultUrlState, parseUrlState, serializeUrlState } from './urlState';

const pin: SharedPin = {
  name: '痕跡① & = # 🌊', type: 'trace-candidate', memo: '日本語のメモ\n高さを確認 <script>文字列</script>',
  longitude: 140.123456, latitude: 36.234567, elevation: 12.34, elevationSource: 'DEM5A',
};

describe('single pin sharing', () => {
  it('round-trips Japanese text and focuses the pin while preserving the complete map setup and subpath', () => {
    const map = defaultUrlState();
    map.layout = 'quad';
    map.zoom = 12.345;
    map.rotation = 0.3;
    map.panes[2]!.baseLayerId = 'gsi-relief-custom';
    delete map.panes[2]!.opacityByLayerId['gsi-std'];
    map.panes[2]!.opacityByLayerId['gsi-relief-custom'] = 0.85;
    map.panes[2]!.elevationColorRange = { minimum: -3, maximum: 12 };
    map.panes[2]!.autoElevationRange = true;
    const url = new URL(buildPinShareUrl('https://example.com/my-repo/#old', map, pin, true));
    expect(url.pathname).toBe('/my-repo/');
    expect(parseSharedPin(url.hash)).toEqual({ pin, error: null });
    expect(parseUrlState(url.hash)).toEqual({ ...map, longitude: pin.longitude, latitude: pin.latitude });
  });

  it('shares only explicitly chosen fields and strips the payload from ordinary map links', () => {
    const privatePin = { ...pin, id: 'private-id', createdAt: 'private-date', secret: 'do not share' };
    const url = new URL(buildPinShareUrl('https://example.com/app/', defaultUrlState(), privatePin, false));
    const decoded = decodeURIComponent(url.hash);
    expect(parseSharedPin(url.hash).pin?.memo).toBe('');
    for (const secret of ['private-id', 'private-date', 'do not share', pin.memo]) expect(decoded).not.toContain(secret);
    const ordinary = new URL(buildMapShareUrl(url.href, defaultUrlState()));
    expect(parseSharedPin(ordinary.hash)).toEqual({ pin: null, error: null });
  });

  it('rejects corrupt, unknown-version, duplicate, overlong and invalid-coordinate payloads', () => {
    const prefix = `${serializeUrlState(defaultUrlState())}&pin=`;
    const invalid = [
      'not json', JSON.stringify({ v: 99, ...pin }),
      JSON.stringify({ v: 1, ...pin, latitude: 91 }),
      JSON.stringify({ v: 1, ...pin, type: '__proto__' }),
      JSON.stringify({ v: 1, ...pin, memo: 'x'.repeat(2001) }),
    ];
    for (const raw of invalid) {
      expect(parseSharedPin(prefix + encodeURIComponent(raw)).error).toBeTruthy();
      expect(parseSharedPin(prefix + encodeURIComponent(raw)).pin).toBeNull();
    }
    const valid = appendSharedPin(serializeUrlState(defaultUrlState()), pin);
    expect(parseSharedPin(`${valid}&pin={}`).error).toBeTruthy();
    expect(parseSharedPin(valid.replace('#v=1', '#v=99')).error).toBeTruthy();
    expect(parseSharedPin(prefix + 'x'.repeat(24001)).error).toBeTruthy();
    expect(() => buildPinShareUrl('https://example.com/' + 'x'.repeat(24000), defaultUrlState(), pin, true)).toThrow(/長すぎ/);
  });
});
