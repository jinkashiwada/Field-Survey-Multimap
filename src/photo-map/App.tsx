import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { parseGisFile } from '../services/import-export/files';
import { parseCoordinateQuery } from '../services/search';
import { layerById } from '../config/layers';
import { Surface, type SurfaceAction } from './Surface';
import { captureSurface } from './capture';
import {
  PhotoDetails,
  GcpPanel,
  LayerPanel,
  PhotoAttributions,
} from './Panels';
import { bounds, fitRegistration, footprint } from './homography';
import { editDrawingPoints, geometryProblem } from './geometry';
import { ImagePool, importPhoto } from './media';
import { download, readArchive, saveArchive } from './archive';
import { historyReducer } from './history';
import {
  emptyProject,
  id,
  type Drawing,
  type Gcp,
  type Mode,
  type Photo,
  type Point,
  type Project,
} from './model';
import { validateProject } from './validation';
import { PhotoBatchControls, PhotoList } from './PhotoList';
import { PanePopover } from './PanePopover';
import { DrawingPanel } from './DrawingPanel';
import { displayedPhotos } from './photoDisplay';

type PaneName = 'photo' | 'A' | 'B';
type Popup = { pane: PaneName; type: 'layers' | 'drawing' };
const paneLabel = (name: PaneName) =>
  name === 'photo' ? '写真' : `地図${name}`;

const signature = (project: Project) =>
  JSON.stringify({ ...project, view: null });
const modeLabels: Record<Mode, string> = {
  move: '移動',
  gcp: '対応点',
  crop: '矩形切抜き',
  mask: '部分除外',
  line: '境界線',
  polygon: '浸水範囲',
  edit: '頂点編集',
};

