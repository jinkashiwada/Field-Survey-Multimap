import type { LayerDefinition } from '../domain/layers';

const GSI_LIST = 'https://maps.gsi.go.jp/development/ichiran.html';
const HAZARD_OPEN_DATA = 'https://disaportal.gsi.go.jp/hazardmapportal/hazardmap/copyright/opendata.html';
const GSI_VECTOR = 'https://maps.gsi.go.jp/development/vt_expt.html';
const GSI_DEM = 'https://maps.gsi.go.jp/development/demtile.html';
const GSI_ATTRIBUTION = '国土地理院';
const GSI_PHOTO_ATTRIBUTION = '国土地理院（低ズーム画像：Landsat 8／USGS、世界衛星モザイク／NASA・USGS、海底地形／GEBCO）';
const HAZARD_ATTRIBUTION = 'ハザードマップポータルサイト（国土地理院）';

export const layerRegistry: readonly LayerDefinition[] = [
  {
    id: 'gsi-std', titleJa: '地理院標準地図', titleEn: 'GSI Standard Map', category: 'base-map', layerRole: 'base',
    sourceType: 'xyz', url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', minZoom: 2, maxZoom: 18,
    defaultOpacity: 1, attribution: GSI_ATTRIBUTION, legendUrl: GSI_LIST, sourcePageUrl: GSI_LIST,
    description: '道路、建物、地名等を表示する地理院の標準的な背景地図です。', stability: 'stable',
  },
  {
    id: 'gsi-pale', titleJa: '地理院淡色地図', titleEn: 'GSI Pale Map', category: 'base-map', layerRole: 'base',
    sourceType: 'xyz', url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', minZoom: 2, maxZoom: 18,
    defaultOpacity: 1, attribution: GSI_ATTRIBUTION, legendUrl: GSI_LIST, sourcePageUrl: GSI_LIST,
    description: '重畳情報を読み取りやすい淡い配色の背景地図です。', stability: 'stable',
  },
  {
    id: 'gsi-blank', titleJa: '地理院白地図', titleEn: 'GSI Blank Map', category: 'base-map', layerRole: 'base',
    sourceType: 'xyz', url: 'https://cyberjapandata.gsi.go.jp/xyz/blank/{z}/{x}/{y}.png', minZoom: 5, maxZoom: 14,
    defaultOpacity: 1, attribution: GSI_ATTRIBUTION, legendUrl: GSI_LIST, sourcePageUrl: GSI_LIST,
    description: '行政界等を簡潔に示す白地図です。', stability: 'stable',
  },
  {
    id: 'gsi-seamlessphoto', titleJa: '全国最新写真', titleEn: 'Seamless Aerial Photo', category: 'imagery', layerRole: 'base',
    sourceType: 'xyz', url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', minZoom: 2, maxZoom: 18,
    defaultOpacity: 1, attribution: GSI_PHOTO_ATTRIBUTION, legendUrl: GSI_LIST, sourcePageUrl: GSI_LIST,
    description: 'ZL14以上では全国最新写真、ZL9～13では全国ランドサットモザイク、ZL2～8では世界衛星モザイクを表示します。撮影時期は地域により異なります。', stability: 'stable',
  },
  {
    id: 'gsi-relief', titleJa: '色別標高図', titleEn: 'Digital Elevation Colored Map', category: 'terrain', layerRole: 'base',
    sourceType: 'xyz', url: 'https://cyberjapandata.gsi.go.jp/xyz/relief/{z}/{x}/{y}.png', minZoom: 5, maxZoom: 15,
    defaultOpacity: 1, attribution: GSI_ATTRIBUTION, legendUrl: GSI_LIST, sourcePageUrl: GSI_LIST,
    description: '標高を段彩で表現した地図です。', stability: 'stable',
  },
  {
    id: 'gsi-relief-custom', titleJa: '解析用色別標高図', titleEn: 'Adjustable DEM Color Map', category: 'terrain', layerRole: 'base',
    sourceType: 'dem-rgb', url: 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png', minZoom: 2, maxZoom: 18,
    defaultOpacity: 1, attribution: GSI_ATTRIBUTION, legendUrl: GSI_DEM, sourcePageUrl: GSI_DEM,
    description: 'DEM10Bの標高値を受信タイル単位で再配色します。指定レンジ外は端色で表示し、端末上で標高値そのものは変更しません。', stability: 'experimental',
  },
  {
    id: 'gsi-hillshade', titleJa: '陰影起伏図', titleEn: 'Hillshade Map', category: 'terrain', layerRole: 'base',
    sourceType: 'xyz', url: 'https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png', minZoom: 2, maxZoom: 16,
    defaultOpacity: 1, attribution: GSI_ATTRIBUTION, legendUrl: GSI_LIST, sourcePageUrl: GSI_LIST,
    description: '地形の起伏を陰影で表現した地図です。', stability: 'stable',
  },
  {
    id: 'gsi-lcmfc2', titleJa: '治水地形分類図', titleEn: 'Landform Classification Map for Flood Control', category: 'landform', layerRole: 'overlay',
    sourceType: 'xyz', url: 'https://cyberjapandata.gsi.go.jp/xyz/lcmfc2/{z}/{x}/{y}.png', minZoom: 11, maxZoom: 16,
    defaultOpacity: 0.72, attribution: GSI_ATTRIBUTION, legendUrl: GSI_LIST, sourcePageUrl: GSI_LIST,
    description: '治水対策を目的に、扇状地、自然堤防、旧河道等の地形分類を示します。', stability: 'stable',
  },
  {
    id: 'hazard-flood-l2', titleJa: '洪水浸水想定区域・想定最大規模', titleEn: 'Flood Inundation Assumption (Maximum)', category: 'flood-hazard', layerRole: 'overlay',
    sourceType: 'xyz', url: 'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png', minZoom: 2, maxZoom: 17,
    defaultOpacity: 0.65, attribution: HAZARD_ATTRIBUTION, legendUrl: HAZARD_OPEN_DATA, sourcePageUrl: HAZARD_OPEN_DATA,
    description: '想定し得る最大規模の降雨による洪水浸水深の想定区域です。未整備・更新差があります。', stability: 'stable',
  },
  {
    id: 'hazard-flood-l1', titleJa: '洪水浸水想定区域・計画規模', titleEn: 'Flood Inundation Assumption (Planned)', category: 'flood-hazard', layerRole: 'overlay',
    sourceType: 'xyz', url: 'https://disaportaldata.gsi.go.jp/raster/01_flood_l1_shinsuishin_newlegend_data/{z}/{x}/{y}.png', minZoom: 2, maxZoom: 17,
    defaultOpacity: 0.65, attribution: HAZARD_ATTRIBUTION, legendUrl: HAZARD_OPEN_DATA, sourcePageUrl: HAZARD_OPEN_DATA,
    description: '河川整備の計画規模に対応する洪水浸水深の想定区域です。', stability: 'stable',
  },
  {
    id: 'hazard-flood-duration', titleJa: '浸水継続時間', titleEn: 'Flood Duration', category: 'flood-hazard', layerRole: 'overlay',
    sourceType: 'xyz', url: 'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_keizoku_data/{z}/{x}/{y}.png', minZoom: 2, maxZoom: 17,
    defaultOpacity: 0.65, attribution: HAZARD_ATTRIBUTION, legendUrl: HAZARD_OPEN_DATA, sourcePageUrl: HAZARD_OPEN_DATA,
    description: '想定最大規模の洪水時に一定の浸水深を上回る時間の目安です。', stability: 'stable',
  },
  {
    id: 'hazard-house-flow', titleJa: '家屋倒壊等氾濫想定区域・氾濫流', titleEn: 'House Collapse Risk (Flood Flow)', category: 'flood-hazard', layerRole: 'overlay',
    sourceType: 'xyz', url: 'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_kaokutoukai_hanran_data/{z}/{x}/{y}.png', minZoom: 4, maxZoom: 17,
    defaultOpacity: 0.65, attribution: HAZARD_ATTRIBUTION, legendUrl: HAZARD_OPEN_DATA, sourcePageUrl: HAZARD_OPEN_DATA,
    description: '氾濫流により木造家屋が倒壊・流失するおそれがある区域の目安です。', stability: 'stable',
  },
  {
    id: 'hazard-bank-erosion', titleJa: '家屋倒壊等氾濫想定区域・河岸侵食', titleEn: 'House Collapse Risk (Bank Erosion)', category: 'flood-hazard', layerRole: 'overlay',
    sourceType: 'xyz', url: 'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_kaokutoukai_kagan_data/{z}/{x}/{y}.png', minZoom: 4, maxZoom: 17,
    defaultOpacity: 0.65, attribution: HAZARD_ATTRIBUTION, legendUrl: HAZARD_OPEN_DATA, sourcePageUrl: HAZARD_OPEN_DATA,
    description: '河岸侵食により家屋が倒壊・流失するおそれがある区域の目安です。', stability: 'stable',
  },
  {
    id: 'hazard-inland-water', titleJa: '内水浸水想定区域', titleEn: 'Inland Water Inundation Assumption', category: 'flood-hazard', layerRole: 'overlay',
    sourceType: 'xyz', url: 'https://disaportaldata.gsi.go.jp/raster/02_naisui_data/{z}/{x}/{y}.png', minZoom: 2, maxZoom: 17,
    defaultOpacity: 0.65, attribution: HAZARD_ATTRIBUTION, legendUrl: HAZARD_OPEN_DATA, sourcePageUrl: HAZARD_OPEN_DATA,
    description: '下水道等から水を排除できない場合の内水浸水想定区域です。', stability: 'stable',
  },
  {
    id: 'gsi-vector-major-road', titleJa: '主要道路（試験公開）', titleEn: 'Major Roads (Experimental)', category: 'infrastructure', layerRole: 'overlay',
    sourceType: 'gsi-vector-tile', vectorKind: 'major-road', url: 'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf', minZoom: 4, maxZoom: 16,
    defaultOpacity: 0.88, attribution: '国土地理院・地理院地図Vector（試験公開）', legendUrl: GSI_VECTOR, sourcePageUrl: GSI_VECTOR,
    description: '高速道路と国道を強調表示します。試験公開データであり、更新・仕様変更や未収録の可能性があります。', stability: 'experimental',
  },
  {
    id: 'gsi-vector-railway', titleJa: '鉄道（試験公開）', titleEn: 'Railways (Experimental)', category: 'infrastructure', layerRole: 'overlay',
    sourceType: 'gsi-vector-tile', vectorKind: 'railway', url: 'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf', minZoom: 4, maxZoom: 16,
    defaultOpacity: 0.9, attribution: '国土地理院・地理院地図Vector（試験公開）', legendUrl: GSI_VECTOR, sourcePageUrl: GSI_VECTOR,
    description: '鉄道中心線を表示します。試験公開データであり、更新・仕様変更や未収録の可能性があります。', stability: 'experimental',
  },
  {
    id: 'gsi-vector-river', titleJa: '河川中心線（試験公開）', titleEn: 'River Centerlines (Experimental)', category: 'hydrography', layerRole: 'overlay',
    sourceType: 'gsi-vector-tile', vectorKind: 'river', url: 'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf', minZoom: 7, maxZoom: 16,
    defaultOpacity: 0.9, attribution: '国土地理院・地理院地図Vector（試験公開）', legendUrl: GSI_VECTOR, sourcePageUrl: GSI_VECTOR,
    description: '河川中心線と河川名注記を表示します。全国規模の過密表示を避け、ZL7は河川幅（大・中）、ZL8以上は詳細河川へ段階的に切り替えます。管理者区分ではありません。', stability: 'experimental',
  },
  {
    id: 'gsi-vector-contour', titleJa: '等高線（試験公開・省電力）', titleEn: 'Contours (Experimental)', category: 'terrain', layerRole: 'overlay',
    sourceType: 'gsi-vector-tile', vectorKind: 'contour', url: 'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf', minZoom: 8, maxZoom: 16,
    defaultOpacity: 0.78, attribution: '国土地理院・地理院地図Vector（試験公開）', legendUrl: GSI_VECTOR, sourcePageUrl: GSI_VECTOR,
    description: '端末でDEM等高線を計算せず、地理院の試験公開ベクトル等高線を表示します。間隔は地図仕様に従い、任意指定はできません。', stability: 'experimental',
  },
] as const;

export const baseLayerDefinitions = layerRegistry.filter((definition) => definition.layerRole === 'base');
export const overlayLayerDefinitions = layerRegistry.filter((definition) => definition.layerRole === 'overlay');
export const layerById = new Map(layerRegistry.map((definition) => [definition.id, definition]));

export function validateLayerRegistry(registry: readonly LayerDefinition[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const layer of registry) {
    if (ids.has(layer.id)) errors.push(`duplicate id: ${layer.id}`);
    ids.add(layer.id);
    for (const field of ['id', 'titleJa', 'titleEn', 'url', 'attribution', 'legendUrl', 'sourcePageUrl', 'description'] as const) {
      if (!layer[field]) errors.push(`${layer.id || '(unknown)'}: missing ${field}`);
    }
    if (layer.minZoom < 0 || layer.maxZoom < layer.minZoom) errors.push(`${layer.id}: invalid zoom range`);
    if (layer.defaultOpacity < 0 || layer.defaultOpacity > 1) errors.push(`${layer.id}: invalid opacity`);
    if (layer.sourceType === 'gsi-vector-tile' && !layer.vectorKind) errors.push(`${layer.id}: missing vectorKind`);
  }
  return errors;
}
