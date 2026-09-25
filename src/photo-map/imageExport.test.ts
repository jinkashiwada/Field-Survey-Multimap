import { describe, expect, it } from 'vitest';
import type OlMap from 'ol/Map.js';
import { fromLonLat } from 'ol/proj.js';
import { frameFromSelection, northAngle, scaleBar } from './imageExport';
import { projectPoint } from './homography';
import { emptyProject } from './model';
import { validateProject } from './validation';

describe('comparison image geometry', () => {
  it('keeps a rotated crop in a single affine frame for every export', () => {
    const map = {
      getSize: () => [1000, 800],
      getView: () => ({ getResolution: () => 2, getRotation: () => .3 }),
      getCoordinateFromPixel: ([x, y]: number[]) => [1000 + 3 * x! + 4 * y!, 2000 + 5 * x! - 6 * y!],
    } as unknown as OlMap;
    const frame = frameFromSelection(map, [.1, .2, .9, .8], 400);
    expect([frame.width, frame.height]).toEqual([400, 240]);
    expect(frame.resolution).toBe(4);
    const first = projectPoint(frame.pixelToWorld, [0, 0])!;
    const last = projectPoint(frame.pixelToWorld, [frame.width - 1, frame.height - 1])!;
    expect(first[0]).toBeCloseTo(1000 + 3 * 101 + 4 * 161, 6);
    expect(first[1]).toBeCloseTo(2000 + 5 * 101 - 6 * 161, 6);
    expect(last[0]).toBeCloseTo(1000 + 3 * 899 + 4 * 639, 6);
    expect(last[1]).toBeCloseTo(2000 + 5 * 899 - 6 * 639, 6);
  });
  it('uses ground distance at latitude for a legible metric scale', () => {
    const equator = scaleBar({ center: fromLonLat([139, 0]) as [number, number], resolution: 5 });
    const japan = scaleBar({ center: fromLonLat([139, 36]) as [number, number], resolution: 5 });
    expect(equator.label).toMatch(/m|km/);
    expect(japan.pixels).toBeGreaterThan(0);
    expect(japan.pixels).toBeLessThanOrEqual(150);
    expect(japan.pixels).not.toBe(equator.pixels);
  });
  it('uses the rotated frame to point north rather than a fixed page direction', () => {
    const base = { center: [0, 0] as [number, number], resolution: 1, rotation: 0, width: 200, height: 200 };
    expect(northAngle({ ...base, pixelToWorld: [1, 0, -99.5, 0, -1, 99.5, 0, 0, 1] })).toBeCloseTo(0);
    expect(northAngle({ ...base, pixelToWorld: [0, -1, 99.5, -1, 0, 99.5, 0, 0, 1] })).toBeCloseTo(-Math.PI / 2);
  });
});

it('imports v1 projects with full overlay opacity and upgrades their schema', () => {
  const old = JSON.parse(JSON.stringify(emptyProject()));
  old.schemaVersion = 1;
  old.panes.forEach((pane: Record<string, unknown>) => delete pane.overlayOpacity);
  const current = validateProject(old);
  expect(current.schemaVersion).toBe(2);
  expect(current.panes.map((pane) => pane.overlayOpacity)).toEqual([1, 1]);
});
