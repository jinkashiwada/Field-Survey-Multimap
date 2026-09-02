import { describe, expect, it } from 'vitest';
import { presetRegistry } from '../config/presets';
import { appReducer, initialAppState } from './appState';

describe('application reducer', () => {
  it('changes pane layers independently', () => {
    const state = appReducer(initialAppState, { type: 'toggle-overlay', paneIndex: 1, layerId: 'hazard-flood-l2' });
    expect(state.panes[0]?.overlayLayerIds).toEqual([]);
    expect(state.panes[1]?.overlayLayerIds).toEqual(['hazard-flood-l2']);
  });

  it('applies the two-pane mobile form of a quad preset', () => {
    const preset = presetRegistry.find((item) => item.id === 'survey-overview')!;
    const state = appReducer(initialAppState, { type: 'apply-preset', preset, paneLimit: 2 });
    expect(state.layout).toBe('split-vertical');
    expect(state.panes[0]?.baseLayerId).toBe('gsi-std');
    expect(state.panes[1]?.baseLayerId).toBe('gsi-seamlessphoto');
    expect(state.notice).toContain('4画面版');
  });

  it('updates only a valid elevation color range', () => {
    const updated = appReducer(initialAppState, {
      type: 'set-elevation-range', paneIndex: 0, range: { minimum: -1, maximum: 9 },
    });
    expect(updated.panes[0]?.elevationColorRange).toEqual({ minimum: -1, maximum: 9 });
    const rejected = appReducer(updated, {
      type: 'set-elevation-range', paneIndex: 0, range: { minimum: 9, maximum: 9 },
    });
    expect(rejected.panes[0]?.elevationColorRange).toEqual({ minimum: -1, maximum: 9 });
  });
});
