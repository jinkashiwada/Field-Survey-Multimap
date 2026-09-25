import { fromLonLat, toLonLat } from 'ol/proj.js';
import { projectPoint } from './homography';
import type { Drawing, Photo, Point, Project } from './model';

export function photoToWorld(photo: Photo, point: Point): Point | null {
  return photo.registration ? projectPoint(photo.registration.h, point) : null;
}
export function worldToPhoto(photo: Photo, point: Point): Point | null {
  return photo.registration
    ? projectPoint(photo.registration.inverse, point)
    : null;
}
export function drawingWorldPoints(
  drawing: Drawing,
  photos: Photo[],
): Point[] | null {
  if (drawing.anchor === 'map')
    return drawing.points.map((p) => fromLonLat(p) as Point);
  const photo = photos.find((p) => p.id === drawing.photoId);
  if (!photo?.registration) return null;
  const h = photo.registration.h;
  const denominators = drawing.points.map(
    ([x, y]) => h[6] * x + h[7] * y + h[8],
  );
  if (Math.min(...denominators) <= 0 && Math.max(...denominators) >= 0)
    return null;
  const values = drawing.points.map((p) => photoToWorld(photo, p));
  return values.some(
    (p) => !p || Math.abs(p[0]) > 20037508.35 || Math.abs(p[1]) > 20037508.35,
  )
    ? null
    : (values as Point[]);
}
export function drawingDisplayPoints(
  d: Drawing,
  project: Project,
  photo?: Photo,
): Point[] | null {
  if (photo && d.anchor === 'photo' && d.photoId === photo.id) return d.points;
  const points = drawingWorldPoints(d, project.photos);
  if (!photo || !points) return points;
  const converted = points.map((p) => worldToPhoto(photo, p));
  if (converted.some((p) => !p)) return null;
  // Do not connect across the projective horizon.
  const h = photo.registration!.inverse;
  const w = points.map(([x, y]) => h[6] * x + h[7] * y + h[8]);
  if (Math.min(...w) <= 0 && Math.max(...w) >= 0) return null;
  return converted as Point[];
}
export function editDrawingPoints(
  d: Drawing,
  points: Point[],
  project: Project,
  displayPhoto?: Photo,
): Point[] | null {
  if (displayPhoto && d.anchor === 'photo' && d.photoId === displayPhoto.id)
    return points;
  const world = displayPhoto
    ? points.map((p) => photoToWorld(displayPhoto, p))
    : points;
  if (world.some((p) => !p)) return null;
  if (d.anchor === 'map')
    return (world as Point[]).map((p) => toLonLat(p) as Point);
  const origin = project.photos.find((p) => p.id === d.photoId);
  if (!origin) return null;
  const source = (world as Point[]).map((p) => worldToPhoto(origin, p));
  return source.some((p) => !p) ? null : (source as Point[]);
}
export function pointInRing([x, y]: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!,
      b = ring[j]!;
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function geometryProblem(
  type: Drawing['type'],
  points: Point[],
): string | null {
  if (points.some((p) => !p.every(Number.isFinite)))
    return '変換できない頂点が含まれています。';
  if (points.length < (type === 'Polygon' ? 4 : 2))
    return '頂点が不足しています。';
  for (let i = 0; i < points.length - 1; i++)
    if (
      Math.hypot(
        points[i]![0] - points[i + 1]![0],
        points[i]![1] - points[i + 1]![1],
      ) < 1e-12
    )
      return `頂点${i + 1}と${i + 2}が重複しています。`;
  if (type === 'LineString') return null;
  const last = points[points.length - 1]!,
    first = points[0]!;
  if (last[0] !== first[0] || last[1] !== first[1])
    return 'ポリゴンが閉じていません。';
  const cross = (a: Point, b: Point, c: Point) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < points.length - 1; i++)
    for (let j = i + 2; j < points.length - 1; j++) {
      if (i === 0 && j === points.length - 2) continue;
      const a = points[i]!,
        b = points[i + 1]!,
        c = points[j]!,
        d = points[j + 1]!;
      const overlap =
        Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <=
          Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) &&
        Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <=
          Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]));
      if (
        overlap &&
        cross(a, b, c) * cross(a, b, d) <= 0 &&
        cross(c, d, a) * cross(c, d, b) <= 0
      )
        return `辺${i + 1}と辺${j + 1}が交差しています。`;
    }
  const area = points
    .slice(1)
    .reduce((s, b, i) => s + cross(first, points[i]!, b), 0);
  return Math.abs(area) < 1e-16 ? '面積がないポリゴンです。' : null;
}
