import { describe, expect, it } from 'vitest';
import { normalizeLayout, paneCountForLayout, splitForViewport, supportsQuad } from './layout';

describe('responsive map layouts', () => {
  it('allows quad only at the minimum usable desktop size', () => {
    expect(supportsQuad({ width: 1024, height: 700 })).toBe(true);
    expect(supportsQuad({ width: 1023, height: 900 })).toBe(false);
    expect(supportsQuad({ width: 1400, height: 699 })).toBe(false);
  });

  it('chooses the split direction from viewport orientation', () => {
    expect(splitForViewport({ width: 1200, height: 700 })).toBe('split-vertical');
    expect(splitForViewport({ width: 390, height: 844 })).toBe('split-horizontal');
  });

  it('downgrades quad to two panes on a phone', () => {
    expect(normalizeLayout('quad', { width: 390, height: 844 })).toBe('split-horizontal');
    expect(paneCountForLayout(normalizeLayout('quad', { width: 390, height: 844 }))).toBe(2);
  });
});

