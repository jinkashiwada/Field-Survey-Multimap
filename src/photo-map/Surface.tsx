import { useEffect, useRef, useState } from 'react';
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import Projection from 'ol/proj/Projection.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import Feature from 'ol/Feature.js';
import PointGeometry from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import LineString from 'ol/geom/LineString.js';
import type Geometry from 'ol/geom/Geometry.js';
import VectorSource from 'ol/source/Vector.js';
import VectorLayer from 'ol/layer/Vector.js';
import LayerGroup from 'ol/layer/Group.js';
import ImageLayer from 'ol/layer/Image.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import Draw, { createBox } from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import { altKeyOnly, singleClick } from 'ol/events/condition.js';
import { Circle, Fill, Stroke, Style, Text } from 'ol/style.js';
import { defaults as controls } from 'ol/control/defaults.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { createMapLayer } from '../services/mapLayers';
import { layerById } from '../config/layers';
import { gisStyle } from '../services/vectorStyles';
import { createPhotoLayer } from './render';
import { inverseOverlay } from './inverse';
import { footprint, projectPoint } from './homography';
import { drawingDisplayPoints } from './geometry';
import { photoAtCoordinate } from './photoDisplay';
import type { ImagePool } from './media';
import type { Mode, Photo, Point, Project } from './model';

export type SurfaceAction =
  | { type: 'gcp'; point: Point; id?: string }
  | {
      type: 'shape';
      tool: 'crop' | 'mask' | 'line' | 'polygon';
      points: Point[];
    }
  | { type: 'modify'; id: string; points: Point[] }
  | { type: 'select'; id: string };
