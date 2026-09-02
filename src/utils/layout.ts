import { QUAD_MIN_HEIGHT, QUAD_MIN_WIDTH, type MapLayout } from '../domain/layout';

export interface ViewportSize {
  width: number;
  height: number;
}

export function supportsQuad({ width, height }: ViewportSize): boolean {
  return width >= QUAD_MIN_WIDTH && height >= QUAD_MIN_HEIGHT;
}

export function splitForViewport({ width, height }: ViewportSize): MapLayout {
  return width >= height ? 'split-vertical' : 'split-horizontal';
}

export function normalizeLayout(layout: MapLayout, viewport: ViewportSize): MapLayout {
  if (layout === 'quad' && !supportsQuad(viewport)) return splitForViewport(viewport);
  if (layout === 'split-horizontal' || layout === 'split-vertical') return splitForViewport(viewport);
  return layout;
}

export function paneCountForLayout(layout: MapLayout): number {
  if (layout === 'single') return 1;
  if (layout === 'quad') return 4;
  return 2;
}

