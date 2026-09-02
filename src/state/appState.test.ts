import { describe, expect, it } from 'vitest';
import { DEFAULT_REFERENCE_OVERLAY_IDS } from '../config/paneDefaults';
import { presetRegistry } from '../config/presets';
import { appReducer, initialAppState } from './appState';

describe('application reducer', () => {
  it('changes pane layers independently', () => {
    const state = appReducer(initialAppState, { type: 'toggle-overlay', paneIndex: 1, layerId: 'hazard-flood-l2' });
    expect(state.panes[0]?.overlayLayerIds).toEqual([...DEFAULT_REFERENCE_OVERLAY_IDS]);
    expect(state.panes[1]?.overlayLayerIds).toEqual([...DEFAULT_REFERENCE_OVERLAY_IDS, 'hazard-flood-l2']);
  });

  it('prepares reference overlays for panes revealed by a larger layout', () => {
    expect(initialAppState.panes).toHaveLength(4);
    for (const pane of initialAppState.panes) {
      expect(pane.overlayLayerIds).toEqual([...DEFAULT_REFERENCE_OVERLAY_IDS]);
    }
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
    const unchanged = appReducer(updated, {
      type: 'set-elevation-range', paneIndex: 0, range: { minimum: -1, maximum: 9 },
    });
    expect(unchanged).toBe(updated);
  });

  it('toggles automatic elevation range for one pane', () => {
    const state = appReducer(initialAppState, {
      type: 'set-auto-elevation-range', paneIndex: 2, enabled: true,
    });
    expect(state.panes[2]?.autoElevationRange).toBe(true);
    expect(state.panes[0]?.autoElevationRange).toBe(false);
  });
});
