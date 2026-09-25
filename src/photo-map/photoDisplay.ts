import type { Photo, Point } from './model';
import { footprint, projectPoint } from './homography';

/** Display-only ordering and isolation. Saved visibility and layer order stay untouched. */
export function displayedPhotos(
  photos: Photo[],
  pane: 0 | 1,
  activeId: string | null,
  aligning: boolean,
  soloId: string | null,
): Photo[] {
  const onlyId = aligning ? activeId : soloId;
  const result = photos
    .filter((photo) => !onlyId || photo.id === onlyId)
    .map((photo) =>
      photo.id === onlyId && (aligning ? pane === 0 : !!soloId)
        ? { ...photo, visible: photo.visible.map((v, i) => i === pane ? true : v) as Photo['visible'] }
        : photo,
    )
    .filter((photo) => photo.visible[pane]);
  const activeIndex = result.findIndex((photo) => photo.id === activeId);
  if (activeIndex >= 0) result.push(result.splice(activeIndex, 1)[0]!);
  return result;
}

function insideRing(point: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside;
}

/** Return the front-most opaque projection under a map coordinate. */
export function photoAtCoordinate(photos: Photo[], pane: 0 | 1, world: Point): Photo | null {
  for (let i = photos.length - 1; i >= 0; i--) {
    const photo = photos[i]!;
    if (!photo.visible[pane] || photo.opacity[pane] <= 0 ||
        !photo.registration || !footprint(photo)) continue;
    const pixel = projectPoint(photo.registration.inverse, world);
    if (!pixel) continue;
    const [x0, y0, x1, y1] = photo.crop;
    if (pixel[0] < x0 || pixel[0] > x1 || pixel[1] < y0 || pixel[1] > y1 ||
        photo.masks.some((ring) => insideRing(pixel, ring))) continue;
    return photo;
  }
  return null;
}
