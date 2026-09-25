import { useEffect, useState } from 'react';
import {
  baseLayerDefinitions,
  layerById,
  overlayLayerDefinitions,
} from '../config/layers';
import type { PaneLayerState } from '../domain/layers';
import { footprint } from './homography';
import { hasDraft } from './model';
import type { Drawing, Gcp, Mode, Photo, Project } from './model';
import type { ImagePool } from './media';

export function PhotoThumbnail({
  photo,
  pool,
}: {
  photo: Photo;
  pool: ImagePool;
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    void pool
      .previewUrl(photo, 240)
      .then((url) => {
        if (active) setUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [photo.id, photo, pool]);
  return url ? (
    <img src={url} alt="" className="pm-thumb" />
  ) : (
    <span className="pm-thumb pm-placeholder">画像</span>
  );
}
export function PhotoDetails({
  photo,
  mode,
  onChange,
  onDelete,
  onFit,
  onRegister,
  onTool,
}: {
  photo: Photo;
  mode: Mode;
  onChange: (p: Photo) => void;
  onDelete: () => void;
  onFit: () => void;
  onRegister: () => void;
  onTool: (mode: 'crop' | 'mask') => void;
}) {
  return (
    <section className="pm-details" aria-label="選択写真の編集">
      <div className="pm-section-title">選択写真の編集</div>
      <strong className="pm-edit-photo-name">{photo.name}</strong>
      <button className="pm-primary" onClick={onRegister}>
        地図と位置合わせ（対応点）
      </button>
      <div className="pm-photo-edit-tools">
        <button aria-pressed={mode === 'crop'} onClick={() => onTool('crop')}>
          矩形で切り抜く<small>写真に残す範囲を指定</small>
        </button>
        <button aria-pressed={mode === 'mask'} onClick={() => onTool('mask')}>
          不要部分を隠す<small>テロップなどを除外</small>
        </button>
      </div>
      <small>元画像と対応点の座標は維持します。</small>
      <details>
        <summary>切抜き・部分除外の管理</summary>
        <button
          onClick={() =>
            onChange({
              ...photo,
              crop: [-0.5, -0.5, photo.width - 0.5, photo.height - 0.5],
            })
          }
        >
          トリミングを解除
        </button>
        {photo.masks.map((_, i) => (
          <button
            key={i}
            onClick={() =>
              onChange({
                ...photo,
                masks: photo.masks.filter((_, j) => j !== i),
              })
            }
          >
            部分除外 {i + 1} を削除
          </button>
        ))}
      </details>
      <button
        disabled={!photo.registration || !footprint(photo)}
        onClick={onFit}
      >
        写真の投影範囲へ移動
      </button>
      <details className="pm-photo-metadata">
        <summary>写真の情報・名称</summary>
        <label>
          写真名
          <input
            value={photo.name}
            maxLength={200}
            onChange={(e) => onChange({ ...photo, name: e.target.value })}
          />
        </label>
        <p className="pm-muted">
          {photo.width.toLocaleString()} × {photo.height.toLocaleString()} px ·
          元画像を保持
        </p>
        <label>
          撮影日時
          <input
            type="datetime-local"
            value={photo.capturedAt}
            onChange={(e) => onChange({ ...photo, capturedAt: e.target.value })}
          />
        </label>
        <label>
          出典
          <input
            value={photo.source}
            maxLength={4000}
            onChange={(e) => onChange({ ...photo, source: e.target.value })}
          />
        </label>
        <label>
          メモ
          <textarea
            value={photo.memo}
            maxLength={4000}
            rows={2}
            onChange={(e) => onChange({ ...photo, memo: e.target.value })}
          />
        </label>
        <button className="pm-danger" onClick={onDelete}>
          写真を削除…
        </button>
      </details>
    </section>
  );
}
export function GcpPanel({
  photo,
  selected,
  onSelect,
  onChange,
  onFit,
}: {
  photo: Photo;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (photo: Photo) => void;
  onFit: () => void;
}) {
  const current = photo.gcps.find((g) => g.id === selected),
    r = photo.registration;
  const patch = (g: Gcp) =>
    onChange({
      ...photo,
      gcps: photo.gcps.map((p) => (p.id === g.id ? g : p)),
    });
  const fitCount = photo.gcps.filter(
    (g) => g.role === 'fit' && g.image && g.map,
  ).length;
  return (
    <>
      <p className="pm-instruction">
        写真と地図の同じ地点をクリックします。広く分散した6〜10点を目安に、同じ地表面の地点を選びます。
      </p>
      <div className="pm-metric">
        <strong>{fitCount}</strong>
        <span>
          計算に使える対応点
          <br />
          4組以上で計算できます
        </span>
      </div>
      <div className="pm-button-row">
        <button className="pm-primary" disabled={fitCount < 4} onClick={onFit}>
          計算・適用
        </button>
        <button onClick={() => onSelect(null)}>次の対応点</button>
      </div>
      {hasDraft(photo) && (
        <p className="pm-warning">
          未反映の編集があります。表示は前回の確定結果です。
        </p>
      )}
      {r && (
        <div className="pm-quality">
          <b>確定結果の残差 RMS</b>
          <div>
            {r.rmsPixels.toFixed(2)} px / {r.rmsMetres.toFixed(2)} m
          </div>
          <small>
            平面への当てはまりの指標です。位置精度の保証ではありません。
          </small>
          {r.gcps.filter((g) => g.role === 'fit' && g.image && g.map).length ===
            4 && (
            <p>
              4点では独立した精度検証ができません。検証点を追加してください。
            </p>
          )}
          {!footprint(photo) && (
            <p className="pm-warning">
              投影範囲が発散しています。地平線などをトリミングしてください。
            </p>
          )}
        </div>
      )}
      <ol className="pm-gcp-list">
        {photo.gcps.map((g, i) => {
          const residual = r?.residuals.find((v) => v.id === g.id);
          return (
            <li key={g.id}>
              <button
                className={selected === g.id ? 'is-selected' : ''}
                onClick={() => onSelect(g.id)}
              >
                <span className="pm-dot">{i + 1}</span>
                <span>
                  {g.image ? '写真 ✓' : '写真 —'} /{' '}
                  {g.map ? '地図 ✓' : '地図 —'}
                  <small>
                    {g.role === 'fit'
                      ? '計算'
                      : g.role === 'check'
                        ? '検証'
                        : '除外'}
                    {residual
                      ? ` · ${residual.metres.toFixed(2)} m / ${residual.pixels.toFixed(1)} px`
                      : ''}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {current && (
        <div className="pm-details">
          <label>
            この点の用途
            <select
              value={current.role}
              onChange={(e) =>
                patch({ ...current, role: e.target.value as Gcp['role'] })
              }
            >
              <option value="fit">計算に使用</option>
              <option value="check">検証点（計算には不使用）</option>
              <option value="off">除外</option>
            </select>
          </label>
          <fieldset>
            <legend>写真の画素座標</legend>
            {(['X', 'Y'] as const).map((label, i) => (
              <label key={label}>
                {label}
                <input
                  aria-label={`GCP 写真 ${label}`}
                  type="number"
                  step="any"
                  value={current.image?.[i] ?? ''}
                  onChange={(e) => {
                    const value = e.target.valueAsNumber;
                    if (!Number.isFinite(value)) return;
                    const point = [...(current.image ?? [0, 0])] as [
                      number,
                      number,
                    ];
                    point[i] = Math.min(
                      (i === 0 ? photo.width : photo.height) - 0.5,
                      Math.max(-0.5, value),
                    );
                    patch({ ...current, image: point });
                  }}
                />
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>地図の座標</legend>
            {(['経度', '緯度'] as const).map((label, i) => (
              <label key={label}>
                {label}
                <input
                  aria-label={`GCP ${label}`}
                  type="number"
                  step="any"
                  value={current.map?.[i] ?? ''}
                  onChange={(e) => {
                    const value = e.target.valueAsNumber;
                    if (!Number.isFinite(value)) return;
                    const point = [...(current.map ?? [0, 0])] as [
                      number,
                      number,
                    ];
                    point[i] = Math.min(
                      i === 0 ? 180 : 85.051128,
                      Math.max(i === 0 ? -180 : -85.051128, value),
                    );
                    patch({ ...current, map: point });
                  }}
                />
              </label>
            ))}
          </fieldset>
          <button
            className="pm-danger"
            onClick={() => {
              onChange({
                ...photo,
                gcps: photo.gcps.filter((g) => g.id !== current.id),
              });
              onSelect(null);
            }}
          >
            この対応点を削除
          </button>
        </div>
      )}
      {r && (
        <details>
          <summary>確定した行列・対応点</summary>
          <p>行優先の3×3行列。写真の元画素座標 → EPSG:3857。</p>
          <pre>{JSON.stringify(r.h, null, 2)}</pre>
          <button
            onClick={() => {
              const a = document.createElement('a');
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(r, null, 2)], {
                  type: 'application/json',
                }),
              );
              a.href = url;
              a.download = 'registration.json';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            行列・対応点JSONを保存
          </button>
        </details>
      )}
    </>
  );
}
export function DrawingDetails({
  drawing,
  photos,
  onChange,
  onDelete,
  onFix,
}: {
  drawing: Drawing;
  photos: Photo[];
  onChange: (d: Drawing) => void;
  onDelete: () => void;
  onFix: () => void;
}) {
  return (
    <div className="pm-details">
      <label>
        名称
        <input
          value={drawing.name}
          maxLength={200}
          onChange={(e) => onChange({ ...drawing, name: e.target.value })}
        />
      </label>
      <label>
        区分
        <select
          value={drawing.classification}
          onChange={(e) =>
            onChange({
              ...drawing,
              classification: e.target.value as Drawing['classification'],
            })
          }
        >
          <option value="estimated">推定</option>
          <option value="interpreted">写真から判読</option>
        </select>
      </label>
      <label>
        対象日時
        <input
          type="datetime-local"
          value={drawing.at}
          onChange={(e) => onChange({ ...drawing, at: e.target.value })}
        />
      </label>
      <label>
        メモ
        <textarea
          rows={2}
          value={drawing.memo}
          maxLength={4000}
          onChange={(e) => onChange({ ...drawing, memo: e.target.value })}
        />
      </label>
      <fieldset>
        <legend>参照写真</legend>
        {photos.map((p) => (
          <label className="pm-check" key={p.id}>
            <input
              type="checkbox"
              checked={drawing.evidence.includes(p.id)}
              onChange={(e) =>
                onChange({
                  ...drawing,
                  evidence: e.target.checked
                    ? [...drawing.evidence, p.id]
                    : drawing.evidence.filter((id) => id !== p.id),
                })
              }
            />
            {p.name}
          </label>
        ))}
      </fieldset>
      <p className="pm-muted">
        {drawing.anchor === 'photo' ? '写真の輪郭に追従' : '地図の位置を固定'}
      </p>
      {drawing.anchor === 'photo' && (
        <button onClick={onFix}>地図位置を固定する</button>
      )}
      <button className="pm-danger" onClick={onDelete}>
        図形を削除
      </button>
    </div>
  );
}
export function LayerPanel({
  project,
  target,
  onChange,
  onImport,
}: {
  project: Project;
  target: 'A' | 'B' | 'photo';
  onChange: (p: Project) => void;
  onImport: () => void;
}) {
  const index = target === 'B' ? 1 : 0,
    pane = project.panes[index];
  const update = (next: PaneLayerState) => {
    const panes = [...project.panes] as Project['panes'];
    panes[index] = next;
    onChange({ ...project, panes });
  };
  const selected =
    target === 'photo' ? project.inverse.overlayIds : pane.overlayLayerIds;
  return (
    <>
      <label>
        背景地図
        <select
          aria-label="背景地図"
          value={
            target === 'photo'
              ? (project.inverse.baseLayerId ?? '')
              : pane.baseLayerId
          }
          onChange={(e) =>
            target === 'photo'
              ? onChange({
                  ...project,
                  inverse: {
                    ...project.inverse,
                    baseLayerId: e.target.value || null,
                  },
                })
              : update({ ...pane, baseLayerId: e.target.value })
          }
        >
          {target === 'photo' && (
            <option value="">背景なし（線やハザードだけ）</option>
          )}
          {baseLayerDefinitions.map((l) => (
            <option key={l.id} value={l.id}>
              {l.titleJa}
            </option>
          ))}
        </select>
      </label>
      {target === 'photo' && (
        <>
          <label className="pm-range">
            逆投影の透過度 {Math.round((1 - project.inverse.opacity) * 100)}%
            <input
              aria-label="逆投影の透過度"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={1 - project.inverse.opacity}
              onChange={(e) =>
                onChange({
                  ...project,
                  inverse: {
                    ...project.inverse,
                    opacity: 1 - Number(e.target.value),
                  },
                })
              }
            />
          </label>
          <label className="pm-check">
            <input
              type="checkbox"
              checked={project.inverse.gis}
              onChange={(e) =>
                onChange({
                  ...project,
                  inverse: { ...project.inverse, gis: e.target.checked },
                })
              }
            />
            読込みGISを表示
          </label>
          <label className="pm-check">
            <input
              type="checkbox"
              checked={project.inverse.drawings}
              onChange={(e) =>
                onChange({
                  ...project,
                  inverse: { ...project.inverse, drawings: e.target.checked },
                })
              }
            />
            作図を表示
          </label>
        </>
      )}
      {overlayLayerDefinitions.map((layer) => (
        <div className="pm-layer-row" key={layer.id}>
          <label className="pm-check">
            <input
              type="checkbox"
              checked={selected.includes(layer.id)}
              onChange={(e) => {
                const ids = e.target.checked
                  ? [...selected, layer.id]
                  : selected.filter((id) => id !== layer.id);
                if (target === 'photo')
                  onChange({
                    ...project,
                    inverse: { ...project.inverse, overlayIds: ids },
                  });
                else update({ ...pane, overlayLayerIds: ids });
              }}
            />
            {layer.titleJa}
          </label>
          {selected.includes(layer.id) && target !== 'photo' && (
            <input
              aria-label={`${layer.titleJa}の透過度`}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={
                1 - (pane.opacityByLayerId[layer.id] ?? layer.defaultOpacity)
              }
              onChange={(e) =>
                update({
                  ...pane,
                  opacityByLayerId: {
                    ...pane.opacityByLayerId,
                    [layer.id]: 1 - Number(e.target.value),
                  },
                })
              }
            />
          )}
          <a href={layer.legendUrl} target="_blank" rel="noreferrer">
            出典・凡例 ↗
          </a>
        </div>
      ))}
      {target !== 'photo' && pane.baseLayerId === 'gsi-relief-custom' && (
        <fieldset>
          <legend>標高の配色範囲（m）</legend>
          {(['minimum', 'maximum'] as const).map((key) => (
            <label key={key}>
              {key === 'minimum' ? '下限' : '上限'}
              <input
                type="number"
                value={pane.elevationColorRange[key]}
                onChange={(e) => {
                  const n = e.target.valueAsNumber;
                  if (Number.isFinite(n)) {
                    const range = { ...pane.elevationColorRange, [key]: n };
                    if (range.minimum < range.maximum)
                      update({ ...pane, elevationColorRange: range });
                  }
                }}
              />
            </label>
          ))}
        </fieldset>
      )}
      <details>
        <summary>持込みGIS（全画面共通）</summary>
        <button onClick={onImport}>GeoJSON / KMLを追加</button>
        {project.gis.map((g) => (
          <div className="pm-layer-row" key={g.id}>
            <label className="pm-check">
              <input
                type="checkbox"
                checked={g.visible}
                onChange={(e) =>
                  onChange({
                    ...project,
                    gis: project.gis.map((v) =>
                      v.id === g.id ? { ...v, visible: e.target.checked } : v,
                    ),
                  })
                }
              />
              {g.name}
            </label>
            <button
              onClick={() =>
                onChange({
                  ...project,
                  gis: project.gis.filter((v) => v.id !== g.id),
                })
              }
            >
              削除
            </button>
          </div>
        ))}
      </details>
      <p className="pm-muted">
        河川の破線は一般化した位置追跡ガイドです。GCPには航空写真などで特定できる地点を使ってください。
      </p>
    </>
  );
}
export function PhotoAttributions({ project }: { project: Project }) {
  const ids = [
    ...(project.inverse.baseLayerId ? [project.inverse.baseLayerId] : []),
    ...project.inverse.overlayIds,
  ];
  const layers = ids.map((id) => layerById.get(id)!);
  return (
    <div className="pm-attribution">
      {layers.length ? (
        <>
          逆投影・加工：
          {[...new Set(layers.map((l) => l.attribution))].join(' / ')}{' '}
          <details>
            <summary>出典・凡例</summary>
            {layers.map((l) => (
              <a key={l.id} href={l.legendUrl} target="_blank" rel="noreferrer">
                {l.titleJa}
              </a>
            ))}
          </details>
        </>
      ) : (
        <>写真の元画素座標で編集</>
      )}
    </div>
  );
}
