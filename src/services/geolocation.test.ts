import { describe, expect, it } from 'vitest';
import { getGeolocationErrorMessage } from './geolocation';

describe('geolocation errors', () => {
  it.each([
    [1, '拒否'],
    [2, '取得できません'],
    [3, 'タイムアウト'],
    [999, 'エラー'],
  ])('converts error code %s to Japanese guidance', (code, expected) => {
    expect(getGeolocationErrorMessage({ code })).toContain(expected);
  });
});

