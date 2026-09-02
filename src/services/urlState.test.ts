import { describe, expect, it } from 'vitest';
import { DEFAULT_REFERENCE_OVERLAY_IDS } from '../config/paneDefaults';
import { defaultUrlState, parseUrlState, serializeUrlState } from './urlState';

describe('URL state codec', () => {
  it('enables the four reference overlays in every default pane', () => {
    for (const pane of defaultUrlState().panes) {
      expect(pane.overlayLayerIds).toEqual([...DEFAULT_REFERENCE_OVERLAY_IDS]);
    }
  });

  it('serializes and parses map state', () => {
    const state = defaultUrlState();
    state.longitude = 140.1234567;
    state.latitude = 36.7654321;
    state.zoom = 12.345;
    state.rotation = 0.25;
    state.layout = 'quad';
    state.panes[0]!.overlayLayerIds = ['hazard-flood-l2'];
    state.panes[0]!.opacityByLayerId = { 'gsi-std': 1, 'hazard-flood-l2': 0.65 };
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

  it('round-trips custom elevation ranges and rejects reversed ranges', () => {
    const state = defaultUrlState();
    state.panes[0]!.baseLayerId = 'gsi-relief-custom';
    state.panes[0]!.elevationColorRange = { minimum: -2, maximum: 12.5 };
    state.panes[0]!.autoElevationRange = true;
    const hash = serializeUrlState(state);
    expect(hash).toContain('e0=-2.0%3A12.5');
    expect(hash).toContain('ae0=1');
    expect(parseUrlState(hash).panes[0]?.elevationColorRange).toEqual({ minimum: -2, maximum: 12.5 });
    expect(parseUrlState(hash).panes[0]?.autoElevationRange).toBe(true);
    expect(parseUrlState('#v=1&b0=gsi-relief-custom&e0=20:10').panes[0]?.elevationColorRange)
      .toEqual({ minimum: 0, maximum: 20 });
  });

  it('does not serialize automatic elevation for other background maps', () => {
    const state = defaultUrlState();
    state.panes[0]!.autoElevationRange = true;
    expect(serializeUrlState(state)).not.toContain('ae0=1');
  });
});
