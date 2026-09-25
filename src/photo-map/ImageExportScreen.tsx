import { useEffect, useMemo, useRef, useState } from 'react';
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { defaults as controls } from 'ol/control/defaults.js';
import type BaseLayer from 'ol/layer/Base.js';
import { createMapLayer } from '../services/mapLayers';
import type { ElevationColorRange } from '../domain/layers';
import { baseLayerDefinitions, layerById, overlayLayerDefinitions } from '../config/layers';
import { createPhotoLayer } from './render';
import { ImagePool } from './media';
import { download, saveImageArchive } from './archive';
import { footprint } from './homography';
import { photoAtCoordinate } from './photoDisplay';
import { mapLayerOpacity } from './layerOpacity';
import {
  canvasBlob, compositePhotos, decorateMap, decorateOblique, drawAnnotations, drawElevationLegend, drawMapChrome,
  estimateExportElevationRange, frameFromSelection, obliquePair, renderMapVariant, sourcesText,
  type ExportVariant, type TileIssue,
} from './imageExport';
import type { Photo, Project } from './model';

type Rect = [number, number, number, number];
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';
const presets = [
  { id: '02_standard_map', label: '通常の地図', baseId: 'gsi-std', overlays: [] },
  { id: '03_aerial', label: '航空写真', baseId: 'gsi-seamlessphoto', overlays: [] },
  { id: '04_aerial_rivers', label: '航空写真＋河川線形', baseId: 'gsi-seamlessphoto', overlays: ['gsi-vector-river', 'gsi-river-centerline'] },
  { id: '05_flood_hazard_l2', label: '洪水浸水想定区域（L2）', baseId: 'gsi-pale', overlays: ['hazard-flood-l2'] },
  { id: '06_flood_hazard_l1', label: '洪水浸水想定区域（L1）', baseId: 'gsi-pale', overlays: ['hazard-flood-l1'] },
  { id: '07_flood_duration', label: '浸水継続時間', baseId: 'gsi-pale', overlays: ['hazard-flood-duration'] },
  { id: '08_relief', label: '色別標高図', baseId: 'gsi-relief', overlays: [] },
  { id: '09_relief_custom', label: '解析用色別標高図', baseId: 'gsi-relief-custom', overlays: [] },
] as const;
const initialPresets = presets.filter((preset) => preset.id !== '07_flood_duration').map((preset) => preset.id);
const clamp = (value: number, lower: number, upper: number) => Math.max(lower, Math.min(upper, value));

function moveRect(start: Rect, handle: Handle, dx: number, dy: number): Rect {
  if (handle === 'move') {
    const x = clamp(dx, -start[0], 1 - start[2]);
    const y = clamp(dy, -start[1], 1 - start[3]);
    return [start[0] + x, start[1] + y, start[2] + x, start[3] + y];
  }
  const result = [...start] as Rect;
  if (handle.includes('w')) result[0] = clamp(start[0] + dx, 0, start[2] - .08);
  if (handle.includes('e')) result[2] = clamp(start[2] + dx, start[0] + .08, 1);
  if (handle.includes('n')) result[1] = clamp(start[1] + dy, 0, start[3] - .08);
  if (handle.includes('s')) result[3] = clamp(start[3] + dy, start[1] + .08, 1);
  return result;
}

