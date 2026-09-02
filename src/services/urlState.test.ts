import { describe, expect, it } from 'vitest';
import { defaultUrlState, parseUrlState, serializeUrlState } from './urlState';

describe('URL state codec', () => {
  it('serializes and parses map state', () => {
    const state = defaultUrlState();
    state.longitude = 140.1234567;
    state.latitude = 36.7654321;
    state.zoom = 12.345;
    state.rotation = 0.25;
    state.layout = 'quad';
    state.panes[0]!.overlayLayerIds = ['hazard-flood-l2'];
    state.panes[0]!.opacityByLayerId['hazard-flood-l2'] = 0.65;
    expect(parseUrlState(serializeUrlState(state))).toEqual({
      ...state,
      longitude: 140.123457,
      latitude: 36.765432,
    });
  });

  it('falls back safely for unknown versions, numbers and layers', () => {
    expect(parseUrlState('#v=99&lon=1')).toEqual(defaultUrlState());
    const parsed = parseUrlState('#v=1&lon=NaN&lat=999&z=-4&rot=x&layout=unknown&b0=missing&o0=missing@9,hazard-flood-l2@99');
    expect(parsed.longitude).toBe(defaultUrlState().longitude);
    expect(parsed.latitude).toBe(defaultUrlState().latitude);
    expect(parsed.layout).toBe(defaultUrlState().layout);
    expect(parsed.panes[0]?.baseLayerId).toBe('gsi-std');
    expect(parsed.panes[0]?.overlayLayerIds).toEqual(['hazard-flood-l2']);
    expect(parsed.panes[0]?.opacityByLayerId['hazard-flood-l2']).toBe(0.65);
  });
});

