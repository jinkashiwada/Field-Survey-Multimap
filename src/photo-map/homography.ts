import { Matrix, SingularValueDecomposition } from 'ml-matrix';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { getDistance } from 'ol/sphere.js';
import type { Gcp, Matrix3, Photo, Point, Registration } from './model';

export function multiply(a: Matrix3, b: Matrix3): Matrix3 {
  const out = Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++)
        out[i * 3 + j]! += a[i * 3 + k]! * b[k * 3 + j]!;
  return out as Matrix3;
}
export function invert(m: Matrix3): Matrix3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const out = [
    e * i - f * h,
    c * h - b * i,
    b * f - c * e,
    f * g - d * i,
    a * i - c * g,
    c * d - a * f,
    d * h - e * g,
    b * g - a * h,
    a * e - b * d,
  ];
  const det = a * out[0]! + b * out[3]! + c * out[6]!;
  if (!Number.isFinite(det) || det === 0)
    throw new Error('逆変換を計算できません。対応点の配置を確認してください。');
  return out.map((v) => v / det) as Matrix3;
}
export function projectPoint(h: Matrix3, [x, y]: Point): Point | null {
  const w = h[6] * x + h[7] * y + h[8];
  const scale = Math.abs(h[6] * x) + Math.abs(h[7] * y) + Math.abs(h[8]);
  if (
    !Number.isFinite(w) ||
    Math.abs(w) <= Math.max(scale, Number.MIN_VALUE) * 1e-12
  )
    return null;
  const result: Point = [
    (h[0] * x + h[1] * y + h[2]) / w,
    (h[3] * x + h[4] * y + h[5]) / w,
  ];
  return result.every(Number.isFinite) ? result : null;
}
function normalize(points: Point[]): { points: Point[]; t: Matrix3 } {
  const mean = points.reduce(
    (a, p) =>
      [a[0] + p[0] / points.length, a[1] + p[1] / points.length] as Point,
    [0, 0] as Point,
  );
  const distance = points.reduce(
    (sum, p) =>
      sum + Math.hypot(p[0] - mean[0], p[1] - mean[1]) / points.length,
    0,
  );
  if (distance < 1e-10) throw new Error('対応点が重複しています。');
  const s = Math.SQRT2 / distance;
  const t: Matrix3 = [s, 0, -s * mean[0], 0, s, -s * mean[1], 0, 0, 1];
  const normalized = points.map((p) => projectPoint(t, p)!);
  for (let i = 0; i < normalized.length; i++)
    for (let j = i + 1; j < normalized.length; j++) {
      if (
        Math.hypot(
          normalized[i]![0] - normalized[j]![0],
          normalized[i]![1] - normalized[j]![1],
        ) < 1e-8
      )
        throw new Error('対応点が重複しています。');
    }
  return { points: normalized, t };
}
/**
 * Check in local, dimensionless coordinates on BOTH sides of the transform.
 * A raw H * inverse test subtracts large Mercator terms and can report an
 * absolute translation error even when the pixel round trip is accurate.
 * Use the applied controls, never the possibly un-applied draft controls.
 * This check does not refit or modify either saved matrix.
 */
