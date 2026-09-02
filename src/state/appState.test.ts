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
});

