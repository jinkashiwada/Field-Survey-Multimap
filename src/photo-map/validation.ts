import { layerById } from '../config/layers';
import { fromLonLat } from 'ol/proj.js';
import { areInverseHomographies, invert } from './homography';
import { geometryProblem } from './geometry';
import { MAX_IMAGE_PIXELS } from './media';
import type { Project, Point, Matrix3 } from './model';

function assert(
  value: unknown,
  message = 'プロジェクト形式が不正です。',
): asserts value {
  if (!value) throw new Error(message);
}
const finite = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x);
const text = (x: unknown, max = 4000): x is string =>
  typeof x === 'string' && x.length <= max;
const point = (x: unknown): x is Point =>
  Array.isArray(x) && x.length === 2 && x.every(finite);
const lonlat = (x: unknown) =>
  point(x) && Math.abs(x[0]) <= 180 && Math.abs(x[1]) <= 85.051129;
function checkMatrix(m: unknown): asserts m is Matrix3 {
  assert(Array.isArray(m) && m.length === 9 && m.every(finite));
  invert(m as Matrix3);
}
/** Validate all state before swapping the open project. No imported URLs are executed. */
export function validateProject(input: unknown): Project {
  assert(input && typeof input === 'object');
  const incoming = input as Omit<Project, 'schemaVersion'> & { schemaVersion: number };
  assert(
    incoming.schemaVersion === 1 || incoming.schemaVersion === 2,
    'このZIPのプロジェクト形式には対応していません。',
  );
  assert(Array.isArray(incoming.panes) && incoming.panes.length === 2);
  const p: Project = incoming.schemaVersion === 1
    ? { ...incoming, schemaVersion: 2, panes: incoming.panes.map((pane) => ({ ...pane, overlayOpacity: 1 })) as Project['panes'] }
    : incoming as Project;
  assert(text(p.name, 200) && text(p.appVersion, 100));
  assert(
    Array.isArray(p.photos) &&
      p.photos.length <= 100 &&
      Array.isArray(p.drawings) &&
      p.drawings.length <= 50000 &&
      Array.isArray(p.gis) &&
      p.gis.length <= 100,
  );
  assert(
    ['single', 'register', 'compare', 'maps'].includes(p.layout) &&
      finite(p.split) &&
      p.split >= 25 &&
      p.split <= 75,
  );
  assert(
    p.view &&
      lonlat(p.view.center) &&
      finite(p.view.zoom) &&
      p.view.zoom >= 2 &&
      p.view.zoom <= 22 &&
      finite(p.view.rotation),
  );
  assert(
    p.export &&
      Number.isInteger(p.export.longEdge) &&
      p.export.longEdge >= 64 &&
      p.export.longEdge <= 8192,
  );
  if (p.export.bounds !== null)
    assert(
      Array.isArray(p.export.bounds) &&
        p.export.bounds.length === 4 &&
        p.export.bounds.every(finite) &&
        p.export.bounds[0] < p.export.bounds[2] &&
        p.export.bounds[1] < p.export.bounds[3],
    );
  const ids = new Set<string>();
  const checkId = (id: string) => {
    assert(
      typeof id === 'string' &&
        /^[a-zA-Z0-9_-]{1,80}$/.test(id) &&
        !ids.has(id),
      '識別子が不正または重複しています。',
    );
    ids.add(id);
  };
  for (const photo of p.photos) {
    checkId(photo.id);
    assert(
      text(photo.name, 200) &&
        text(photo.filename, 250) &&
        ['image/jpeg', 'image/png', 'image/webp'].includes(photo.mime),
    );
    assert(
      Number.isInteger(photo.width) &&
        Number.isInteger(photo.height) &&
        photo.width > 0 &&
        photo.height > 0 &&
        photo.width * photo.height <= MAX_IMAGE_PIXELS,
    );
    assert(
      text(photo.capturedAt, 100) && text(photo.source) && text(photo.memo),
    );
    assert(
      Array.isArray(photo.crop) &&
        photo.crop.length === 4 &&
        photo.crop.every(finite) &&
        photo.crop[0] >= -0.5 &&
        photo.crop[1] >= -0.5 &&
        photo.crop[2] <= photo.width - 0.5 &&
        photo.crop[3] <= photo.height - 0.5 &&
        photo.crop[2] > photo.crop[0] &&
        photo.crop[3] > photo.crop[1],
    );
    assert(Array.isArray(photo.masks) && photo.masks.length <= 1000);
    for (const mask of photo.masks)
      assert(
        Array.isArray(mask) &&
          mask.length <= 10000 &&
          mask.every(point) &&
          !geometryProblem('Polygon', mask),
      );
    assert(
      Array.isArray(photo.visible) &&
        photo.visible.length === 2 &&
        photo.visible.every((v) => typeof v === 'boolean'),
    );
    assert(
      Array.isArray(photo.opacity) &&
        photo.opacity.length === 2 &&
        photo.opacity.every((v) => finite(v) && v >= 0 && v <= 1),
    );
    const checkGcps = (gcps: typeof photo.gcps) => {
      assert(Array.isArray(gcps) && gcps.length <= 1000);
      const names = new Set();
      for (const g of gcps) {
        assert(
          text(g.id, 80) &&
            !names.has(g.id) &&
            ['fit', 'check', 'off'].includes(g.role),
        );
        names.add(g.id);
        assert(
          g.image === undefined ||
            (point(g.image) &&
              g.image[0] >= -0.5 &&
              g.image[1] >= -0.5 &&
              g.image[0] <= photo.width - 0.5 &&
              g.image[1] <= photo.height - 0.5),
        );
        assert(g.map === undefined || lonlat(g.map));
      }
    };
    checkGcps(photo.gcps);
    if (photo.registration) {
      const r = photo.registration;
      checkMatrix(r.h);
      checkMatrix(r.inverse);
      checkGcps(r.gcps);
      const controls = r.gcps.filter(
        (g) => g.role === 'fit' && g.image && g.map,
      );
      assert(controls.length >= 4);
      assert(
        areInverseHomographies(
          r.h,
          r.inverse,
          controls.map((g) => g.image!),
          controls.map((g) => fromLonLat(g.map!) as Point),
        ),
        `「${photo.name}」の行列と逆行列が一致しません。この写真の対応点を確認して再計算してください。`,
      );
      assert(
        finite(r.rmsMetres) &&
          r.rmsMetres >= 0 &&
          finite(r.rmsPixels) &&
          r.rmsPixels >= 0 &&
          text(r.fittedAt, 100),
      );
      assert(
        Array.isArray(r.residuals) &&
          r.residuals.length <= 1000 &&
          r.residuals.every(
            (v) =>
              text(v.id, 80) &&
              ['fit', 'check'].includes(v.role) &&
              finite(v.metres) &&
              v.metres >= 0 &&
              finite(v.pixels) &&
              v.pixels >= 0,
          ),
      );
    }
  }
  const photoIds = new Set(p.photos.map((v) => v.id));
  assert(p.activePhotoId === null || photoIds.has(p.activePhotoId));
  for (const d of p.drawings) {
    checkId(d.id);
    assert(
      ['LineString', 'Polygon'].includes(d.type) &&
        ['map', 'photo'].includes(d.anchor) &&
        Array.isArray(d.points) &&
        d.points.length <= 100000 &&
        d.points.every(point),
    );
    assert(!geometryProblem(d.type, d.points), '無効な作図が含まれています。');
    assert(
      d.anchor === 'map' ? d.points.every(lonlat) : photoIds.has(d.photoId!),
    );
    assert(
      text(d.name, 200) &&
        text(d.memo) &&
        text(d.at, 100) &&
        typeof d.visible === 'boolean' &&
        ['interpreted', 'estimated'].includes(d.classification),
    );
    assert(
      Array.isArray(d.evidence) && d.evidence.every((id) => photoIds.has(id)),
    );
  }
  const geometryTypes = new Set([
    'Point',
    'MultiPoint',
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon',
    'GeometryCollection',
  ]);
  let gisPoints = 0;
  const coordinates = (value: unknown, depth = 0): boolean => {
    if (depth > 6 || !Array.isArray(value)) return false;
    if (typeof value[0] === 'number') {
      gisPoints++;
      return (
        value.length >= 2 &&
        value.length <= 3 &&
        lonlat(value.slice(0, 2)) &&
        value.every(finite)
      );
    }
    return (
      value.length <= 100000 && value.every((v) => coordinates(v, depth + 1))
    );
  };
  const geometry = (value: unknown, depth = 0): boolean => {
    if (!value || typeof value !== 'object' || depth > 6) return false;
    const g = value as {
      type: string;
      coordinates?: unknown;
      geometries?: unknown[];
    };
    return (
      geometryTypes.has(g.type) &&
      (g.type === 'GeometryCollection'
        ? Array.isArray(g.geometries) &&
          g.geometries.every((v) => geometry(v, depth + 1))
        : coordinates(g.coordinates))
    );
  };
  for (const g of p.gis) {
    checkId(g.id);
    assert(
      text(g.name, 200) &&
        typeof g.visible === 'boolean' &&
        g.data?.type === 'FeatureCollection' &&
        Array.isArray(g.data.features) &&
        g.data.features.length <= 50000,
    );
    for (const f of g.data.features)
      assert(f.type === 'Feature' && geometry(f.geometry));
  }
  assert(gisPoints <= 1_000_000, 'GISデータの頂点が多すぎます。');
  const allowed = (id: string, role?: string) =>
    layerById.has(id) && (!role || layerById.get(id)!.layerRole === role);
  assert(Array.isArray(p.panes) && p.panes.length === 2);
  for (const pane of p.panes) {
    assert(
      allowed(pane.baseLayerId, 'base') &&
        Array.isArray(pane.overlayLayerIds) &&
        pane.overlayLayerIds.length <= 30 &&
        pane.overlayLayerIds.every((v) => allowed(v, 'overlay')),
    );
    assert(
      pane.opacityByLayerId &&
        typeof pane.opacityByLayerId === 'object' &&
        Object.values(pane.opacityByLayerId).every(
          (v) => finite(v) && v >= 0 && v <= 1,
        ) &&
        finite(pane.overlayOpacity) && pane.overlayOpacity >= 0 && pane.overlayOpacity <= 1,
    );
    assert(
      pane.elevationColorRange &&
        finite(pane.elevationColorRange.minimum) &&
        finite(pane.elevationColorRange.maximum) &&
        pane.elevationColorRange.minimum < pane.elevationColorRange.maximum &&
        typeof pane.autoElevationRange === 'boolean',
    );
  }
  assert(
    p.inverse &&
      (p.inverse.baseLayerId === null ||
        allowed(p.inverse.baseLayerId, 'base')) &&
      Array.isArray(p.inverse.overlayIds) &&
      p.inverse.overlayIds.length <= 30 &&
      p.inverse.overlayIds.every((v) => allowed(v, 'overlay')) &&
      finite(p.inverse.opacity) &&
      p.inverse.opacity >= 0 &&
      p.inverse.opacity <= 1 &&
      typeof p.inverse.gis === 'boolean' &&
      typeof p.inverse.drawings === 'boolean',
  );
  // JSON round trip drops prototypes. Strings are only rendered through React text nodes.
  return JSON.parse(JSON.stringify(p)) as Project;
}