export function areInverseHomographies(
  h: Matrix3,
  inverse: Matrix3,
  source: Point[],
  target: Point[],
): boolean {
  if (source.length < 4 || source.length !== target.length) return false;
  const a = normalize(source).t,
    b = normalize(target).t;
  const rescale = (matrix: Matrix3): Matrix3 => {
    const scale = Math.max(...matrix.map(Math.abs));
    return matrix.map((v) => v / scale) as Matrix3;
  };
  const forward = rescale(multiply(multiply(b, rescale(h)), invert(a))),
    backward = rescale(
      multiply(multiply(a, rescale(inverse)), invert(b)),
    );
  return [multiply(forward, backward), multiply(backward, forward)].every(
    (product) => {
      const scale = product[8];
      return (
        Number.isFinite(scale) &&
        scale !== 0 &&
        product.every(
          (v, i) =>
            Number.isFinite(v) &&
            // One millionth of the local GCP scale, not Mercator metres.
            Math.abs(v / scale - (i % 4 === 0 ? 1 : 0)) < 1e-6,
        )
      );
    },
  );
}
/** Normalized DLT. Pad 8x9 to 9x9 to retain the right nullspace for exactly four pairs. */
export function estimateHomography(source: Point[], target: Point[]): Matrix3 {
  if (source.length < 4 || source.length !== target.length)
    throw new Error('有効な対応点が4組以上必要です。');
  if (![...source, ...target].every((p) => p.every(Number.isFinite)))
    throw new Error('座標に不正な値があります。');
  const a = normalize(source),
    b = normalize(target);
  const rows: number[][] = [];
  a.points.forEach(([x, y], index) => {
    const [u, v] = b.points[index]!;
    rows.push(
      [-x, -y, -1, 0, 0, 0, u * x, u * y, u],
      [0, 0, 0, -x, -y, -1, v * x, v * y, v],
    );
  });
  if (rows.length === 8) rows.push(Array<number>(9).fill(0));
  const svd = new SingularValueDecomposition(new Matrix(rows));
  if (svd.diagonal[7]! < svd.diagonal[0]! * 1e-9)
    throw new Error(
      '対応点が一直線上にあるか、配置が不安定です。広く分散して配置してください。',
    );
  const hn = svd.rightSingularVectors.getColumn(8) as Matrix3;
  const h = multiply(multiply(invert(b.t), hn), a.t);
  const scale = Math.abs(h[8]) > 1e-12 ? h[8] : Math.hypot(...h);
  const result = h.map((v) => v / scale) as Matrix3;
  invert(result);
  return result;
}
export function fitRegistration(gcps: Gcp[]): Registration {
  const fit = gcps.filter((g) => g.role === 'fit' && g.image && g.map);
  const h = estimateHomography(
    fit.map((g) => g.image!),
    fit.map((g) => fromLonLat(g.map!) as Point),
  );
  const inverse = invert(h);
  const residuals = gcps
    .filter((g) => g.role !== 'off' && g.image && g.map)
    .map((g) => {
      const map = projectPoint(h, g.image!);
      const image = projectPoint(inverse, fromLonLat(g.map!) as Point);
      if (!map || !image) throw new Error('対応点が射影の発散領域にあります。');
      return {
        id: g.id,
        role: g.role as 'fit' | 'check',
        pixels: Math.hypot(image[0] - g.image![0], image[1] - g.image![1]),
        metres: getDistance(toLonLat(map), g.map!),
      };
    });
  const used = residuals.filter((r) => r.role === 'fit');
  return {
    h,
    inverse,
    gcps: structuredClone(gcps),
    residuals,
    rmsPixels: Math.sqrt(
      used.reduce((s, r) => s + r.pixels ** 2, 0) / used.length,
    ),
    rmsMetres: Math.sqrt(
      used.reduce((s, r) => s + r.metres ** 2, 0) / used.length,
    ),
    fittedAt: new Date().toISOString(),
  };
}
export function footprint(photo: Photo): Point[] | null {
  if (!photo.registration) return null;
  const [x0, y0, x1, y1] = photo.crop;
  const corners: Point[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const h = photo.registration.h;
  const denominators = corners.map(([x, y]) => h[6] * x + h[7] * y + h[8]);
  if (Math.min(...denominators) <= 0 && Math.max(...denominators) >= 0)
    return null;
  const points = corners.map((p) => projectPoint(h, p));
  if (
    points.some(
      (p) => !p || Math.abs(p[0]) > 20037508.35 || Math.abs(p[1]) > 20037508.35,
    )
  )
    return null;
  return points as Point[];
}
export function bounds(points: Point[]): [number, number, number, number] {
  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ];
}