interface Props {
  kind: 'photo' | 'map';
  pane: 0 | 1;
  project: Project;
  photo?: Photo;
  displayPhotos: Photo[];
  highlightedPhotoId: string | null;
  view: View;
  pool: ImagePool;
  mode: Mode;
  selectedGcp: string | null;
  selectedDrawing: string | null;
  visibleDrawings: Set<string>;
  onAction: (action: SurfaceAction) => void;
  onSelectPhoto: (id: string) => void;
  onSoloPhoto: (id: string) => void;
  onError: (message: string) => void;
  onViewChange: (view: Project['view']) => void;
  onReady: (map: OlMap | null) => void;
}
interface Runtime {
  map: OlMap;
  basemaps: LayerGroup;
  drawings: VectorSource<Feature<Geometry>>;
  gcps: VectorSource<Feature<Geometry>>;
  gis: VectorSource<Feature<Geometry>>;
  highlight: VectorSource<Feature<Geometry>>;
  roi: VectorSource<Feature<Geometry>>;
  image: ImageLayer<ImageStatic>;
  inverse: ImageLayer<ImageStatic>;
  photoLayer: ReturnType<typeof createPhotoLayer>;
  imagePhotoId?: string;
  imageLevel?: number;
}
const nativePoint = (coordinate: number[], photo: boolean): Point => [
  coordinate[0]!,
  photo ? -coordinate[1]! : coordinate[1]!,
];
const displayPoint = (point: Point, photo: boolean): Point => [
  point[0],
  photo ? -point[1] : point[1],
];
const extentOf = (p: Photo) => [-0.5, -p.height + 0.5, p.width - 0.5, 0.5];
export function Surface(props: Props) {
  const [hover, setHover] = useState<{ photoId: string; x: number; y: number } | null>(null);
  const [contextPhoto, setContextPhoto] = useState<{ photoId: string; x: number; y: number } | null>(null);
  const host = useRef<HTMLDivElement>(null),
    runtime = useRef<Runtime | null>(null),
    latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const { kind, pane, view, pool } = props;
  useEffect(() => {
    const target = host.current;
    if (!target) return;
    const isPhoto = kind === 'photo';
    const photoView = new View({
      projection: new Projection({ code: 'photo-pixels', units: 'pixels' }),
      center: [0, 0],
      resolution: 1,
      minResolution: 0.05,
      maxResolution: 1000,
      enableRotation: false,
    });
    const drawings = new VectorSource<Feature<Geometry>>(),
      gcps = new VectorSource<Feature<Geometry>>(),
      gis = new VectorSource<Feature<Geometry>>(),
      highlight = new VectorSource<Feature<Geometry>>(),
      roi = new VectorSource<Feature<Geometry>>();
    const basemaps = new LayerGroup({ zIndex: 0 });
    const image = new ImageLayer<ImageStatic>({ zIndex: 0 }),
      inverse = new ImageLayer<ImageStatic>({ zIndex: 15 });
    const photoLayer = createPhotoLayer(pool, pane, (m) =>
      latest.current.onError(m),
    );
    const drawingLayer = new VectorLayer({
      source: drawings,
      zIndex: 40,
      style: (feature) => {
        const selected = feature.getId() === latest.current.selectedDrawing;
        return new Style({
          stroke: new Stroke({
            color: selected ? '#ffe37d' : '#ee4b8e',
            width: selected ? 4 : 2.5,
            lineDash:
              feature.get('classification') === 'estimated'
                ? [8, 5]
                : undefined,
          }),
          fill: new Fill({
            color: selected ? 'rgba(255,227,125,.2)' : 'rgba(238,75,142,.18)',
          }),
          image: new Circle({
            radius: 5,
            fill: new Fill({ color: '#ee4b8e' }),
          }),
        });
      },
    });
    const highlightLayer = new VectorLayer({
      source: highlight,
      zIndex: 35,
      style: [
        new Style({
          fill: new Fill({ color: 'rgba(255, 227, 106, 0.14)' }),
          stroke: new Stroke({ color: '#17333e', width: 7 }),
        }),
        new Style({ stroke: new Stroke({ color: '#ffe36a', width: 3, lineDash: [9, 5] }) }),
      ],
    });
    const gcpLayer = new VectorLayer({
      source: gcps,
      zIndex: 60,
      style: (feature) =>
        new Style({
          image: new Circle({
            radius: feature.getId() === latest.current.selectedGcp ? 8 : 6,
            fill: new Fill({
              color:
                feature.get('role') === 'off'
                  ? '#778594'
                  : feature.get('role') === 'check'
                    ? '#bb7fff'
                    : '#00cdb4',
            }),
            stroke: new Stroke({ color: '#fff', width: 2 }),
          }),
          text: new Text({
            text: String(feature.get('number')),
            offsetY: -17,
            font: 'bold 13px sans-serif',
            fill: new Fill({ color: '#10332f' }),
            stroke: new Stroke({ color: '#fff', width: 3 }),
          }),
        }),
    });
    const map = new OlMap({
      target,
      pixelRatio: 1,
      view: isPhoto ? photoView : view,
      layers: [
        ...(isPhoto ? [image, inverse] : [basemaps, photoLayer.layer]),
        new VectorLayer({ source: gis, zIndex: 25, style: gisStyle }),
        ...(!isPhoto ? [highlightLayer] : []),
        drawingLayer,
        new VectorLayer({
          source: roi,
          zIndex: 50,
          style: new Style({
            fill: new Fill({ color: 'rgba(10,21,31,.58)' }),
            stroke: new Stroke({
              color: '#ffc873',
              width: 1,
              lineDash: [5, 4],
            }),
          }),
        }),
        gcpLayer,
      ],
      controls: controls({
        rotate: false,
        attribution: !isPhoto,
        attributionOptions: { collapsible: true },
      }),
    });
    const rt: Runtime = {
      map,
      basemaps,
      drawings,
      gcps,
      gis,
      highlight,
      roi,
      image,
      inverse,
      photoLayer,
    };
    runtime.current = rt;
    const resize = new ResizeObserver(() => map.updateSize());
    resize.observe(target);
    map.on('singleclick', (event) => {
      const p = latest.current;
      if (p.mode === 'gcp') {
        const coordinate = nativePoint(event.coordinate, isPhoto);
        if (
          isPhoto &&
          p.photo &&
          (coordinate[0] < -0.5 ||
            coordinate[1] < -0.5 ||
            coordinate[0] > p.photo.width - 0.5 ||
            coordinate[1] > p.photo.height - 0.5)
        )
          return;
        const hit = map.forEachFeatureAtPixel(event.pixel, (f) => f, {
          layerFilter: (l) => l === gcpLayer,
          hitTolerance: 8,
        });
        p.onAction({
          type: 'gcp',
          point: coordinate,
          ...(hit ? { id: String(hit.getId()) } : {}),
        });
      } else if (p.mode === 'move' || p.mode === 'edit') {
        const hit = map.forEachFeatureAtPixel(event.pixel, (f) => f, {
          layerFilter: (l) => l === drawingLayer,
          hitTolerance: 6,
        });
        if (hit) p.onAction({ type: 'select', id: String(hit.getId()) });
        else if (!isPhoto && p.mode === 'move') {
          const photo = photoAtCoordinate(p.displayPhotos, pane, event.coordinate as Point);
          if (photo) {
            p.onSelectPhoto(photo.id);
            setHover(null);
            setContextPhoto(null);
          }
        }
      }
    });
    const viewport = map.getViewport();
    const leave = () => setHover(null);
    const contextMenu = (event: MouseEvent) => {
      const p = latest.current;
      if (isPhoto || p.mode !== 'move' ||
          (event.target instanceof Element && event.target.closest('.ol-control'))) return;
      const pixel = map.getEventPixel(event);
      const photo = photoAtCoordinate(
        p.displayPhotos,
        pane,
        map.getCoordinateFromPixel(pixel) as Point,
      );
      if (!photo) return;
      event.preventDefault();
      setHover(null);
      setContextPhoto({
        photoId: photo.id,
        x: Math.min(pixel[0] ?? 0, Math.max(0, viewport.clientWidth - 230)),
        y: Math.min((pixel[1] ?? 0) + target.offsetTop, Math.max(0, target.offsetTop + target.clientHeight - 110)),
      });
    };
    viewport.addEventListener('mouseleave', leave);
    viewport.addEventListener('contextmenu', contextMenu);
    const closeContext = () => setContextPhoto(null);
    viewport.addEventListener('pointerdown', closeContext);
    if (!isPhoto) map.on('pointermove', (event) => {
      const p = latest.current;
      if (event.dragging || p.mode !== 'move') {
        setHover(null);
        viewport.style.cursor = '';
        return;
      }
      const photo = photoAtCoordinate(p.displayPhotos, pane, event.coordinate as Point);
      viewport.style.cursor = photo ? 'pointer' : '';
      setHover(photo ? {
        photoId: photo.id,
        x: Math.min((event.pixel[0] ?? 0) + 12, Math.max(0, viewport.clientWidth - 220)),
        y: Math.min((event.pixel[1] ?? 0) + target.offsetTop + 12, Math.max(0, target.offsetTop + target.clientHeight - 75)),
      } : null);
    });
    map.on('moveend', () => {
      if (!isPhoto) {
        const v = map.getView();
        latest.current.onViewChange({
          center: toLonLat(v.getCenter()!) as Point,
          zoom: v.getZoom()!,
          rotation: v.getRotation(),
        });
      } else {
        const photo = latest.current.photo;
        if (!photo) return;
        // Load original detail only when zooming beyond the overview's pixel density.
        const edge =
          map.getView().getResolution()! <
          Math.max(photo.width, photo.height) / 2048
            ? Math.max(photo.width, photo.height)
            : 2048;
        if (rt.imagePhotoId === photo.id && rt.imageLevel !== edge) {
          rt.imageLevel = edge;
          void pool
            .previewUrl(photo, edge)
            .then((url) => {
              if (
                runtime.current === rt &&
                latest.current.photo?.id === photo.id &&
                rt.imageLevel === edge
              )
                image.setSource(
                  new ImageStatic({
                    url,
                    imageExtent: extentOf(photo),
                    projection: photoView.getProjection(),
                  }),
                );
            })
            .catch(() =>
              latest.current.onError('写真の詳細表示に失敗しました。'),
            );
        }
      }
    });
    latest.current.onReady(map);
    return () => {
      viewport.removeEventListener('mouseleave', leave);
      viewport.removeEventListener('contextmenu', contextMenu);
      viewport.removeEventListener('pointerdown', closeContext);
      latest.current.onReady(null);
      resize.disconnect();
      photoLayer.dispose();
      map.setTarget(undefined);
      map.dispose();
      runtime.current = null;
    };
  }, [kind, pane, view, pool]);

  const photoId = props.photo?.id;
  useEffect(() => {
    const rt = runtime.current,
      p = latest.current.photo;
    if (!rt || kind !== 'photo') return;
    let cancelled = false;
    rt.image.setSource(null);
    rt.inverse.setSource(null);
    rt.imagePhotoId = p?.id;
    rt.imageLevel = 2048;
    if (p) {
      rt.map.getView().fit(extentOf(p), {
        size: rt.map.getSize(),
        padding: [25, 25, 25, 25],
      });
      rt.map.renderSync();
      void pool
        .previewUrl(p)
        .then((url) => {
          if (!cancelled)
            rt.image.setSource(
              new ImageStatic({
                url,
                imageExtent: extentOf(p),
                projection: rt.map.getView().getProjection(),
              }),
            );
        })
        .catch(() => latest.current.onError('写真を表示できませんでした。'));
    }
    return () => {
      cancelled = true;
    };
  }, [photoId, kind, pool]);

  const paneConfig = props.project.panes[pane];
  useEffect(() => {
    const rt = runtime.current;
    if (!rt || kind === 'photo') return;
    const definitions = [
      paneConfig.baseLayerId,
      ...paneConfig.overlayLayerIds,
    ].map((id) => layerById.get(id)!);
    rt.basemaps.getLayers().clear();
    for (const definition of definitions) {
      const layer = createMapLayer(
        definition,
        paneConfig.opacityByLayerId[definition.id] ?? definition.defaultOpacity,
        paneConfig.elevationColorRange,
      );
      layer.setZIndex(definition.layerRole === 'base' ? 0 : 20);
      rt.basemaps.getLayers().push(layer);
    }
  }, [paneConfig, kind]);
  useEffect(() => {
    const rt = runtime.current;
    if (!rt || kind === 'photo') return;
    rt.photoLayer.update(props.displayPhotos);
    rt.highlight.clear();
    const selected = props.displayPhotos.find((p) => p.id === props.highlightedPhotoId);
    const points = selected && selected.opacity[pane] > 0 && footprint(selected);
    if (points) rt.highlight.addFeature(new Feature(new Polygon([[...points, points[0]!]])));
  }, [props.displayPhotos, props.highlightedPhotoId, kind, pane]);

  const inverseKey = JSON.stringify([
    props.photo?.id,
    props.photo?.registration?.h,
    props.photo?.crop,
    props.project.inverse.baseLayerId,
    props.project.inverse.overlayIds,
  ]);
  useEffect(() => {
    const rt = runtime.current,
      { photo, project } = latest.current;
    if (!rt || kind !== 'photo') return;
    const controller = new AbortController();
    let url: string | undefined;
    rt.inverse.setSource(null);
    if (
      photo?.registration &&
      footprint(photo) &&
      (project.inverse.baseLayerId || project.inverse.overlayIds.length)
    ) {
      void inverseOverlay(photo, project, controller.signal, (m) =>
        latest.current.onError(m),
      )
        .then((blob) => {
          if (controller.signal.aborted) return;
          url = URL.createObjectURL(blob);
          rt.inverse.setSource(
            new ImageStatic({
              url,
              imageExtent: extentOf(photo),
              projection: rt.map.getView().getProjection(),
            }),
          );
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            latest.current.onError(
              error instanceof Error ? error.message : '逆投影に失敗しました。',
            );
        });
    }
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [inverseKey, kind]);
  useEffect(() => {
    runtime.current?.inverse.setOpacity(props.project.inverse.opacity);
  }, [props.project.inverse.opacity]);

  useEffect(() => {
    const rt = runtime.current;
    if (!rt) return;
    const isPhoto = kind === 'photo',
      photo = isPhoto ? props.photo : undefined;
    rt.drawings.clear();
    rt.gcps.clear();
    rt.roi.clear();
    rt.gis.clear();
    for (const d of props.project.drawings) {
      if (
        !d.visible ||
        !props.visibleDrawings.has(d.id) ||
        (isPhoto && !props.project.inverse.drawings)
      )
        continue;
      const points = drawingDisplayPoints(d, props.project, photo);
      if (!points || (isPhoto && !photo)) continue;
      const coordinates = points.map((p) => displayPoint(p, isPhoto));
      const f = new Feature({
        geometry:
          d.type === 'Polygon'
            ? new Polygon([coordinates])
            : new LineString(coordinates),
        classification: d.classification,
      });
      f.setId(d.id);
      rt.drawings.addFeature(f);
    }
    if (props.photo) {
      props.photo.gcps.forEach((g, i) => {
        const coordinate = isPhoto
          ? g.image
          : g.map
            ? (fromLonLat(g.map) as Point)
            : undefined;
        if (!coordinate) return;
        const f = new Feature({
          geometry: new PointGeometry(displayPoint(coordinate, isPhoto)),
          number: i + 1,
          role: g.role,
        });
        f.setId(g.id);
        rt.gcps.addFeature(f);
      });
      if (isPhoto) {
        const p = props.photo,
          [x0, y0, x1, y1] = p.crop;
        const full: Point[] = [
          [-0.5, 0.5],
          [p.width - 0.5, 0.5],
          [p.width - 0.5, -p.height + 0.5],
          [-0.5, -p.height + 0.5],
          [-0.5, 0.5],
        ];
        rt.roi.addFeature(
          new Feature(
            new Polygon([
              full,
              [
                [x0, -y0],
                [x0, -y1],
                [x1, -y1],
                [x1, -y0],
                [x0, -y0],
              ],
            ]),
          ),
        );
        p.masks.forEach((r) =>
          rt.roi.addFeature(
            new Feature(new Polygon([r.map((v) => displayPoint(v, true))])),
          ),
        );
      }
    }
    if (!isPhoto || props.project.inverse.gis) {
      for (const dataset of props.project.gis.filter((g) => g.visible)) {
        const features = new GeoJSON().readFeatures(dataset.data, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        });
        for (const feature of features) {
          if (isPhoto) {
            if (!photo?.registration) continue;
            let valid = true;
            const h = photo.registration.inverse;
            let negative = false,
              positive = false;
            feature
              .getGeometry()
              ?.applyTransform(
                (input, output = input, dimension = 2, stride = dimension) => {
                  for (let i = 0; i < input.length; i += stride) {
                    const x = input[i]!,
                      y = input[i + 1]!,
                      w = h[6] * x + h[7] * y + h[8];
                    negative ||= w < 0;
                    positive ||= w > 0;
                    const p = projectPoint(h, [x, y]);
                    if (!p) {
                      valid = false;
                      continue;
                    }
                    output[i] = p[0];
                    output[i + 1] = -p[1];
                  }
                  return output;
                },
              );
            if (!valid || (negative && positive)) continue;
          }
          rt.gis.addFeature(feature);
        }
      }
    }
  }, [
    props.project,
    props.photo,
    props.visibleDrawings,
    props.selectedGcp,
    props.selectedDrawing,
    kind,
  ]);

  useEffect(() => {
    const rt = runtime.current;
    if (!rt) return;
    const isPhoto = kind === 'photo',
      mode = props.mode,
      interactions: (Draw | Modify)[] = [];
    if (
      ['line', 'polygon', 'mask', 'crop'].includes(mode) &&
      (!['mask', 'crop'].includes(mode) || isPhoto)
    ) {
      const draw = new Draw({
        type:
          mode === 'crop'
            ? 'Circle'
            : mode === 'line'
              ? 'LineString'
              : 'Polygon',
        ...(mode === 'crop' ? { geometryFunction: createBox() } : {}),
        stopClick: true,
      });
      draw.on('drawend', (event) => {
        const geometry = event.feature.getGeometry()!;
        const points =
          geometry instanceof Polygon
            ? geometry.getCoordinates()[0]!
            : (geometry as LineString).getCoordinates();
        latest.current.onAction({
          type: 'shape',
          tool: mode as 'crop' | 'mask' | 'line' | 'polygon',
          points: points.map((p) => nativePoint(p, isPhoto)),
        });
      });
      interactions.push(draw);
    }
    if (mode === 'gcp') {
      const modify = new Modify({
        source: rt.gcps,
        pixelTolerance: 10,
        deleteCondition: () => false,
      });
      modify.on('modifyend', (event) => {
        for (const f of event.features.getArray()) {
          const point = nativePoint(
            (f.getGeometry() as PointGeometry).getCoordinates(),
            isPhoto,
          );
          latest.current.onAction({
            type: 'gcp',
            id: String(f.getId()),
            point,
          });
        }
      });
      interactions.push(modify);
    }
    if (mode === 'edit') {
      const modify = new Modify({
        source: rt.drawings,
        deleteCondition: (event) => altKeyOnly(event) && singleClick(event),
      });
      modify.on('modifyend', (event) => {
        for (const f of event.features.getArray()) {
          const geometry = f.getGeometry()!,
            points =
              geometry instanceof Polygon
                ? geometry.getCoordinates()[0]!
                : (geometry as LineString).getCoordinates();
          latest.current.onAction({
            type: 'modify',
            id: String(f.getId()),
            points: points.map((p) => nativePoint(p, isPhoto)),
          });
        }
      });
      interactions.push(modify);
    }
    interactions.forEach((i) => rt.map.addInteraction(i));
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        interactions.forEach((i) => {
          if (i instanceof Draw) i.abortDrawing();
        });
    };
    window.addEventListener('keydown', escape);
    return () => {
      interactions.forEach((i) => rt.map.removeInteraction(i));
      window.removeEventListener('keydown', escape);
    };
  }, [props.mode, kind, photoId]);
  const hoveredPhoto = props.displayPhotos.find((photo) => photo.id === hover?.photoId);
  const menuPhoto = props.displayPhotos.find((photo) => photo.id === contextPhoto?.photoId);
  return (<>
    <div
      ref={host}
      className="pm-map"
      data-testid={kind === 'photo' ? 'photo-canvas' : `map-${pane}`}
      aria-label={
        kind === 'photo' ? '写真の編集領域' : `地図${pane === 0 ? 'A' : 'B'}`
      }
    />
    {kind === 'map' && hoveredPhoto && !contextPhoto && props.mode === 'move' && (
      <div className="pm-ortho-hover" role="tooltip" style={{ left: hover!.x, top: hover!.y }}>
        <strong>{hoveredPhoto.name}</strong>
        <small>クリックで写真を表示 · 右クリックで単独表示</small>
      </div>
    )}
    {kind === 'map' && menuPhoto && props.mode === 'move' && (
      <div className="pm-ortho-context" role="menu" aria-label={`${menuPhoto.name}の操作`} style={{ left: contextPhoto!.x, top: contextPhoto!.y }}>
        <strong>{menuPhoto.name}</strong>
        <button role="menuitem" onClick={() => {
          props.onSelectPhoto(menuPhoto.id);
          setContextPhoto(null);
        }}>この写真を表示</button>
        <button role="menuitem" onClick={() => {
          props.onSoloPhoto(menuPhoto.id);
          props.onSelectPhoto(menuPhoto.id);
          setContextPhoto(null);
        }}>この写真以外を非表示</button>
      </div>
    )}
  </>);
}
