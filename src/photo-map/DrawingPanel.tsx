import { toLonLat } from 'ol/proj.js';
import { exportDrawings } from './archive';
import { drawingWorldPoints } from './geometry';
import { DrawingDetails } from './Panels';
import type { Mode, Point, Project } from './model';

export function DrawingPanel({
  project,
  surface,
  canDraw,
  selected,
  filterPhoto,
  filterDate,
  visibleIds,
  onSelect,
  onChange,
  onTool,
  onFilterPhoto,
  onFilterDate,
  onError,
}: {
  project: Project;
  surface: string;
  canDraw: boolean;
  selected: string | null;
  filterPhoto: string;
  filterDate: string;
  visibleIds: Set<string>;
  onSelect: (id: string | null) => void;
  onChange: (p: Project) => void;
  onTool: (mode: Mode) => void;
  onFilterPhoto: (value: string) => void;
  onFilterDate: (value: string) => void;
  onError: (message: string) => void;
}) {
  const drawing = project.drawings.find((d) => d.id === selected);
  return (
    <>
      <p className="pm-instruction">
        {surface}で作図します。作成した線・面はほかの画面にも表示されます。
      </p>
      <div className="pm-draw-tools">
        <button disabled={!canDraw} onClick={() => onTool('line')}>
          線を描く<small>浸水の境界線</small>
        </button>
        <button disabled={!canDraw} onClick={() => onTool('polygon')}>
          面を描く<small>浸水範囲</small>
        </button>
        <button
          disabled={!canDraw || !project.drawings.length}
          onClick={() => onTool('edit')}
        >
          頂点を編集<small>形を修正する</small>
        </button>
      </div>
      <p className="pm-muted">
        クリックで頂点を追加し、ダブルクリックで完了します。頂点編集はドラッグで移動・追加、Alt＋クリックで削除できます。
      </p>
      <div className="pm-section-title">
        作図一覧 <span>{project.drawings.length}件・全画面共通</span>
      </div>
      <details>
        <summary>写真・対象日で絞り込む</summary>
        <label>
          写真で絞り込む
          <select
            value={filterPhoto}
            onChange={(e) => onFilterPhoto(e.target.value)}
          >
            <option value="">すべての写真</option>
            {project.photos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          対象日で絞り込む
          <input
            type="date"
            value={filterDate}
            onChange={(e) => onFilterDate(e.target.value)}
          />
        </label>
      </details>
      {project.drawings
        .filter((d) => visibleIds.has(d.id))
        .map((d) => (
          <div className="pm-drawing-row" key={d.id}>
            <input
              aria-label={`${d.name}を表示`}
              type="checkbox"
              checked={d.visible}
              onChange={(e) =>
                onChange({
                  ...project,
                  drawings: project.drawings.map((v) =>
                    v.id === d.id ? { ...v, visible: e.target.checked } : v,
                  ),
                })
              }
            />
            <button
              className={d.id === selected ? 'is-selected' : ''}
              onClick={() => onSelect(d.id)}
            >
              {d.type === 'Polygon' ? '▱' : '⌁'} {d.name}
              <small>
                {d.anchor === 'photo' ? '写真に追従' : '地図に固定'}
              </small>
            </button>
          </div>
        ))}
      {!project.drawings.length && (
        <p className="pm-muted">
          まだ作図はありません。上の「線を描く」「面を描く」から始めます。
        </p>
      )}
      {drawing && (
        <DrawingDetails
          drawing={drawing}
          photos={project.photos}
          onChange={(d) =>
            onChange({
              ...project,
              drawings: project.drawings.map((v) => (v.id === d.id ? d : v)),
            })
          }
          onDelete={() => {
            onChange({
              ...project,
              drawings: project.drawings.filter((d) => d.id !== drawing.id),
            });
            onSelect(null);
          }}
          onFix={() => {
            const points = drawingWorldPoints(drawing, project.photos);
            if (!points) {
              onError('写真の位置合わせを先に行ってください。');
              return;
            }
            onChange({
              ...project,
              drawings: project.drawings.map((d) =>
                d.id === drawing.id
                  ? {
                      ...d,
                      anchor: 'map',
                      photoId: undefined,
                      points: points.map((p) => toLonLat(p) as Point),
                    }
                  : d,
              ),
            });
          }}
        />
      )}
      <details>
        <summary>作図をGISへ書き出す</summary>
        <div className="pm-button-row">
          <button onClick={() => exportDrawings(project, 'geojson')}>
            GeoJSON
          </button>
          <button onClick={() => exportDrawings(project, 'kml')}>KML</button>
        </div>
        <small>
          位置合わせ前の写真に描いた図形は、GIS出力から除外されます。ZIPには保持します。
        </small>
      </details>
    </>
  );
}
