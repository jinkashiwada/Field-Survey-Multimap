import type { FeatureCollection } from 'geojson';
import { toLonLat } from 'ol/proj.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { writeKml } from '../services/import-export/formats';
import { layerById } from '../config/layers';
import { drawingWorldPoints } from './geometry';
import { decodePhoto } from './media';
import { photoWarp, rasterGrid, warp, worldFile } from './warp';
import type { Assets, Project } from './model';
import schema from './project.schema.json';

export const WEB_MERCATOR_WKT =
  'PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Mercator_1SP"],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1],EXTENSION["PROJ4","+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs"],AUTHORITY["EPSG","3857"]]';
export function drawingsGeoJson(project: Project): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: project.drawings.flatMap((d) => {
      const points = drawingWorldPoints(d, project.photos);
      if (!points) return [];
      const coordinates = points.map((p) => toLonLat(p));
      return [
        {
          type: 'Feature' as const,
          id: d.id,
          properties: {
            name: d.name,
            memo: d.memo,
            classification: d.classification,
            observedAt: d.at,
            anchor: d.anchor,
            sourcePhotoId: d.photoId ?? null,
            evidence: d.evidence,
          },
          geometry:
            d.type === 'Polygon'
              ? { type: 'Polygon' as const, coordinates: [coordinates] }
              : { type: 'LineString' as const, coordinates },
        },
      ];
    }),
  };
}
interface Reply {
  requestId: number;
  done?: boolean;
  blob?: Blob;
  project?: Project;
  assets?: [string, Blob][];
  error?: string;
  progress?: number;
}
class ArchiveWorker {
  private worker = new Worker(new URL('./archive.worker.ts', import.meta.url), {
    type: 'module',
  });
  private serial = 0;
  private pending = new Map<
    number,
    {
      resolve: (r: Reply) => void;
      reject: (e: Error) => void;
      progress?: (p: number) => void;
    }
  >();
  constructor(private signal: AbortSignal) {
    this.worker.onmessage = (event: MessageEvent<Reply>) => {
      const r = event.data,
        p = this.pending.get(r.requestId);
      if (!p) return;
      if (r.progress !== undefined) {
        p.progress?.(r.progress);
        return;
      }
      this.pending.delete(r.requestId);
      if (r.error) p.reject(new Error(r.error));
      else p.resolve(r);
    };
    this.worker.onerror = () => this.stop(new Error('ZIP処理に失敗しました。'));
    signal.addEventListener('abort', this.abort, { once: true });
  }
  private abort = () =>
    this.stop(new DOMException('中止しました。', 'AbortError'));
  request(
    data: Record<string, unknown>,
    progress?: (p: number) => void,
  ): Promise<Reply> {
    if (this.signal.aborted)
      return Promise.reject(new DOMException('中止しました。', 'AbortError'));
    const requestId = ++this.serial;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, progress });
      this.worker.postMessage({ ...data, requestId });
    });
  }
  stop(error = new Error('終了しました。')) {
    this.worker.terminate();
    this.signal.removeEventListener('abort', this.abort);
    this.pending.forEach((p) => p.reject(error));
    this.pending.clear();
  }
}
export async function readArchive(
  file: Blob,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<{ project: Project; assets: Assets }> {
  const worker = new ArchiveWorker(signal);
  try {
    const r = await worker.request({ command: 'read', file }, (v) =>
      progress(`元画像を検証中 ${Math.round(v * 100)}%`),
    );
    return { project: r.project!, assets: new Map(r.assets!) };
  } finally {
    worker.stop();
  }
}
export async function saveArchive(
  project: Project,
  assets: Assets,
  signal: AbortSignal,
  progress: (message: string) => void,
  options: { rasters: boolean; screenshots?: { name: string; blob: Blob }[] },
): Promise<Blob> {
  const worker = new ArchiveWorker(signal);
  let total = 0;
  const add = (path: string, blob: Blob) => {
    total += blob.size;
    if (total > 2 * 1024 ** 3 - 1024 ** 2)
      throw new Error(
        'ZIPが2 GBを超えます。出力解像度を下げるか、変換画像の同梱を外して保存してください。',
      );
    if (path === 'project.json' && blob.size > 30 * 1024 ** 2)
      throw new Error(
        '編集情報が大きすぎます。持込みGISを減らし、案件を分けて保存してください。',
      );
    return worker.request({ command: 'add', path, blob });
  };
  const json = (value: unknown) =>
    new Blob([JSON.stringify(value)], { type: 'application/json' });
  try {
    await worker.request({ command: 'begin' });
    await add('schema.json', json(schema));
    await add(
      'project.json',
      json({
        format: 'flood-photo-map',
        coordinateConvention: {
          image:
            'EXIF-oriented original pixels; first pixel centre (0,0); x right, y down',
          gcpMap: 'EPSG:4326 longitude,latitude',
          homography:
            'row-major 3x3, homogeneous column vectors; image -> EPSG:3857',
        },
        project,
      }),
    );
    await add('drawings.geojson', json(drawingsGeoJson(project)));
    await add(
      'transforms.json',
      json(
        project.photos.map((p) => ({
          id: p.id,
          name: p.name,
          width: p.width,
          height: p.height,
          registration: p.registration ?? null,
          crop: p.crop,
          masks: p.masks,
        })),
      ),
    );
    const layerIds = new Set([
      ...project.panes.flatMap((p) => [p.baseLayerId, ...p.overlayLayerIds]),
      ...(project.inverse.baseLayerId ? [project.inverse.baseLayerId] : []),
      ...project.inverse.overlayIds,
    ]);
    await add(
      'sources.json',
      json(
        [...layerIds].map((id) => {
          const l = layerById.get(id)!;
          return {
            id,
            title: l.titleJa,
            attribution: l.attribution,
            url: l.sourcePageUrl,
            processing: '写真への逆投影・切抜きなどの加工あり',
          };
        }),
      ),
    );
    await add(
      'README.txt',
      new Blob(
        [
          '浸水域判読支援ツールの作業データです。\nproject.jsonを含むZIP全体を同ツールで読み込んでください。\noriginals/は元ファイル（EXIF等を含む）です。IDと元ファイル名の対応はproject.jsonにあります。\nrectified/のPNGはEPSG:3857の北上格子です。同名PGWとPRJを一緒に使用してください。\n地図タイルは同梱していません。再取得時に背景が更新される可能性があります。\nホモグラフィーは平面近似です。地形・建物高・レンズ歪みによるずれが残ります。\n',
        ],
        { type: 'text/plain' },
      ),
    );
    for (const [i, p] of project.photos.entries()) {
      if (signal.aborted)
        throw new DOMException('中止しました。', 'AbortError');
      progress(`元画像を保存中 ${i + 1}/${project.photos.length}`);
      const original = assets.get(p.id);
      if (!original) throw new Error('元画像が見つかりません。');
      await add(`originals/${p.id}`, original);
      if (options.rasters && p.registration) {
        const grid = rasterGrid(
          p,
          project.export.longEdge,
          project.export.bounds,
        );
        const bitmap = await decodePhoto(original);
        const blob = await warp(photoWarp(p, grid, bitmap), signal, (v) =>
          progress(
            `変換画像 ${i + 1}/${project.photos.length} · ${Math.round(v * 100)}%`,
          ),
        );
        await add(`rectified/${p.id}.png`, blob);
        await add(`rectified/${p.id}.pgw`, new Blob([worldFile(grid)]));
        await add(`rectified/${p.id}.prj`, new Blob([WEB_MERCATOR_WKT]));
        // GDAL/QGIS read PAM metadata for PNG; retain PGW/PRJ for other GIS software.
        await add(
          `rectified/${p.id}.png.aux.xml`,
          new Blob([
            `<PAMDataset><SRS dataAxisToSRSAxisMapping="1,2">${WEB_MERCATOR_WKT}</SRS><GeoTransform>${[grid.bounds[0], grid.resolution, 0, grid.bounds[3], 0, -grid.resolution].join(', ')}</GeoTransform></PAMDataset>`,
          ]),
        );
        await add(`rectified/${p.id}.json`, json(grid));
      }
    }
    for (const gis of project.gis)
      await add(`gis/${gis.id}.geojson`, json(gis.data));
    for (const shot of options.screenshots ?? [])
      await add(`screenshots/${shot.name}.png`, shot.blob);
    progress('ZIPを仕上げています');
    const r = await worker.request({ command: 'close' });
    return r.blob!;
  } finally {
    worker.stop();
  }
}
/** Stream generated comparison images into a ZIP without collecting them in memory. */
export async function saveImageArchive(
  signal: AbortSignal,
  produce: (add: (path: string, blob: Blob) => Promise<void>) => Promise<void>,
): Promise<Blob> {
  const worker = new ArchiveWorker(signal);
  let total = 0;
  try {
    await worker.request({ command: 'begin' });
    await produce(async (path, blob) => {
      if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.includes('..'))
        throw new Error('画像ZIPのファイル名が不正です。');
      total += blob.size;
      if (total > 2 * 1024 ** 3 - 1024 ** 2)
        throw new Error('画像ZIPが2 GBを超えます。出力解像度を下げてください。');
      await worker.request({ command: 'add', path, blob });
    });
    return (await worker.request({ command: 'close' })).blob!;
  } finally {
    worker.stop();
  }
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function exportDrawings(project: Project, format: 'geojson' | 'kml') {
  const json = drawingsGeoJson(project);
  const output =
    format === 'geojson'
      ? JSON.stringify(json, null, 2)
      : writeKml(
          new GeoJSON().readFeatures(json, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
          }),
        );
  download(
    new Blob([output], {
      type:
        format === 'geojson'
          ? 'application/geo+json'
          : 'application/vnd.google-earth.kml+xml',
    }),
    `inundation.${format}`,
  );
}
