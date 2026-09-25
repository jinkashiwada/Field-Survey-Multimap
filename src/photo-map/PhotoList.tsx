import { useRef, useState } from 'react';
import type { ImagePool } from './media';
import { hasDraft, type Photo } from './model';
import { PhotoThumbnail } from './Panels';

const DRAG_TYPE = 'application/x-photo-map-layer';
export function PhotoBatchControls({
  photos,
  onVisibility,
  onTransparency,
}: {
  photos: Photo[];
  onVisibility: (pane: 0 | 1, visible: boolean) => void;
  onTransparency: (transparency: number) => void;
}) {
  const values = photos.flatMap((photo) => photo.opacity.map((v) => 1 - v));
  const transparency = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
  const mixed = values.some((value) => Math.abs(value - transparency) > 0.005);
  return (
    <section className="pm-photo-batch" aria-label="写真の一括表示設定">
      {([0, 1] as const).map((pane) => (
        <div className="pm-photo-batch-row" key={pane}>
          <strong>地図{pane === 0 ? 'A' : 'B'}</strong>
          <button
            disabled={!photos.length || photos.every((photo) => photo.visible[pane])}
            onClick={() => onVisibility(pane, true)}
            aria-label={`地図${pane === 0 ? 'A' : 'B'}の写真をすべてオン`}
          >
            すべてオン
          </button>
          <button
            disabled={!photos.length || photos.every((photo) => !photo.visible[pane])}
            onClick={() => onVisibility(pane, false)}
            aria-label={`地図${pane === 0 ? 'A' : 'B'}の写真をすべてオフ`}
          >
            すべてオフ
          </button>
        </div>
      ))}
      <label className="pm-photo-batch-opacity">
        <span>全写真の透過度 {mixed ? '個別設定あり' : `${Math.round(transparency * 100)}%`}</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={transparency}
          disabled={!photos.length}
          aria-label="全写真の透過度を一括変更"
          onChange={(e) => onTransparency(Number(e.target.value))}
        />
      </label>
    </section>
  );
}
export function PhotoList({
  photos,
  activeId,
  pool,
  onSelect,
  onChange,
  onReorder,
}: {
  photos: Photo[];
  activeId: string | null;
  pool: ImagePool;
  onSelect: (id: string) => void;
  onChange: (photo: Photo) => void;
  onReorder: (photos: Photo[]) => void;
}) {
  // Render order is back-to-front; the layer list shows the front layer first.
  const frontFirst = [...photos].reverse();
  const dragged = useRef<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const move = (id: string, target: string, after: boolean) => {
    if (id === target) return;
    const photo = photos.find((p) => p.id === id);
    if (!photo) return;
    const next = frontFirst.filter((p) => p.id !== id);
    const index = next.findIndex((p) => p.id === target);
    if (index < 0) return;
    next.splice(index + (after ? 1 : 0), 0, photo);
    onReorder(next.reverse());
  };
  return (
    <div className="pm-photo-list" aria-label="写真の重なり順">
      {frontFirst.map((photo, index) => (
        <article
          key={photo.id}
          data-photo-id={photo.id}
          aria-label={photo.name}
          className={`pm-photo-card ${photo.registration ? hasDraft(photo) ? 'is-draft' : 'is-registered' : 'is-unregistered'} ${photo.id === activeId ? 'is-selected' : ''} ${drop?.id === photo.id ? (drop.after ? 'pm-drop-after' : 'pm-drop-before') : ''}`}
          onDragOver={(e) => {
            if (!dragged.current || !e.dataTransfer.types.includes(DRAG_TYPE))
              return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            setDrop({
              id: photo.id,
              after:
                e.clientY >
                e.currentTarget.getBoundingClientRect().top +
                  e.currentTarget.clientHeight / 2,
            });
          }}
          onDrop={(e) => {
            if (!dragged.current) return;
            e.preventDefault();
            e.stopPropagation();
            const after =
              e.clientY >
              e.currentTarget.getBoundingClientRect().top +
                e.currentTarget.clientHeight / 2;
            move(dragged.current, photo.id, after);
            dragged.current = null;
            setDrop(null);
          }}
        >
          <div className="pm-photo-card-heading">
            <button
              className="pm-drag-handle"
              draggable
              aria-label={`${photo.name}の重なり順を変更`}
              title="ドラッグで並べ替え・上下キーでも移動できます"
              onDragStart={(e) => {
                dragged.current = photo.id;
                e.dataTransfer.setData(DRAG_TYPE, photo.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                dragged.current = null;
                setDrop(null);
              }}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                e.preventDefault();
                const target =
                  frontFirst[index + (e.key === 'ArrowUp' ? -1 : 1)];
                if (target) move(photo.id, target.id, e.key === 'ArrowDown');
              }}
            >
              ⠿
            </button>
            <button
              className="pm-photo-select"
              aria-label={`${photo.name}を編集`}
              aria-pressed={photo.id === activeId}
              onClick={() => onSelect(photo.id)}
            >
              <PhotoThumbnail photo={photo} pool={pool} />
              <span>
                <strong>{photo.name}</strong>
                <small className="pm-registration-badge">
                  {photo.registration
                    ? hasDraft(photo)
                      ? '未反映の変更'
                      : '位置合わせ済み'
                    : '未登録'}
                </small>
                <small>
                  {photo.capturedAt?.replace('T', ' ') || '撮影日時未入力'}
                </small>
              </span>
            </button>
          </div>
          <div className="pm-photo-visibility">
            {([0, 1] as const).map((i) => (
              <div className="pm-photo-map-control" key={i}>
                <label className="pm-check">
                  <input
                    type="checkbox"
                    aria-label={`${photo.name}を地図${i === 0 ? 'A' : 'B'}に表示`}
                    checked={photo.visible[i]}
                    onChange={(e) => {
                      const visible = [...photo.visible] as Photo['visible'];
                      visible[i] = e.target.checked;
                      onChange({ ...photo, visible });
                    }}
                  />
                  地図{i === 0 ? 'A' : 'B'}
                </label>
                <label className="pm-inline-opacity">
                  <span>透過 {Math.round((1 - photo.opacity[i]) * 100)}%</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    aria-label={`${photo.name}の地図${i === 0 ? 'A' : 'B'}の透過度`}
                    value={1 - photo.opacity[i]}
                    onChange={(e) => {
                      const opacity = [...photo.opacity] as Photo['opacity'];
                      opacity[i] = 1 - Number(e.target.value);
                      onChange({ ...photo, opacity });
                    }}
                  />
                </label>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