export function ImageExportScreen({ project, pool, sourceView, onClose }: {
  project: Project;
  pool: ImagePool;
  sourceView: View;
  onClose: () => void;
}) {
  const [baseId, setBaseId] = useState(project.panes[0].baseLayerId);
  const [overlays, setOverlays] = useState([...project.panes[0].overlayLayerIds]);
  const [overlayOpacity, setOverlayOpacity] = useState(.2);
  const [photoOpacity, setPhotoOpacity] = useState(1);
  const [selectedPhotos, setSelectedPhotos] = useState(() => project.photos.filter((photo) =>
    (photo.visible[0] || photo.visible[1]) && photo.registration && footprint(photo)).map((photo) => photo.id));
  const [photoOrder, setPhotoOrder] = useState(() => project.photos.map((photo) => photo.id));
  const [selectedPresets, setSelectedPresets] = useState<string[]>(initialPresets);
  const [drawings, setDrawings] = useState(false);
  const [longEdge, setLongEdge] = useState(4096);
  const [rect, setRect] = useState<Rect>([.1, .1, .9, .9]);
  const [busy, setBusy] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [previewRange, setPreviewRange] = useState<{ range: ElevationColorRange; estimated: boolean }>(() => ({
    range: project.panes[0].elevationColorRange, estimated: false,
  }));
  const [rangeStatus, setRangeStatus] = useState('');
  const [photoMenu, setPhotoMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const cropHost = useRef<HTMLDivElement>(null);
  const chromeCanvas = useRef<HTMLCanvasElement>(null);
  const annotationCanvas = useRef<HTMLCanvasElement>(null);
  const map = useRef<OlMap | null>(null);
  const mapLayers = useRef(new Map<string, BaseLayer>());
  const photoLayer = useRef<ReturnType<typeof createPhotoLayer> | null>(null);
  const drag = useRef<{ handle: Handle; rect: Rect; x: number; y: number } | null>(null);
  const rotate = useRef<{ x: number; y: number; angle: number; id: number; moved: boolean } | null>(null);
  const job = useRef<AbortController | null>(null);
  const draggedPhoto = useRef<string | null>(null);
  const legendDraw = useRef(0);
  const eligible = useMemo(() => project.photos.filter((photo) => photo.registration && footprint(photo)), [project.photos]);
  const photos = useMemo(() => photoOrder.map((id) => eligible.find((photo) => photo.id === id)).filter((photo): photo is Photo => !!photo && selectedPhotos.includes(photo.id)), [eligible, selectedPhotos, photoOrder]);
  const photoRows = useMemo(() => [...photoOrder].reverse().map((id) => eligible.find((photo) => photo.id === id)).filter((photo): photo is Photo => !!photo), [eligible, photoOrder]);
  const report = (message: string) => setWarnings((current) => current.includes(message) ? current : [...current, message]);
  const movePhoto = (id: string, offset: number) => setPhotoOrder((current) => {
    const from = current.indexOf(id), to = from + offset;
    if (from < 0 || to < 0 || to >= current.length) return current;
    const next = [...current]; next.splice(from, 1); next.splice(to, 0, id);
    return next;
  });
  const movePhotoToEdge = (id: string, front: boolean) => setPhotoOrder((current) => {
    const next = current.filter((candidate) => candidate !== id);
    if (front) next.push(id); else next.unshift(id);
    return next;
  });
  useEffect(() => {
    if (!photoMenu) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPhotoMenu(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [photoMenu]);

  useEffect(() => {
    const target = host.current;
    if (!target) return;
    const view = new View({ center: sourceView.getCenter(), resolution: sourceView.getResolution(), rotation: sourceView.getRotation(),
      minZoom: 2, maxZoom: 22, constrainResolution: false, enableRotation: true });
    const layer = createPhotoLayer(pool, 0, report);
    const current = new OlMap({ target, pixelRatio: 1, view, layers: [layer.layer], controls: controls({ rotate: false, attribution: true }) });
    map.current = current; photoLayer.current = layer;
    const observer = new ResizeObserver(() => current.updateSize()); observer.observe(target);
    current.renderSync();
    return () => {
      observer.disconnect();
      layer.dispose(); current.setTarget(undefined); current.dispose();
      map.current = null; photoLayer.current = null;
      job.current?.abort();
    };
  }, [pool, sourceView]);
  useEffect(() => {
    const current = map.current;
    const needed = baseId === 'gsi-relief-custom' || selectedPresets.includes('09_relief_custom');
    if (!current || !needed) { setRangeStatus(''); return; }
    let timer = 0;
    let controller: AbortController | null = null;
    const estimate = () => {
      window.clearTimeout(timer);
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      setRangeStatus('出力範囲の標高を推定中');
      timer = window.setTimeout(() => {
        try {
          const edge = Math.max(64, Math.round(Math.max(host.current?.clientWidth ?? 0, host.current?.clientHeight ?? 0)));
          const frame = frameFromSelection(current, rect, edge);
          void estimateExportElevationRange(frame, signal).then((range) => {
            if (signal.aborted) return;
            if (range) {
              setPreviewRange({ range, estimated: true });
              setRangeStatus(`推定標高レンジ：${range.minimum}〜${range.maximum} m`);
            } else {
              setPreviewRange({ range: project.panes[0].elevationColorRange, estimated: false });
              setRangeStatus('この範囲の標高を推定できません。出力時には設定済みレンジを使用します。');
            }
          }).catch((error: unknown) => {
            if (signal.aborted) return;
            setRangeStatus(error instanceof Error ? `標高の推定に失敗しました：${error.message}` : '標高の推定に失敗しました。');
          });
        } catch { setRangeStatus('地図のサイズを確認中'); }
      }, 300);
    };
    current.on('moveend', estimate); estimate();
    return () => { current.un('moveend', estimate); window.clearTimeout(timer); controller?.abort(); };
  }, [rect, baseId, selectedPresets, project]);
  useEffect(() => {
    const current = map.current, photo = photoLayer.current;
    if (!current || !photo) return;
    const pane = project.panes[0];
    current.getLayers().clear();
    mapLayers.current.clear();
    for (const id of [baseId, ...overlays]) {
      const definition = layerById.get(id);
      if (!definition) continue;
      const opacity = mapLayerOpacity(definition, pane);
      const layer = createMapLayer(definition, opacity, baseId === 'gsi-relief-custom' ? previewRange.range : pane.elevationColorRange);
      layer.setZIndex(definition.layerRole === 'base' ? 0 : 20);
      current.getLayers().push(layer);
      mapLayers.current.set(id, layer);
    }
    current.getLayers().push(photo.layer);
    current.render();
  }, [project, baseId, overlays, previewRange.range]);
  useEffect(() => {
    const current = map.current;
    if (!current) return;
    for (const id of overlays) mapLayers.current.get(id)?.setOpacity(overlayOpacity);
    current.renderSync();
  }, [overlayOpacity, overlays, baseId, previewRange.range]);
  useEffect(() => {
    const current = map.current, photo = photoLayer.current;
    if (!current || !photo) return;
    photo.update(photos.map((item) => ({ ...item, visible: [true, false], opacity: [photoOpacity, photoOpacity] })) as Photo[]);
    current.render();
  }, [photos, photoOpacity]);
  useEffect(() => {
    const current = map.current, canvas = annotationCanvas.current, target = host.current;
    if (!current || !canvas || !target) return;
    const redraw = () => {
      const width = target.clientWidth, height = target.clientHeight;
      if (!width || !height) return;
      canvas.width = width; canvas.height = height;
      const frame = frameFromSelection(current, [0, 0, 1, 1], Math.max(width, height));
      drawAnnotations(canvas, frame, project, drawings);
    };
    const observer = new ResizeObserver(redraw); observer.observe(target);
    current.on('moveend', redraw); redraw();
    return () => { observer.disconnect(); current.un('moveend', redraw); };
  }, [project, drawings]);
  useEffect(() => {
    const current = map.current, canvas = chromeCanvas.current, crop = cropHost.current;
    if (!current || !canvas || !crop) return;
    const redraw = () => {
      const edge = Math.round(Math.max(crop.clientWidth, crop.clientHeight));
      if (edge < 64) return;
      try {
        const frame = frameFromSelection(current, rect, edge);
        canvas.width = frame.width; canvas.height = frame.height;
        drawMapChrome(canvas, frame, {
          id: '01_ortho_composite', label: 'オルソ画像＋選択下絵', baseId, overlays,
          overlayOpacity, opacityByLayerId: project.panes[0].opacityByLayerId, ortho: true,
          elevationRange: previewRange.range,
          elevationRangeEstimated: previewRange.estimated,
        }, photos.map((photo) => photo.name), project.gis.filter((item) => item.visible).length);
        const version = ++legendDraw.current;
        void drawElevationLegend(canvas, {
          id: '01_ortho_composite', label: '', baseId, overlays, overlayOpacity,
          opacityByLayerId: project.panes[0].opacityByLayerId, ortho: true,
          elevationRange: previewRange.range,
          elevationRangeEstimated: previewRange.estimated,
        }, () => version === legendDraw.current).catch(report);
      } catch { /* The map may not have a size until its first layout. */ }
    };
    const observer = new ResizeObserver(redraw); observer.observe(crop);
    current.getView().on('change', redraw); current.on('moveend', redraw);
    redraw();
    return () => { observer.disconnect(); current.getView().un('change', redraw); current.un('moveend', redraw); };
  }, [rect, baseId, overlays, overlayOpacity, photos, project, previewRange.range, previewRange.estimated]);

  const startCrop = (event: React.PointerEvent<HTMLElement>, handle: Handle) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    drag.current = { handle, rect, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const cropMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !host.current) return;
    const bounds = host.current.getBoundingClientRect();
    setRect(moveRect(drag.current.rect, drag.current.handle,
      (event.clientX - drag.current.x) / bounds.width,
      (event.clientY - drag.current.y) / bounds.height));
  };
  const mainVariant: ExportVariant = {
    id: '01_ortho_composite', label: 'オルソ画像＋選択下絵', baseId, overlays,
    overlayOpacity, opacityByLayerId: project.panes[0].opacityByLayerId, ortho: true,
  };
  const variants: ExportVariant[] = [mainVariant, ...presets.filter((item) => selectedPresets.includes(item.id)).map((item) => ({
    ...item, overlays: [...item.overlays], overlayOpacity: 1, opacityByLayerId: {}, ortho: false,
  }))];
  const runExport = async () => {
    if (!map.current || job.current) return;
    if (!Number.isInteger(longEdge) || longEdge < 64 || longEdge > 8192) { report('長辺は64〜8192 pxで指定してください。'); return; }
    const controller = new AbortController(); job.current = controller;
    setWarnings([]); setBusy('出力範囲を計算中');
    const exportWarnings: string[] = [];
    const warn = (message: string) => { exportWarnings.push(message); report(message); };
    const tileIssues = new Map<string, TileIssue>();
    const collectTileIssues = (issues: TileIssue[]) => issues.forEach((issue) => {
      const existing = tileIssues.get(issue.layerId) ?? { layerId: issue.layerId, errors: 0, successes: 0 };
      existing.errors += issue.errors; existing.successes += issue.successes;
      tileIssues.set(issue.layerId, existing);
    });
    try {
      const frame = frameFromSelection(map.current, rect, longEdge);
      const needsElevation = variants.some((variant) => variant.baseId === 'gsi-relief-custom');
      if (needsElevation) setBusy('出力範囲の標高レンジを推定中');
      const estimatedRange = needsElevation ? await estimateExportElevationRange(frame, controller.signal) : null;
      if (needsElevation && !estimatedRange)
        warn('解析用色別標高図の標高を取得できませんでした。設定済みの配色レンジを使います。');
      const exportVariants = variants.map((variant) => variant.baseId === 'gsi-relief-custom'
        ? { ...variant, elevationRange: estimatedRange ?? project.panes[0].elevationColorRange, elevationRangeEstimated: !!estimatedRange }
        : variant);
      const blob = await saveImageArchive(controller.signal, async (add) => {
        for (const [index, variant] of exportVariants.entries()) {
          setBusy(`地図画像 ${index + 1}/${exportVariants.length}：${variant.label}`);
          const canvas = await renderMapVariant(frame, variant.ortho ? { ...variant, overlays: [] } : variant, controller.signal, warn, false, collectTileIssues);
          if (variant.ortho) {
            await compositePhotos(canvas, frame, photos, photoOpacity, pool.assets, controller.signal, setBusy);
            if (variant.overlays.length) {
              const top = await renderMapVariant(frame, { ...variant, baseId: '' }, controller.signal, warn, true, collectTileIssues);
              canvas.getContext('2d')!.drawImage(top, 0, 0);
            }
          }
          drawAnnotations(canvas, frame, project, drawings);
          const decorated = await decorateMap(canvas, frame, variant, variant.ortho ? photos.map((photo) => photo.name) : [], project.gis.filter((dataset) => dataset.visible).length);
          await add(`${variant.id}.png`, await canvasBlob(decorated));
        }
        for (const [index, photo] of photos.entries()) {
          setBusy(`斜め画像 ${index + 1}/${photos.length}：${photo.name}`);
          try {
            const [reference, after] = await obliquePair(photo, project, pool.assets, longEdge, controller.signal, warn);
            const stem = `photo_${String(index + 1).padStart(3, '0')}`;
            await add(`${stem}_01_reference.png`, await decorateOblique(reference, '出典：国土地理院・全国最新写真 / 写真面へ逆投影・加工。撮影時期未確認'));
            await add(`${stem}_02_after.png`, await decorateOblique(after, `写真：${photo.source || '出典未入力'} / 向き・切抜き・マスクを適用`));
          } catch (error) {
            if (controller.signal.aborted) throw error;
            warn(`${photo.name}の斜め画像ペアを作成できませんでした：${error instanceof Error ? error.message : '不明なエラー'}`);
          }
        }
        if (tileIssues.size) {
          report('一部の地図タイルは未収録または取得できませんでした。取得済み部分は保持して出力しました。詳細は sources.txt を確認してください。');
          exportWarnings.push(...[...tileIssues.values()].map((issue) =>
            `${layerById.get(issue.layerId)?.titleJa ?? issue.layerId}：未取得 ${issue.errors} タイル、取得 ${issue.successes} タイル（未収録域を含む可能性があります）`));
        }
        await add('sources.txt', new Blob([sourcesText(exportVariants, photos, project), exportWarnings.length ? `\n出力時の注意：\n${[...new Set(exportWarnings)].join('\n')}\n` : ''], { type: 'text/plain;charset=utf-8' }));
      });
      download(blob, `photo-map-images-${new Date().toISOString().slice(0, 10)}.zip`);
      setBusy('');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        report(error instanceof Error ? error.message : '画像の出力に失敗しました。');
      setBusy('');
    } finally { job.current = null; }
  };

  return <main className="pm-export-screen">
    <header className="pm-export-header">
      <button onClick={onClose} disabled={!!busy}>← 作業画面へ戻る</button>
      <h1>オルソ画像エクスポート</h1>
      <span>地図をドラッグ・ズーム、右ドラッグで回転。枠を動かして範囲を指定します。</span>
      <button className="pm-primary" onClick={() => void runExport()} disabled={!!busy}>比較画像ZIPを書き出す</button>
    </header>
    <div className="pm-export-body">
      <aside className="pm-export-settings">
        <h2>出力設定</h2>
        <label>画像の長辺（px）<input type="number" min="64" max="8192" value={longEdge} onChange={(event) => setLongEdge(event.target.valueAsNumber)} /></label>
        <label>下絵<select value={baseId} onChange={(event) => setBaseId(event.target.value)}>
          {baseLayerDefinitions.map((layer) => <option key={layer.id} value={layer.id}>{layer.titleJa}</option>)}
        </select></label>
        <label className="pm-check"><input type="checkbox" checked={drawings} onChange={(event) => setDrawings(event.target.checked)} />浸水域の作図を画像に重ねる</label>
        <fieldset><legend>主画像の重畳情報</legend>
          {overlayLayerDefinitions.map((layer) => <label className="pm-check" key={layer.id}><input type="checkbox" checked={overlays.includes(layer.id)} onChange={(event) => setOverlays((current) => event.target.checked ? [...current, layer.id] : current.filter((id) => id !== layer.id))} />{layer.titleJa}</label>)}
        </fieldset>
        <label>重畳情報の濃さ {Math.round(overlayOpacity * 100)}%<input type="range" min="0" max="1" step="0.01" value={overlayOpacity} disabled={!overlays.length} onChange={(event) => setOverlayOpacity(Number(event.target.value))} /></label>
        {!overlays.length && <small className="pm-muted">主画像の重畳情報を選ぶと濃さを調整できます。</small>}
        <label>オルソ写真の濃さ {Math.round(photoOpacity * 100)}%<input type="range" min="0" max="1" step="0.01" value={photoOpacity} onChange={(event) => setPhotoOpacity(Number(event.target.value))} /></label>
        <fieldset><legend>出力する写真（地図A・Bで表示中の写真を初期選択）</legend>
          <small>上ほど前面。⠿をドラッグするか矢印で順序を変更できます。</small>
          {photoRows.map((photo, index) => <div className="pm-export-photo-row" key={photo.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const fromId = draggedPhoto.current;
              if (!fromId || fromId === photo.id) return;
              setPhotoOrder((current) => {
                const frontFirst = [...current].reverse();
                const from = frontFirst.indexOf(fromId), to = frontFirst.indexOf(photo.id);
                if (from < 0 || to < 0) return current;
                frontFirst.splice(from, 1); frontFirst.splice(to, 0, fromId);
                return frontFirst.reverse();
              });
              draggedPhoto.current = null;
            }}>
            <span className="pm-export-drag" draggable onDragStart={() => { draggedPhoto.current = photo.id; }} onDragEnd={() => { draggedPhoto.current = null; }} title="ドラッグして順序変更">⠿</span>
            <label className="pm-check"><input type="checkbox" checked={selectedPhotos.includes(photo.id)} onChange={(event) => setSelectedPhotos((current) => event.target.checked ? [...current, photo.id] : current.filter((id) => id !== photo.id))} />{photo.name}</label>
            <button type="button" aria-label={`${photo.name}を前面へ`} disabled={index === 0} onClick={() => movePhoto(photo.id, 1)}>↑</button>
            <button type="button" aria-label={`${photo.name}を背面へ`} disabled={index === photoRows.length - 1} onClick={() => movePhoto(photo.id, -1)}>↓</button>
          </div>)}
          {!eligible.length && <small>位置合わせ済みの写真はありません。</small>}
        </fieldset>
        <fieldset><legend>同一画角の比較画像</legend>
          {presets.map((preset) => <label className="pm-check" key={preset.id}><input type="checkbox" checked={selectedPresets.includes(preset.id)} onChange={(event) => setSelectedPresets((current) => event.target.checked ? [...current, preset.id] : current.filter((id) => id !== preset.id))} />{preset.label}</label>)}
        </fieldset>
        {rangeStatus && <small role="status" className="pm-muted">{rangeStatus}</small>}
        <p className="pm-muted">_reference は国土地理院「全国最新写真」の比較用画像です。撮影時期が災害前とは限りません。画像と作業データは外部へ送信しません。</p>
        {warnings.map((warning) => <p role="status" className="pm-warning" key={warning}>{warning}</p>)}
      </aside>
      <section className="pm-export-preview" aria-label="出力画角のプレビュー"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDownCapture={(event) => {
          if ((event.target as HTMLElement).closest('.pm-export-context')) return;
          if (event.button !== 2 || !map.current) { if (photoMenu) setPhotoMenu(null); return; }
          event.preventDefault(); rotate.current = { x: event.clientX, y: event.clientY, angle: map.current.getView().getRotation(), id: event.pointerId, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (rotate.current?.id !== event.pointerId) return;
          if (Math.hypot(event.clientX - rotate.current.x, event.clientY - rotate.current.y) > 6) rotate.current.moved = true;
          if (rotate.current.moved) { setPhotoMenu(null); map.current?.getView().setRotation(rotate.current.angle + (event.clientX - rotate.current.x) * .005); }
        }}
        onPointerUp={(event) => {
          if (rotate.current?.id !== event.pointerId) return;
          const wasDrag = rotate.current.moved;
          rotate.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          if (wasDrag || !map.current) return;
          const coordinate = map.current.getEventCoordinate(event.nativeEvent);
          const hit = photoAtCoordinate(photos.map((photo) => ({ ...photo, visible: [true, false], opacity: [photoOpacity, photoOpacity] })), 0, coordinate as [number, number]);
          if (!hit) { setPhotoMenu(null); return; }
          const bounds = event.currentTarget.getBoundingClientRect();
          setPhotoMenu({ id: hit.id, x: clamp(event.clientX - bounds.left, 8, bounds.width - 190), y: clamp(event.clientY - bounds.top, 8, bounds.height - 180) });
        }}
      >
        <div ref={host} className="pm-export-map" />
        <canvas ref={annotationCanvas} className="pm-export-annotations" aria-hidden="true" />
        <div className="pm-export-opacity-note" aria-live="polite">重畳情報 {overlays.length}件・濃さ {Math.round(overlayOpacity * 100)}%</div>
        <div ref={cropHost} className="pm-export-crop" style={{ left: `${rect[0] * 100}%`, top: `${rect[1] * 100}%`, width: `${(rect[2] - rect[0]) * 100}%`, height: `${(rect[3] - rect[1]) * 100}%` }}
          onPointerMove={cropMove}
          onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
          <canvas ref={chromeCanvas} className="pm-export-chrome" role="img" aria-label="縮尺・北の方位・出典・クレジットの出力プレビュー" />
          {(['n', 'e', 's', 'w'] as const).map((handle) => <span key={`edge-${handle}`} className={`pm-crop-edge pm-crop-edge-${handle}`} onPointerDown={(event) => startCrop(event, handle)} />)}
          {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((handle) => <span key={handle} className={`pm-crop-handle pm-crop-${handle}`} onPointerDown={(event) => startCrop(event, handle)} />)}
          <b onPointerDown={(event) => startCrop(event, 'move')}>出力範囲を移動</b>
        </div>
        {photoMenu && <div className="pm-export-context" role="menu" aria-label={`${eligible.find((photo) => photo.id === photoMenu.id)?.name ?? '写真'}のレイヤー操作`} style={{ left: photoMenu.x, top: photoMenu.y }}>
          <strong>{eligible.find((photo) => photo.id === photoMenu.id)?.name}</strong>
          <button role="menuitem" disabled={photoOrder.indexOf(photoMenu.id) === photoOrder.length - 1} onClick={() => { movePhoto(photoMenu.id, 1); setPhotoMenu(null); }}>前面に移動</button>
          <button role="menuitem" disabled={photoOrder.indexOf(photoMenu.id) === 0} onClick={() => { movePhoto(photoMenu.id, -1); setPhotoMenu(null); }}>背面に移動</button>
          <button role="menuitem" disabled={photoOrder.indexOf(photoMenu.id) === photoOrder.length - 1} onClick={() => { movePhotoToEdge(photoMenu.id, true); setPhotoMenu(null); }}>最前面に移動</button>
          <button role="menuitem" disabled={photoOrder.indexOf(photoMenu.id) === 0} onClick={() => { movePhotoToEdge(photoMenu.id, false); setPhotoMenu(null); }}>最背面に移動</button>
          <button role="menuitem" onClick={() => { setSelectedPhotos((current) => current.filter((id) => id !== photoMenu.id)); setPhotoMenu(null); }}>非表示にする</button>
        </div>}
      </section>
    </div>
    {busy && <div className="pm-export-progress" role="status">{busy}<button onClick={() => job.current?.abort()}>中止</button></div>}
  </main>;
}
