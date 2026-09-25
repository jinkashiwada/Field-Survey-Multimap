export type LayerRole = 'base' | 'overlay';
export type LayerCategory =
  | 'base-map'
  | 'imagery'
  | 'terrain'
  | 'landform'
  | 'flood-hazard'
  | 'infrastructure'
  | 'hydrography';

export type LayerSourceType = 'xyz' | 'gsi-vector-tile' | 'gsi-river-centerline' | 'dem-rgb';
export type VectorLayerKind = 'major-road' | 'railway' | 'river' | 'contour';

export interface ElevationColorRange {
  minimum: number;
  maximum: number;
}

export interface LayerDefinition {
  id: string;
  titleJa: string;
  titleEn: string;
  category: LayerCategory;
  layerRole: LayerRole;
  sourceType: LayerSourceType;
  vectorKind?: VectorLayerKind;
  url: string;
  minZoom: number;
  maxZoom: number;
  defaultOpacity: number;
  attribution: string;
  legendUrl: string;
  sourcePageUrl: string;
  description: string;
  stability: 'stable' | 'experimental';
}

export interface PaneLayerState {
  baseLayerId: string;
  overlayLayerIds: string[];
  opacityByLayerId: Record<string, number>;
  /** Effective opacity for every overlay; the base map keeps its own opacity. */
  overlayOpacity?: number;
  elevationColorRange: ElevationColorRange;
  autoElevationRange: boolean;
}
