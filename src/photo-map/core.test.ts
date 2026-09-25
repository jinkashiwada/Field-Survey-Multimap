import { describe, expect, it } from 'vitest';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import {
  bounds,
  estimateHomography,
  fitRegistration,
  footprint,
  invert,
  multiply,
  projectPoint,
} from './homography';
import {
  drawingDisplayPoints,
  drawingWorldPoints,
  editDrawingPoints,
  geometryProblem,
} from './geometry';
import {
  emptyProject,
  hasDraft,
  type Drawing,
  type Matrix3,
  type Photo,
  type Point,
} from './model';
import { gridToWorld, rasterGrid, worldFile } from './warp';
import { validateProject } from './validation';
import { historyReducer } from './history';
import { drawingsGeoJson } from './archive';

const source: Point[] = [
  [0, 0],
  [599, 0],
  [599, 399],
  [0, 399],
  [250, 180],
  [100, 290],
  [440, 80],
  [470, 310],
];
const origin = fromLonLat([139.9, 35.9]);
const h: Matrix3 = [
  0.7,
  0.12,
  origin[0]!,
  0.08,
  -0.8,
  origin[1]!,
  1e-8,
  -2e-8,
  1,
];
function photo(): Photo {
  const p: Photo = {
    id: 'photo-1',
    name: '判読写真',
    filename: 'source.png',
    mime: 'image/png',
    width: 600,
    height: 400,
    capturedAt: '',
    source: '',
    memo: '',
    gcps: source.map((image, i) => ({
      id: `gcp-${i}`,
      image,
      map: toLonLat(projectPoint(h, image)!) as Point,
      role: 'fit',
    })),
    crop: [-0.5, -0.5, 599.5, 399.5],
    masks: [],
    visible: [true, false],
    opacity: [0.65, 0.65],
  };
  p.registration = fitRegistration(p.gcps);
  return p;
}
describe('normalized homography', () => {
  it('retains the right nullspace for exactly four controls at Mercator magnitudes', () => {
    const points = source.slice(0, 4),
      fitted = estimateHomography(
        points,
        points.map((p) => projectPoint(h, p)!),
      );
    for (const p of source) {
      const actual = projectPoint(fitted, p)!,
        expected = projectPoint(h, p)!;
      expect(
        Math.hypot(actual[0] - expected[0], actual[1] - expected[1]),
      ).toBeLessThan(1e-6);
    }
  });
  it('fits all enabled controls and computes independent check residuals', () => {
    const p = photo();
    p.gcps[7]!.role = 'check';
    p.gcps[7]!.image![0] += 8;
    const registration = fitRegistration(p.gcps);
    expect(registration.rmsMetres).toBeLessThan(0.0001);
    expect(
      registration.residuals.find((r) => r.id === 'gcp-7')!.pixels,
    ).toBeGreaterThan(7.9);
    expect(hasDraft(p)).toBe(true);
    expect(p.registration!.gcps[7]!.image![0]).toBe(470);
  });
  it('rejects duplicates, collinear and incomplete control sets', () => {
    expect(() =>
      estimateHomography(source.slice(0, 3), source.slice(0, 3)),
    ).toThrow();
    expect(() =>
      estimateHomography(
        [
          [0, 0],
          [1, 1],
          [2, 2],
          [3, 3],
        ],
        [
          [0, 0],
          [1, 2],
          [2, 4],
          [3, 6],
        ],
      ),
    ).toThrow(/配置/);
    expect(() =>
      estimateHomography(
        [
          [0, 0],
          [1, 1],
          [0, 0],
          [1, 0],
        ],
        source.slice(0, 4),
      ),
    ).toThrow(/重複/);
  });
  it('round-trips forward and inverse coordinates', () => {
    const inverse = invert(h);
    for (const p of source) {
      const r = projectPoint(inverse, projectPoint(h, p)!)!;
      expect(r[0]).toBeCloseTo(p[0], 5);
      expect(r[1]).toBeCloseTo(p[1], 5);
    }
  });
  it('rejects a crop crossing the projective horizon but accepts a finite crop', () => {
    const p = photo();
    p.registration!.h = [1, 0, 0, 0, 1, 0, 0, 1, -200];
    expect(footprint(p)).toBeNull();
    p.crop = [10, 10, 100, 100];
    expect(footprint(p)).not.toBeNull();
  });
});
describe('anchored drawings', () => {
  const photoDrawing: Drawing = {
    id: 'drawing-1',
    name: '浸水境界',
    type: 'LineString',
    points: [
      [20, 20],
      [100, 120],
    ],
    anchor: 'photo',
    photoId: 'photo-1',
    classification: 'estimated',
    at: '',
    memo: '',
    visible: true,
    evidence: ['photo-1'],
  };
  it('reprojects photo traces and leaves map traces fixed when a registration changes', () => {
    const p = photo(),
      before = drawingWorldPoints(photoDrawing, [p])!;
    const mapDrawing: Drawing = {
      ...photoDrawing,
      id: 'drawing-2',
      anchor: 'map',
      points: before.map((v) => toLonLat(v) as Point),
    };
    p.registration!.h = multiply(
      [1, 0, 30, 0, 1, -20, 0, 0, 1],
      p.registration!.h,
    );
    p.registration!.inverse = invert(p.registration!.h);
    const after = drawingWorldPoints(photoDrawing, [p])!;
    expect(after[0]![0] - before[0]![0]).toBeCloseTo(30, 5);
    expect(drawingWorldPoints(mapDrawing, [p])![0]![0]).toBeCloseTo(
      before[0]![0],
      5,
    );
    const project = {
      ...emptyProject(),
      photos: [p],
      drawings: [photoDrawing, mapDrawing],
    };
    expect(drawingDisplayPoints(photoDrawing, project, p)).toEqual(
      photoDrawing.points,
    );
    const back = editDrawingPoints(photoDrawing, after, project)!;
    expect(back[0]![0]).toBeCloseTo(20, 5);
    expect(drawingsGeoJson(project).features).toHaveLength(2);
  });
  it('retains unregistered photo geometry but omits it from geographic export', () => {
    const p = photo();
    delete p.registration;
    const project = {
      ...emptyProject(),
      photos: [p],
      drawings: [photoDrawing],
    };
    expect(drawingDisplayPoints(photoDrawing, project, p)).toEqual(
      photoDrawing.points,
    );
    expect(drawingsGeoJson(project).features).toHaveLength(0);
  });
  it('identifies intersecting and zero-area polygons', () => {
    expect(
      geometryProblem('Polygon', [
        [0, 0],
        [10, 10],
        [0, 10],
        [10, 0],
        [0, 0],
      ]),
    ).toMatch(/交差/);
    expect(
      geometryProblem('Polygon', [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ]),
    ).toBeNull();
    expect(
      geometryProblem('Polygon', [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 0],
      ]),
    ).not.toBeNull();
  });
});
describe('portable project and raster grid', () => {
  it('accepts legacy oblique matrices despite Mercator cancellation, without refitting them', () => {
    const p = photo();
    // Synthetic oblique photograph; no user photographs or controls are used.
    const oblique = multiply(
      [1, 0, 15570000, 0, 1, 4280000, 0, 0, 1],
      [4.3, 1.1, 23, 0.2, -3.9, 50, 0.0002, 0.022, 1],
    );
    p.gcps = source.map((image, i) => ({
      id: `gcp-${i}`,
      image,
      map: toLonLat(projectPoint(oblique, image)!) as Point,
      role: 'fit',
    }));
    p.registration = {
      ...fitRegistration(p.gcps),
      h: oblique,
      inverse: invert(oblique),
    };
    const product = multiply(oblique, p.registration.inverse);
    expect(Math.abs(product[2] / product[8])).toBeGreaterThan(1e-5);
    // An incomplete draft must not affect the confirmed transform check.
    p.gcps = [{ id: 'draft', image: [10, 10], role: 'fit' }];
    const project = { ...emptyProject(), photos: [p], activePhotoId: p.id };
    expect(validateProject(JSON.parse(JSON.stringify(project)))).toEqual(project);

    // Homographies can be independently scaled without changing their mapping.
    const scaled = structuredClone(project);
    scaled.photos[0]!.registration!.h = oblique.map((v) => -3 * v) as Matrix3;
    scaled.photos[0]!.registration!.inverse = p.registration.inverse.map(
      (v) => 7 * v,
    ) as Matrix3;
    expect(() => validateProject(scaled)).not.toThrow();

    for (const incorrect of [
      multiply([1, 0, 0.1, 0, 1, 0, 0, 0, 1], p.registration.inverse),
      multiply(p.registration.inverse, [1, 0, 1, 0, 1, 0, 0, 0, 1]),
      invert(h),
    ]) {
      const corrupt = structuredClone(project);
      corrupt.photos[0]!.registration!.inverse = incorrect;
      expect(() => validateProject(corrupt)).toThrow(/行列と逆行列/);
    }
  });
  it('uses north-up cells and the centre of the upper-left pixel in world files', () => {
    const p = photo(),
      grid = rasterGrid(p, 4096),
      world = worldFile(grid).trim().split('\n').map(Number),
      matrix = gridToWorld(grid);
    expect(grid.width).toBeLessThanOrEqual(4096);
    expect(grid.height).toBeLessThanOrEqual(4096);
    expect(world[3]).toBe(-grid.resolution);
    expect(world[4]).toBe(grid.bounds[0] + grid.resolution / 2);
    expect(world[5]).toBe(grid.bounds[3] - grid.resolution / 2);
    expect(projectPoint(matrix, [0, 0])).toEqual([world[4], world[5]]);
    expect(bounds(footprint(p)!)[0]).toBeCloseTo(grid.bounds[0], 6);
  });
  it('validates a complete round-trip and rejects unsafe references and invalid matrices', () => {
    const project = emptyProject();
    project.photos = [photo()];
    project.activePhotoId = 'photo-1';
    expect(validateProject(JSON.parse(JSON.stringify(project)))).toEqual(
      project,
    );
    expect(() => validateProject({ ...project, schemaVersion: 99 })).toThrow(
      /対応/,
    );
    const bad = structuredClone(project);
    bad.photos[0]!.registration!.inverse[0] = 0;
    expect(() => validateProject(bad)).toThrow();
    expect(() =>
      validateProject({
        ...project,
        inverse: {
          ...project.inverse,
          overlayIds: ['https://untrusted.example/tile'],
        },
      }),
    ).toThrow();
    expect(() =>
      validateProject({
        ...project,
        photos: [...project.photos, ...project.photos],
      }),
    ).toThrow(/重複/);
  });
  it('undoes a registration and redoes it without modifying the prior state', () => {
    const p = photo(),
      original = { ...emptyProject(), photos: [p] };
    let history = { past: [], present: original, future: [] } as Parameters<
      typeof historyReducer
    >[0];
    history = historyReducer(history, {
      type: 'change',
      update: (p) => ({ ...p, name: '変更' }),
    });
    history = historyReducer(history, { type: 'undo' });
    expect(history.present).toBe(original);
    history = historyReducer(history, { type: 'redo' });
    expect(history.present.name).toBe('変更');
  });
});
