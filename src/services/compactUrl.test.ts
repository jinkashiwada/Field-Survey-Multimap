import { describe, expect, it } from 'vitest';
import { compactHash, compactShareUrl, expandCompactHash } from './compactUrl';

const typicalHash = '#v=1&lon=139.908000&lat=35.918000&z=14.000&rot=0.000000&layout=quad'
  + '&b0=gsi-pale&a0=1.00&o0=gsi-vector-railway%400.90%2Cgsi-vector-river%400.90%2Cgsi-vector-contour%400.78%2Chazard-flood-l1%400.65%2Cgsi-vector-major-road%400.88'
  + '&b1=gsi-seamlessphoto&a1=1.00&o1=gsi-vector-river%400.90%2Cgsi-vector-railway%400.90%2Cgsi-vector-major-road%400.88'
  + '&b2=gsi-hillshade&a2=1.00&o2=gsi-vector-contour%400.78%2Cgsi-vector-river%400.90%2Cgsi-vector-railway%400.90%2Cgsi-vector-major-road%400.88'
  + '&b3=gsi-relief&a3=1.00&o3=gsi-vector-contour%400.78%2Cgsi-vector-river%400.90%2Cgsi-vector-railway%400.90%2Cgsi-vector-major-road%400.88';

describe('compact share URL', () => {
  it('substantially shortens a typical four-pane URL and restores every byte', async () => {
    const compact = await compactHash(typicalHash);
    expect(compact).toMatch(/^#s=1\.[A-Za-z0-9_-]+$/);
    expect(compact.length).toBeLessThan(typicalHash.length * 0.6);
    expect(await expandCompactHash(compact)).toEqual({ hash: typicalHash, error: false });
  });

  it('preserves the origin, GitHub Pages subpath and Unicode payload', async () => {
    const hash = `${typicalHash}&pin=${encodeURIComponent(JSON.stringify({ v: 1, name: '痕跡🌊', memo: '改行\n日本語' }))}`;
    const compactUrl = new URL(await compactShareUrl(`https://example.com/Field-Survey-Multimap/${hash}`));
    expect(compactUrl.pathname).toBe('/Field-Survey-Multimap/');
    expect((await expandCompactHash(compactUrl.hash)).hash).toBe(hash);
  });

  it('keeps legacy hashes and rejects corrupt or excessively expanded data', async () => {
    expect(await expandCompactHash(typicalHash)).toEqual({ hash: typicalHash, error: false });
    expect(await expandCompactHash('#s=1.invalid')).toEqual({ hash: '#v=1&shareError=1', error: true });
    const oversized = await compactHash(`#v=1&memo=${'長'.repeat(80_000)}`);
    expect((await expandCompactHash(oversized)).error).toBe(true);
  });
});