export function PhotoMapApp() {
  const [history, dispatch] = useReducer(historyReducer, undefined, () => ({
    past: [],
    present: emptyProject(),
    future: [],
  }));
  const project = history.present;
  const [savedSignature, setSavedSignature] = useState(() =>
    signature(project),
  );
  const [epoch, setEpoch] = useState(0);
  const [pool] = useState(() => new ImagePool());
  const [view] = useState(
    () =>
      new View({
        center: fromLonLat(project.view.center),
        zoom: project.view.zoom,
        minZoom: 2,
        maxZoom: 22,
      }),
  );
  const [mode, setMode] = useState<Mode>('move'),
    [tab, setTab] = useState<'photos' | 'gcps'>('photos');
  const [toolPane, setToolPane] = useState<PaneName | null>(null);
  const [soloMapPhotoIds, setSoloMapPhotoIds] = useState<[string | null, string | null]>([null, null]);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [selectedGcp, setSelectedGcp] = useState<string | null>(null),
    [selectedDrawing, setSelectedDrawing] = useState<string | null>(null);
  const [filterPhoto, setFilterPhoto] = useState(''),
    [filterDate, setFilterDate] = useState('');
  const [sidebar, setSidebar] = useState(true),
    [maximized, setMaximized] = useState<'photo' | 'A' | 'B' | null>(null);
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(''),
    [mapStatus, setMapStatus] = useState('');
  const [dialog, setDialog] = useState<
    'save' | 'help' | 'new' | 'delete' | null
  >(null);
  const [includeRasters, setIncludeRasters] = useState(true),
    [includeScreenshots, setIncludeScreenshots] = useState(false);
  const [exportEdge, setExportEdge] = useState(4096),
    [exportBounds, setExportBounds] = useState<
      [number, number, number, number] | null
    >(null);
  const [coordinate, setCoordinate] = useState('');
  const job = useRef<AbortController | null>(null),
    photoInput = useRef<HTMLInputElement>(null),
    zipInput = useRef<HTMLInputElement>(null),
    gisInput = useRef<HTMLInputElement>(null);
  const maps = useRef<Partial<Record<'photo' | 'A' | 'B', OlMap>>>({});
  const workArea = useRef<HTMLDivElement>(null);
  const active = project.photos.find((p) => p.id === project.activePhotoId);
  const mapPhotos = useMemo(
    () => ([0, 1] as const).map((pane) => displayedPhotos(
      project.photos,
      pane,
      project.activePhotoId,
      tab === 'gcps',
      soloMapPhotoIds[pane],
    )) as [Photo[], Photo[]],
    [project.photos, project.activePhotoId, tab, soloMapPhotoIds],
  );
  const dirty = signature(project) !== savedSignature;
  const change = useCallback(
    (update: (p: Project) => Project, record = true) =>
      dispatch({ type: 'change', update, record }),
    [],
  );
  const updatePhoto = useCallback(
    (photo: Photo) =>
      change((p) => ({
        ...p,
        photos: p.photos.map((v) => (v.id === photo.id ? photo : v)),
      })),
    [change],
  );
  const visibleDrawings = useMemo(
    () =>
      new Set(
        project.drawings
          .filter(
            (d) =>
              (!filterPhoto ||
                d.photoId === filterPhoto ||
                d.evidence.includes(filterPhoto)) &&
              (!filterDate || d.at.startsWith(filterDate)),
          )
          .map((d) => d.id),
      ),
    [project.drawings, filterPhoto, filterDate],
  );
  const report = useCallback((message: string) => setMessage(message), []);
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!busy) setDialog('save');
      }
      if (e.key === 'Escape' && !busy) {
        setMode('move');
        setPopup(null);
      }
      const input =
        e.target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
      if (
        !input &&
        !busy &&
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'z'
      ) {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [busy]);
  // No localStorage, URL state, analytics or project-data network requests.
  const run = async (task: (signal: AbortSignal) => Promise<void>) => {
    if (job.current) return;
    const controller = new AbortController();
    job.current = controller;
    setBusy('準備しています');
    setMessage('');
    try {
      await task(controller.signal);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setMessage(
          error instanceof Error ? error.message : '処理に失敗しました。',
        );
      else setMessage('処理を中止しました。');
    } finally {
      job.current = null;
      setBusy('');
    }
  };
  const addPhotos = (files: File[]) =>
    void run(async (signal) => {
      if (project.photos.length + files.length > 100)
        throw new Error(
          '1プロジェクト100枚までです。通常は30枚程度を目安にしてください。',
        );
      if (
        [...pool.assets.values(), ...files].reduce(
          (sum, f) => sum + f.size,
          0,
        ) >
        1024 ** 3
      )
        throw new Error('元画像の合計は1 GB以下にしてください。');
      const loaded: { photo: Photo; file: File }[] = [];
      for (const [i, file] of files.entries()) {
        setBusy(`写真を確認中 ${i + 1}/${files.length}`);
        const photo = await importPhoto(file);
        if (signal.aborted)
          throw new DOMException('中止しました。', 'AbortError');
        loaded.push({ photo, file });
      }
      loaded.forEach((v) => pool.assets.set(v.photo.id, v.file));
      change((p) => ({
        ...p,
        photos: [...p.photos, ...loaded.map((v) => v.photo)],
        activePhotoId: loaded[0]?.photo.id ?? p.activePhotoId,
      }));
      setMode('move');
      setTab('photos');
      setPopup(null);
      setSidebar(true);
      setSelectedGcp(null);
    });
  const openArchive = (file: File) =>
    void run(async (signal) => {
      if (
        dirty &&
        !window.confirm(
          '未保存の作業があります。現在の作業を閉じてZIPを開きますか？',
        )
      )
        return;
      const result = await readArchive(file, signal, setBusy);
      if (signal.aborted) return;
      // Validation completed before replacing any current data.
      pool.clear();
      result.assets.forEach((blob, id) => pool.assets.set(id, blob));
      setEpoch((v) => v + 1);
      dispatch({ type: 'replace', project: result.project });
      setSavedSignature(signature(result.project));
      view.setCenter(fromLonLat(result.project.view.center));
      view.setZoom(result.project.view.zoom);
      view.setRotation(result.project.view.rotation);
      setSelectedDrawing(null);
      setSelectedGcp(null);
      setFilterPhoto('');
      setFilterDate('');
      setMode('move');
      setPopup(null);
      setToolPane(null);
      setSoloMapPhotoIds([null, null]);
      setTab('photos');
      setMaximized(null);
      setExportEdge(result.project.export.longEdge);
      setExportBounds(result.project.export.bounds);
      setMessage('ZIPを復元しました。続けて編集できます。');
    });
  const addGis = (files: File[]) =>
    void run(async (signal) => {
      const gis = [];
      for (const file of files) {
        const features = await parseGisFile(file);
        if (signal.aborted) return;
        gis.push({
          id: id(),
          name: file.name,
          data: new GeoJSON().writeFeaturesObject(features, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
          }),
          visible: true,
        });
      }
      const next = validateProject({
        ...project,
        gis: [...project.gis, ...gis],
      });
      change(() => next);
    });
  const fit = () => {
    if (!active) return;
    try {
      const registration = fitRegistration(active.gcps);
      updatePhoto({ ...active, registration });
      setMessage(
        '位置合わせを適用しました。写真と地図の重ね合わせを確認してください。',
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const onSurfaceAction = (name: PaneName, action: SurfaceAction) => {
    const surface = name === 'photo' ? 'photo' : 'map';
    const displayPhoto = surface === 'photo' ? active : undefined;
    if (surface === 'photo' && !active) return;
    if (action.type === 'select') {
      setSelectedDrawing(action.id);
      if (mode !== 'edit') setPopup({ pane: name, type: 'drawing' });
      return;
    }
    if (action.type === 'gcp') {
      if (!active) {
        setMessage('先に写真を読み込んでください。');
        return;
      }
      const side = surface === 'photo' ? 'image' : 'map';
      const point =
        surface === 'photo' ? action.point : (toLonLat(action.point) as Point);
      if (
        side === 'image' &&
        (point[0] < -0.5 ||
          point[1] < -0.5 ||
          point[0] > active.width - 0.5 ||
          point[1] > active.height - 0.5)
      ) {
        setMessage('対応点を写真の範囲内に置いてください。');
        change((p) => ({ ...p }), false);
        return;
      }
      let g = active.gcps.find((g) => g.id === (action.id ?? selectedGcp));
      if (!g) g = active.gcps.find((g) => !g[side]);
      const next: Gcp = { ...(g ?? { id: id(), role: 'fit' }), [side]: point };
      updatePhoto({
        ...active,
        gcps: g
          ? active.gcps.map((v) => (v.id === g!.id ? next : v))
          : [...active.gcps, next],
      });
      setSelectedGcp(next.image && next.map ? null : next.id);
      setTab('gcps');
      return;
    }
    if (action.type === 'modify') {
      const d = project.drawings.find((d) => d.id === action.id);
      if (!d) return;
      const points = editDrawingPoints(d, action.points, project, displayPhoto);
      const problem = points
        ? geometryProblem(d.type, points)
        : 'この写真の位置合わせが必要です。';
      if (problem) {
        setMessage(problem);
        change((p) => ({ ...p }), false);
        return;
      }
      change((p) => ({
        ...p,
        drawings: p.drawings.map((v) =>
          v.id === d.id ? { ...v, points: points! } : v,
        ),
      }));
      return;
    }
    if (action.tool === 'crop' && active) {
      const [x0, y0, x1, y1] = bounds(action.points);
      const crop: Photo['crop'] = [
        Math.max(-0.5, x0),
        Math.max(-0.5, y0),
        Math.min(active.width - 0.5, x1),
        Math.min(active.height - 0.5, y1),
      ];
      if (crop[2] - crop[0] < 1 || crop[3] - crop[1] < 1) {
        setMessage('写真の内側に切抜き範囲を指定してください。');
        return;
      }
      updatePhoto({ ...active, crop });
      setMode('move');
      return;
    }
    if (action.tool === 'mask' && active) {
      const problem = geometryProblem('Polygon', action.points);
      if (problem) {
        setMessage(problem);
        return;
      }
      updatePhoto({ ...active, masks: [...active.masks, action.points] });
      setMode('move');
      return;
    }
    const type = action.tool === 'line' ? 'LineString' : 'Polygon';
    const points = displayPhoto
      ? action.points
      : action.points.map((p) => toLonLat(p) as Point);
    const problem = geometryProblem(type, points);
    if (problem) {
      setMessage(problem);
      return;
    }
    const drawing: Drawing = {
      id: id(),
      name: `${type === 'Polygon' ? '浸水範囲' : '境界線'} ${project.drawings.length + 1}`,
      type,
      points,
      anchor: displayPhoto ? 'photo' : 'map',
      ...(displayPhoto ? { photoId: displayPhoto.id } : {}),
      evidence: active ? [active.id] : [],
      classification: 'estimated',
      at: active?.capturedAt ?? '',
      memo: '',
      visible: true,
    };
    change((p) => ({ ...p, drawings: [...p.drawings, drawing] }));
    setSelectedDrawing(drawing.id);
    setMode('move');
    setPopup({ pane: name, type: 'drawing' });
  };
  const save = () =>
    void run(async (signal) => {
      const next: Project = {
        ...project,
        view: {
          center: toLonLat(view.getCenter()!) as Point,
          zoom: view.getZoom()!,
          rotation: view.getRotation(),
        },
        export: { longEdge: exportEdge, bounds: exportBounds },
      };
      validateProject(next);
      const shots: { name: string; blob: Blob }[] = [];
      setDialog(null);
      if (includeScreenshots) {
        for (const [name, map] of Object.entries(maps.current)) {
          if (!map || !map.getSize()?.[0]) continue;
          const ids =
            name === 'photo'
              ? [
                  ...(next.inverse.baseLayerId
                    ? [next.inverse.baseLayerId]
                    : []),
                  ...next.inverse.overlayIds,
                ]
              : [
                  next.panes[name === 'A' ? 0 : 1].baseLayerId,
                  ...next.panes[name === 'A' ? 0 : 1].overlayLayerIds,
                ];
          const attributions = [
            ...new Set(ids.map((id) => layerById.get(id)?.attribution)),
          ].join(' / ');
          shots.push({
            name,
            blob: await captureSurface(
              map,
              `${name} · 簡易オルソ化・加工 / ${attributions}`,
            ),
          });
        }
      }
      const blob = await saveArchive(next, pool.assets, signal, setBusy, {
        rasters: includeRasters,
        screenshots: shots,
      });
      download(blob, `photo-map-${new Date().toISOString().slice(0, 10)}.zip`);
      change(() => next, false);
      setSavedSignature(signature(next));
      setMessage('ZIPを保存しました。元画像と編集情報が含まれます。');
    });
  const newProject = () => {
    const p = emptyProject();
    dispatch({ type: 'replace', project: p });
    setSavedSignature(signature(p));
    pool.clear();
    setEpoch((v) => v + 1);
    setSelectedGcp(null);
    setSelectedDrawing(null);
    setMode('move');
    setPopup(null);
    setToolPane(null);
    setSoloMapPhotoIds([null, null]);
    setTab('photos');
    setMaximized(null);
    setFilterPhoto('');
    setFilterDate('');
    view.setCenter(fromLonLat(p.view.center));
    view.setZoom(p.view.zoom);
    view.setRotation(0);
    setDialog(null);
  };
  const deletePhoto = () => {
    if (!active) return;
    change((p) => ({
      ...p,
      photos: p.photos.filter((v) => v.id !== active.id),
      drawings: p.drawings
        .filter((d) => d.photoId !== active.id)
        .map((d) => ({
          ...d,
          evidence: d.evidence.filter((id) => id !== active.id),
        })),
      activePhotoId: p.photos.find((v) => v.id !== active.id)?.id ?? null,
    }));
    setSelectedGcp(null);
    setSoloMapPhotoIds((ids) => ids.map((id) => id === active.id ? null : id) as [string | null, string | null]);
    setDialog(null);
  };
  const choosePhoto = (photoId: string) => {
    const target = project.photos.find((photo) => photo.id === photoId);
    const polygon = target && footprint(target);
    if (polygon) {
      const area = bounds(polygon);
      const mapElement = document.querySelector<HTMLElement>('.pm-surface-A .pm-map');
      const size: [number, number] = mapElement
        ? [mapElement.clientWidth, mapElement.clientHeight]
        : [800, 700];
      const visible = view.calculateExtent(size) as [number, number, number, number];
      const overlap = Math.max(0, Math.min(area[2], visible[2]) - Math.max(area[0], visible[0])) *
        Math.max(0, Math.min(area[3], visible[3]) - Math.max(area[1], visible[1]));
      const areaSize = (area[2] - area[0]) * (area[3] - area[1]);
      const visibleSize = (visible[2] - visible[0]) * (visible[3] - visible[1]);
      if (overlap / Math.min(areaSize, visibleSize) < 0.25)
        view.fit(area, { size, padding: [50, 50, 50, 50], maxZoom: 18 });
    }
    change((p) => ({
      ...p,
      activePhotoId: photoId,
      layout: p.layout === 'maps' ? 'compare' : p.layout,
    }), false);
    setSelectedGcp(null);
    setMode('move');
    setToolPane(null);
    setPopup(null);
    setMaximized((value) => value === 'photo' ? value : null);
    setTab('photos');
  };
  const setSoloMapPhoto = (pane: 0 | 1, photoId: string | null) => {
    setSoloMapPhotoIds((ids) => ids.map((id, i) => i === pane ? photoId : id) as [string | null, string | null]);
  };
  const setTool = (tool: Mode, target: PaneName | null = null) => {
    setMode(tool);
    setToolPane(target);
    setPopup(null);
    setMessage('');
    if (tool === 'gcp') {
      setTab('gcps');
      setSidebar(true);
      setMaximized(null);
      if (project.layout === 'maps')
        change((p) => ({ ...p, layout: 'register' }), false);
    }
    if (tool === 'crop' || tool === 'mask') {
      setTab('photos');
      setMaximized(null);
      if (project.layout === 'maps')
        change((p) => ({ ...p, layout: 'register' }), false);
    }
  };
  const modeFor = (name: PaneName): Mode =>
    busy ? 'move' : mode === 'gcp' ? 'gcp' : toolPane === name ? mode : 'move';
  const togglePopup = (pane: PaneName, type: Popup['type']) => {
    setPopup((current) =>
      current?.pane === pane && current.type === type ? null : { pane, type },
    );
    if (type === 'drawing') setMode('move');
  };
  const fitPhoto = () => {
    const polygon = active && footprint(active);
    if (polygon)
      view.fit(bounds(polygon), {
        size: maps.current.A?.getSize(),
        padding: [40, 40, 40, 40],
        maxZoom: 20,
      });
  };
  const pane = (name: PaneName) => {
    const isPhoto = name === 'photo',
      index = name === 'B' ? 1 : 0;
    const localMode = modeFor(name);
    const frontFirst = [...project.photos].reverse();
    const photoIndex = frontFirst.findIndex((photo) => photo.id === active?.id);
    const popupId = `pm-popup-${name}-${popup?.type ?? 'layers'}`;
    return (
      <section
        key={name}
        className={`pm-surface pm-surface-${name}`}
        aria-label={isPhoto ? '写真パネル' : `地図${name}パネル`}
      >
        <div className="pm-surface-heading">
          <span>
            <b>{isPhoto ? '写真' : `地図 ${name}`}</b>
            <small>
              {isPhoto
                ? (active?.name ?? '写真を追加してください')
                : layerById.get(project.panes[index].baseLayerId)?.titleJa}
            </small>
          </span>
          <div>
            {isPhoto && active && (
              <div className="pm-photo-navigation" aria-label="写真を切り替える">
                <button
                  aria-label="前の写真"
                  title="写真一覧の上にある写真へ"
                  disabled={photoIndex <= 0}
                  onClick={() => choosePhoto(frontFirst[photoIndex - 1]!.id)}
                >
                  ‹
                </button>
                <span>{photoIndex + 1} / {frontFirst.length}</span>
                <button
                  aria-label="次の写真"
                  title="写真一覧の下にある写真へ"
                  disabled={photoIndex < 0 || photoIndex >= frontFirst.length - 1}
                  onClick={() => choosePhoto(frontFirst[photoIndex + 1]!.id)}
                >
                  ›
                </button>
              </div>
            )}
            {!isPhoto && soloMapPhotoIds[index] && tab !== 'gcps' && (
              <button onClick={() => setSoloMapPhoto(index, null)}>
                単独表示を解除
              </button>
            )}
            {isPhoto && active && (
              <button
                title="写真全体を表示"
                onClick={() =>
                  maps.current.photo
                    ?.getView()
                    .fit(
                      [-0.5, -active.height + 0.5, active.width - 0.5, 0.5],
                      {
                        size: maps.current.photo?.getSize(),
                        padding: [25, 25, 25, 25],
                      },
                    )
                }
              >
                全体
              </button>
            )}
            {(['drawing', 'layers'] as const).map((type) => (
              <button
                key={type}
                data-pane-menu-button
                aria-label={`${paneLabel(name)}の${type === 'layers' ? 'レイヤー' : '作図'}`}
                aria-expanded={popup?.pane === name && popup.type === type}
                aria-controls={`pm-popup-${name}-${type}`}
                className={
                  popup?.pane === name && popup.type === type ? 'is-active' : ''
                }
                onClick={() => togglePopup(name, type)}
              >
                {type === 'layers' ? 'レイヤー' : '作図'}
              </button>
            ))}
            <button
              aria-label={`${isPhoto ? '写真' : `地図${name}`}を${maximized === name ? '元の大きさに戻す' : '最大化'}`}
              onClick={() => {
                setMaximized(maximized === name ? null : name);
                setPopup(null);
                setMode('move');
              }}
            >
              {maximized === name ? '↙' : '↗'}
            </button>
          </div>
        </div>
        <Surface
          key={epoch}
          kind={isPhoto ? 'photo' : 'map'}
          pane={index}
          project={project}
          photo={active}
          displayPhotos={mapPhotos[index]}
          highlightedPhotoId={project.activePhotoId}
          view={view}
          pool={pool}
          mode={localMode}
          selectedGcp={selectedGcp}
          selectedDrawing={selectedDrawing}
          visibleDrawings={visibleDrawings}
          onAction={(action) => onSurfaceAction(name, action)}
          onSelectPhoto={choosePhoto}
          onSoloPhoto={(id) => setSoloMapPhoto(index, id)}
          onError={report}
          onViewChange={(v) =>
            setMapStatus(
              `${v.center[1].toFixed(5)}, ${v.center[0].toFixed(5)} · Z${v.zoom.toFixed(1)}`,
            )
          }
          onReady={(map) => {
            if (map) maps.current[name] = map;
            else delete maps.current[name];
          }}
        />
        {!isPhoto && active?.registration && mapPhotos[index].some((photo) =>
          photo.id === active.id && photo.opacity[index] > 0
        ) && (
          <div className="pm-map-photo-label" role="status">
            選択中の写真：{active.name}
          </div>
        )}
        {isPhoto && active && !active.registration && (
          <div className="pm-photo-registration-warning" role="status">
            この写真は位置合わせ前です。道路・河川などの逆投影は、対応点を4組以上設定してから表示されます。
          </div>
        )}
        {!isPhoto && name === 'A' && tab === 'gcps' && active?.registration && (
          <div className="pm-alignment-opacity">
            <label>
              <span>選択写真の透過度 {Math.round((1 - active.opacity[0]) * 100)}%</span>
              <input
                aria-label="位置合わせ後の写真の透過度"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={1 - active.opacity[0]}
                onChange={(e) => {
                  const opacity = [...active.opacity] as Photo['opacity'];
                  opacity[0] = 1 - Number(e.target.value);
                  updatePhoto({ ...active, opacity });
                }}
              />
            </label>
          </div>
        )}
        {isPhoto && !active && (
          <div className="pm-empty">
            <div className="pm-empty-icon">▧</div>
            <h2>写真から、浸水域を読み解く</h2>
            <p>
              斜め写真と地図に対応点を置き、
              <br />
              同じ場所を重ねて確認できます。
            </p>
            <button
              className="pm-primary"
              onClick={() => photoInput.current?.click()}
            >
              写真を読み込む
            </button>
            <small>JPEG / PNG / WebP · 複数選択できます</small>
            <p className="pm-private">画像と作業データは端末内で処理します。</p>
          </div>
        )}
        {isPhoto && <PhotoAttributions project={project} photo={active} />}
        {localMode !== 'move' && (
          <div className="pm-local-mode" role="status">
            <span>
              <b>{modeLabels[localMode]}中</b>
              <small>
                {localMode === 'gcp'
                  ? '写真と地図で同じ地点をクリック'
                  : localMode === 'crop'
                    ? '残す範囲の対角2点をクリック'
                    : localMode === 'edit'
                      ? '頂点をドラッグ・Alt＋クリックで削除'
                      : '頂点をクリック・ダブルクリックで完了'}
              </small>
            </span>
            <button onClick={() => setTool('move')}>終了</button>
          </div>
        )}
        {popup?.pane === name && (
          <PanePopover
            key={popup.type}
            id={popupId}
            title={`${paneLabel(name)}の${popup.type === 'layers' ? 'レイヤー設定' : '作図'}`}
            onClose={() => setPopup(null)}
          >
            {popup.type === 'layers' ? (
              <LayerPanel
                project={project}
                target={name}
                onChange={(next) => change(() => next)}
                onImport={() => gisInput.current?.click()}
              />
            ) : (
              <DrawingPanel
                project={project}
                surface={paneLabel(name)}
                canDraw={!isPhoto || !!active}
                selected={selectedDrawing}
                onSelect={setSelectedDrawing}
                filterPhoto={filterPhoto}
                filterDate={filterDate}
                visibleIds={visibleDrawings}
                onFilterPhoto={setFilterPhoto}
                onFilterDate={setFilterDate}
                onChange={(next) => change(() => next)}
                onError={report}
                onTool={(tool) => setTool(tool, name)}
              />
            )}
          </PanePopover>
        )}
      </section>
    );
  };
  return (
    <main
      className="pm-app"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (busy) return;
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 1 && files[0]!.name.toLowerCase().endsWith('.zip'))
          openArchive(files[0]!);
        else if (files.length) addPhotos(files);
      }}
    >
      <header className="pm-header">
        <a href="../" className="pm-brand" title="水害調査マルチマップへ">
          ≋
        </a>
        <div className="pm-title">
          <h1>浸水域判読支援</h1>
          <span>PHOTO × MAP</span>
        </div>
        <input
          className="pm-project-name"
          aria-label="プロジェクト名"
          maxLength={200}
          value={project.name}
          disabled={!!busy}
          onChange={(e) => change((p) => ({ ...p, name: e.target.value }))}
        />
        <span className={`pm-save-state ${dirty ? 'is-dirty' : ''}`}>
          {dirty ? '● 未保存' : '保存済み'}
        </span>
        <div className="pm-header-actions">
          <button disabled={!!busy} onClick={() => setDialog('new')}>
            新規
          </button>
          <button disabled={!!busy} onClick={() => zipInput.current?.click()}>
            ZIPを開く
          </button>
          <button
            className="pm-primary"
            disabled={!!busy}
            onClick={() => {
              setExportEdge(project.export.longEdge);
              setExportBounds(project.export.bounds);
              setDialog('save');
            }}
          >
            ZIPで保存
          </button>
          <button
            aria-label="使い方とデータの扱い"
            onClick={() => setDialog('help')}
          >
            ?
          </button>
        </div>
      </header>
      <nav className="pm-toolbar" aria-label="作業ツール">
        <button
          aria-label="作業パネルの開閉"
          onClick={() => setSidebar((v) => !v)}
        >
          ☰
        </button>
        <span className="pm-workflow-hint">
          写真を選ぶ → 対応点で位置合わせ → 各画面で比較・作図
        </span>
        <div className="pm-tool-group">
          <button
            aria-label="元に戻す"
            disabled={!history.past.length || !!busy}
            onClick={() => dispatch({ type: 'undo' })}
          >
            ↶
          </button>
          <button
            aria-label="やり直す"
            disabled={!history.future.length || !!busy}
            onClick={() => dispatch({ type: 'redo' })}
          >
            ↷
          </button>
        </div>
        <div className="pm-layouts">
          {(
            [
              ['register', '位置合わせ'],
              ['compare', '写真＋地図2面'],
              ['maps', '地図2面'],
            ] as const
          ).map(([layout, label]) => (
            <button
              className={project.layout === layout ? 'is-active' : ''}
              key={layout}
              onClick={() => {
                change((p) => ({ ...p, layout }), false);
                setMaximized(null);
                setPopup(null);
                setMode('move');
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
      <div className={`pm-body ${sidebar ? '' : 'pm-body-collapsed'}`}>
        {sidebar && (
          <aside className="pm-sidebar">
            <div className="pm-tabs">
              {(
                [
                  ['photos', '写真'],
                  ['gcps', '対応点'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={tab === value ? 'is-active' : ''}
                  onClick={() => {
                    setTab(value);
                    if (value === 'gcps' && active) setTool('gcp');
                    else setTool('move');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="pm-panel" inert={!!busy}>
              {tab === 'photos' && (
                <>
                  <button
                    className="pm-add"
                    onClick={() => photoInput.current?.click()}
                  >
                    ＋ 写真を追加
                  </button>
                  <div className="pm-section-title">
                    写真 <span>{project.photos.length}枚 · 上ほど前面</span>
                  </div>
                  <PhotoBatchControls
                    photos={project.photos}
                    onVisibility={(pane, visible) => change((p) => ({
                      ...p,
                      photos: p.photos.map((photo) => {
                        const values = [...photo.visible] as Photo['visible'];
                        values[pane] = visible;
                        return { ...photo, visible: values };
                      }),
                    }))}
                    onTransparency={(transparency) => change((p) => ({
                      ...p,
                      photos: p.photos.map((photo) => ({
                        ...photo,
                        opacity: [1 - transparency, 1 - transparency],
                      })),
                    }))}
                  />
                  <small>⠿ をドラッグして重なり順を変更できます。</small>
                  <PhotoList
                    photos={project.photos}
                    activeId={project.activePhotoId}
                    pool={pool}
                    onSelect={choosePhoto}
                    onChange={updatePhoto}
                    onReorder={(photos) => change((p) => ({ ...p, photos }))}
                  />
                  {active && (
                    <PhotoDetails
                      photo={active}
                      mode={mode}
                      onChange={updatePhoto}
                      onDelete={() => setDialog('delete')}
                      onFit={fitPhoto}
                      onRegister={() => {
                        setTab('gcps');
                        setTool('gcp');
                      }}
                      onTool={(tool) => setTool(tool, 'photo')}
                    />
                  )}
                </>
              )}
              {tab === 'gcps' &&
                (active ? (
                  <>
                    <label>
                      対象写真
                      <select
                        aria-label="位置合わせする写真"
                        value={active.id}
                        onChange={(e) => {
                          change(
                            (p) => ({ ...p, activePhotoId: e.target.value }),
                            false,
                          );
                          setSelectedGcp(null);
                        }}
                      >
                        {project.photos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className={mode === 'gcp' ? 'is-active' : 'pm-primary'}
                      aria-pressed={mode === 'gcp'}
                      onClick={() => setTool(mode === 'gcp' ? 'move' : 'gcp')}
                    >
                      {mode === 'gcp' ? '対応点入力を終了' : '対応点を置く'}
                    </button>
                    <GcpPanel
                      photo={active}
                      selected={selectedGcp}
                      onSelect={setSelectedGcp}
                      onChange={updatePhoto}
                      onFit={fit}
                    />
                  </>
                ) : (
                  <p className="pm-instruction">
                    写真を追加すると対応点を入力できます。
                  </p>
                ))}
            </div>
            <div className="pm-sidebar-bottom">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const result = parseCoordinateQuery(coordinate);
                  if (result) {
                    view.setCenter(
                      fromLonLat([result.longitude, result.latitude]),
                    );
                    view.setZoom(16);
                  } else
                    setMessage(
                      '緯度, 経度を入力してください。例：35.918, 139.908',
                    );
                }}
              >
                <input
                  aria-label="緯度・経度へ移動"
                  placeholder="緯度, 経度"
                  value={coordinate}
                  onChange={(e) => setCoordinate(e.target.value)}
                />
                <button>移動</button>
              </form>
              <small>端末内で処理 · 地図取得のみ外部通信</small>
            </div>
          </aside>
        )}
        <div
          ref={workArea}
          className={`pm-workspace pm-layout-${project.layout} ${maximized ? 'pm-maximized' : ''}`}
          style={{ '--pm-split': `${project.split}%` } as React.CSSProperties}
          inert={!!busy}
        >
          {maximized ? (
            pane(maximized)
          ) : (
            <>
              {project.layout !== 'maps' && pane('photo')}
              {pane('A')}
              {project.layout !== 'register' && pane('B')}
              <div
                className="pm-divider"
                role="separator"
                aria-label="画面の区切り"
                aria-orientation="vertical"
                aria-valuenow={project.split}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    change(
                      (p) => ({
                        ...p,
                        split: Math.max(
                          25,
                          Math.min(
                            75,
                            p.split + (e.key === 'ArrowLeft' ? -2 : 2),
                          ),
                        ),
                      }),
                      false,
                    );
                  }
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (
                    !e.currentTarget.hasPointerCapture(e.pointerId) ||
                    !workArea.current
                  )
                    return;
                  const rect = workArea.current.getBoundingClientRect();
                  const split = Math.max(
                    25,
                    Math.min(75, ((e.clientX - rect.left) / rect.width) * 100),
                  );
                  change((p) => ({ ...p, split }), false);
                }}
                onPointerUp={(e) =>
                  e.currentTarget.releasePointerCapture(e.pointerId)
                }
              />
            </>
          )}
        </div>
      </div>
      <footer className="pm-status">
        <span>
          {mode === 'move'
            ? '写真・地図をドラッグして移動'
            : `${toolPane ? paneLabel(toolPane) + ' · ' : ''}${modeLabels[mode]}`}
          {mode === 'gcp'
            ? ' · 写真と地図の同じ地点をクリック'
            : mode === 'crop'
              ? ' · 写真で矩形を指定'
              : mode === 'mask'
                ? ' · 除外部分を囲み、ダブルクリックで完了'
                : ''}
        </span>
        <span>{mapStatus}</span>
        <span>簡易オルソ化・平面近似</span>
      </footer>
      {message && (
        <div className="pm-toast" role="status">
          <span>{message}</span>
          <button aria-label="通知を閉じる" onClick={() => setMessage('')}>
            ×
          </button>
        </div>
      )}
      {busy && (
        <div className="pm-busy" role="dialog" aria-label="処理中">
          <div>
            <span className="pm-spinner" />
            <p aria-live="polite">{busy}</p>
            <button onClick={() => job.current?.abort()}>処理を中止</button>
          </div>
        </div>
      )}
      <input
        ref={photoInput}
        hidden
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        aria-label="写真ファイル"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) addPhotos(files);
        }}
      />
      <input
        ref={zipInput}
        hidden
        type="file"
        accept=".zip,application/zip"
        aria-label="プロジェクトZIP"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) openArchive(file);
        }}
      />
      <input
        ref={gisInput}
        hidden
        type="file"
        multiple
        accept=".geojson,.json,.kml"
        aria-label="GISファイル"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) addGis(files);
        }}
      />
      {dialog && (
        <div
          className="pm-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDialog(null);
          }}
        >
          <section
            className="pm-modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              dialog === 'save'
                ? 'ZIPの保存設定'
                : dialog === 'help'
                  ? '使い方とデータの扱い'
                  : dialog === 'delete'
                    ? '写真の削除'
                    : '新しいプロジェクト'
            }
          >
            <button
              className="pm-modal-close"
              aria-label="ダイアログを閉じる"
              onClick={() => setDialog(null)}
            >
              ×
            </button>
            {dialog === 'save' && (
              <>
                <h2>作業をZIPで保存</h2>
                <p>
                  元画像・対応点・行列・作図・GIS・表示設定をまとめます。元画像に含まれるEXIFなどのメタデータも保持します。
                </p>
                <label className="pm-check">
                  <input
                    type="checkbox"
                    checked={includeRasters}
                    onChange={(e) => setIncludeRasters(e.target.checked)}
                  />
                  変換画像と位置情報（PNG / PGW / PRJ）を含める
                </label>
                {includeRasters && (
                  <>
                    <label>
                      変換画像の長辺（px）
                      <input
                        type="number"
                        min="64"
                        max="8192"
                        step="1"
                        value={exportEdge}
                        onChange={(e) => setExportEdge(e.target.valueAsNumber)}
                      />
                    </label>
                    <label className="pm-check">
                      <input
                        type="checkbox"
                        checked={!!exportBounds}
                        onChange={(e) =>
                          setExportBounds(
                            e.target.checked
                              ? (view.calculateExtent(
                                  maps.current.A?.getSize() ?? [1000, 800],
                                ) as [number, number, number, number])
                              : null,
                          )
                        }
                      />
                      出力範囲を指定（初期値：現在の地図範囲）
                    </label>
                    {exportBounds && (
                      <fieldset>
                        <legend>EPSG:3857 出力範囲</legend>
                        {['西端X', '南端Y', '東端X', '北端Y'].map(
                          (label, i) => (
                            <label key={label}>
                              {label}
                              <input
                                type="number"
                                step="any"
                                value={exportBounds[i]}
                                onChange={(e) => {
                                  const b = [
                                    ...exportBounds,
                                  ] as typeof exportBounds;
                                  b[i] = e.target.valueAsNumber;
                                  setExportBounds(b);
                                }}
                              />
                            </label>
                          ),
                        )}
                      </fieldset>
                    )}
                    <small>
                      出力は最大3200万画素。大きい場合は解像度を調整します。
                    </small>
                  </>
                )}
                <label className="pm-check">
                  <input
                    type="checkbox"
                    checked={includeScreenshots}
                    onChange={(e) => setIncludeScreenshots(e.target.checked)}
                  />
                  表示中の比較画面PNGを含める
                </label>
                <p className="pm-muted">
                  背景地図のタイルは同梱しません。再取得時に見た目が変わる場合は、比較画面PNGを参照できます。
                </p>
                {project.photos.some((p) => p.registration && !footprint(p)) &&
                  includeRasters && (
                    <p className="pm-warning">
                      投影範囲が発散している写真があります。切抜きを修正するか、変換画像を含めず作業状態を保存してください。
                    </p>
                  )}
                <button className="pm-primary" onClick={save}>
                  ZIPを書き出す
                </button>
              </>
            )}
            {dialog === 'help' && (
              <>
                <h2>写真と地図から浸水域を判読する</h2>
                <ol>
                  <li>
                    左の写真一覧で写真を選び、「地図と位置合わせ（対応点）」から写真と地図の対応点を4組以上入力します。
                  </li>
                  <li>
                    「計算・適用」で位置合わせします。地図への写真投影と、写真への地理情報の逆投影を確認します。
                  </li>
                  <li>
                    写真一覧のチェックとスライダーで表示・透過度を調整します。⠿
                    をドラッグして並べ替え、上の写真ほど前面に重ねます。切抜きと不要部分の除外は「選択写真の編集」にあります。
                  </li>
                  <li>
                    各画面の「レイヤー」で重ねる情報を選び、「作図」から線・面をなぞります。操作は選んだ画面で行い、結果をほかの画面と共有します。写真上の図形は再計算時に写真へ追従し、地図上の図形は位置を保ちます。
                  </li>
                  <li>ZIPを保存して作業を引き継ぎます。</li>
                </ol>
                <h3>データの扱い</h3>
                <p>
                  画像、ファイル名、GCP、作図は開発者へ送信しません。アプリ配信と公式地図取得には通信があり、地図提供元には閲覧地域が伝わり得ます。ブラウザーの再読込みで作業データは失われるため、ZIPを保存してください。
                </p>
                <h3>簡易オルソ化の限界</h3>
                <p>
                  地表を一つの平面として近似します。地形の起伏、建物の高さ、レンズ歪みによるずれは残ります。屋根や一般化された河川ガイドを地表の対応点として扱わず、対象範囲を囲むように点を配置してください。
                </p>
                <p>
                  対象はJPEG・PNG・WebP。1枚100 MB・6400万画素以下、元画像合計1
                  GB以下です。画像処理は端末の性能に依存します。
                </p>
              </>
            )}
            {dialog === 'new' && (
              <>
                <h2>新しいプロジェクト</h2>
                <p>
                  {dirty
                    ? '未保存の作業があります。必要な場合は先にZIPを保存してください。'
                    : '現在の作業を閉じて、新しいプロジェクトを開きます。'}
                </p>
                <button className="pm-primary" onClick={newProject}>
                  現在の作業を閉じて新規作成
                </button>
              </>
            )}
            {dialog === 'delete' && active && (
              <>
                <h2>写真を削除</h2>
                <p>「{active.name}」を削除します。</p>
                <p>
                  この写真に追従する図形{' '}
                  {
                    project.drawings.filter((d) => d.photoId === active.id)
                      .length
                  }
                  件も削除します。他の図形の参照写真からも外します。元に戻す操作で復元できます。
                </p>
                <button className="pm-danger" onClick={deletePhoto}>
                  写真と関連図形を削除
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
