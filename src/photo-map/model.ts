import type { FeatureCollection } from 'geojson';
import type { PaneLayerState } from '../domain/layers';

export type Point = [number, number];
/** Row-major, homogeneous column vectors; pixels -> EPSG:3857. */
export type Matrix3 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export type Mode =
  'move' | 'gcp' | 'crop' | 'mask' | 'line' | 'polygon' | 'edit';
export type Layout = 'single' | 'register' | 'compare' | 'maps';
export interface Gcp {
  id: string;
  image?: Point;
  map?: Point;
  role: 'fit' | 'check' | 'off';
}
export interface Residual {
  id: string;
  pixels: number;
  metres: number;
  role: 'fit' | 'check';
}
export interface Registration {
  h: Matrix3;
  inverse: Matrix3;
  gcps: Gcp[];
  residuals: Residual[];
  rmsPixels: number;
  rmsMetres: number;
  fittedAt: string;
}
export interface Photo {
  id: string;
  name: string;
  filename: string;
  mime: string;
  width: number;
  height: number;
  capturedAt: string;
  source: string;
  memo: string;
  gcps: Gcp[];
  registration?: Registration;
  crop: [number, number, number, number];
  masks: Point[][];
  visible: [boolean, boolean];
  opacity: [number, number];
}
export interface Drawing {
  id: string;
  name: string;
  type: 'LineString' | 'Polygon';
  points: Point[];
  anchor: 'map' | 'photo';
  photoId?: string;
  evidence: string[];
  classification: 'interpreted' | 'estimated';
  at: string;
  memo: string;
  visible: boolean;
}
export interface GisDataset {
  id: string;
  name: string;
  data: FeatureCollection;
  visible: boolean;
}
export interface Project {
  schemaVersion: 2;
  appVersion: string;
  name: string;
  photos: Photo[];
  drawings: Drawing[];
  gis: GisDataset[];
  activePhotoId: string | null;
  layout: Layout;
  split: number;
  view: { center: Point; zoom: number; rotation: number };
  panes: [PaneLayerState, PaneLayerState];
  inverse: {
    baseLayerId: string | null;
    overlayIds: string[];
    opacity: number;
    gis: boolean;
    drawings: boolean;
  };
  export: { longEdge: number; bounds: [number, number, number, number] | null };
}
export type Assets = Map<string, Blob>;
export function id(): string {
  return crypto.randomUUID();
}
export function emptyProject(): Project {
  const pane = (
    baseLayerId: string,
    overlayLayerIds: string[],
  ): PaneLayerState => ({
    baseLayerId,
    overlayLayerIds,
    opacityByLayerId: {},
    overlayOpacity: 1,
    elevationColorRange: { minimum: 0, maximum: 20 },
    autoElevationRange: false,
  });
  return {
    schemaVersion: 2,
    appVersion: '1.1.0',
    name: '新しい判読プロジェクト',
    photos: [],
    drawings: [],
    gis: [],
    activePhotoId: null,
    layout: 'register',
    split: 50,
    view: { center: [139.908, 35.918], zoom: 14, rotation: 0 },
    panes: [
      pane('gsi-seamlessphoto', []),
      pane('gsi-pale', ['hazard-flood-l2']),
    ],
    inverse: {
      baseLayerId: null,
      overlayIds: ['gsi-vector-major-road', 'gsi-vector-river'],
      opacity: 0.7,
      gis: true,
      drawings: true,
    },
    export: { longEdge: 4096, bounds: null },
  };
}
export function hasDraft(photo: Photo): boolean {
  return (
    !!photo.registration &&
    JSON.stringify(photo.gcps) !== JSON.stringify(photo.registration.gcps)
  );
}
