import { describe, expect, it } from 'vitest';
import { buildRiverObservationMapUrl } from './riverObservationLinks';

describe('buildRiverObservationMapUrl', () => {
  it('現在の中心と整数化したズームを公式マップURLへ設定する', () => {
    const url = new URL(buildRiverObservationMapUrl(140.1234567, 36.7654321, 13.6));
    expect(url.origin + url.pathname).toBe('https://www.river.go.jp/kawabou/pc/tmlist');
    expect(url.searchParams.get('clon')).toBe('140.123457');
    expect(url.searchParams.get('clat')).toBe('36.765432');
    expect(url.searchParams.get('zm')).toBe('14');
    expect(url.searchParams.get('fld')).toBe('0');
  });

  it('不正値と範囲外の値を安全な値へ正規化する', () => {
    const fallback = new URL(buildRiverObservationMapUrl(Number.NaN, Number.NaN, Number.NaN));
    expect(fallback.searchParams.get('clon')).toBe('139.908000');
    expect(fallback.searchParams.get('clat')).toBe('35.918000');
    expect(fallback.searchParams.get('zm')).toBe('12');

    const clamped = new URL(buildRiverObservationMapUrl(250, -90, 30));
    expect(clamped.searchParams.get('clon')).toBe('180.000000');
    expect(clamped.searchParams.get('clat')).toBe('-85.000000');
    expect(clamped.searchParams.get('zm')).toBe('18');
  });
});
