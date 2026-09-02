interface GisPanelProps {
  open: boolean;
  count: number;
  canFit: boolean;
  onClose: () => void;
  onChooseFile: () => void;
  onFit: () => void;
  onClear: () => void;
  onDrop: (files: FileList) => void;
}

export function GisPanel({ open, count, canFit, onClose, onChooseFile, onFit, onClear, onDrop }: GisPanelProps) {
  if (!open) return null;
  return (
    <aside className="data-drawer" aria-label="GISファイル管理">
      <header><h2>KML・GeoJSON</h2><button type="button" aria-label="GISファイル管理を閉じる" onClick={onClose}>×</button></header>
      <div
        className="drop-zone"
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
        onDrop={(event) => { event.preventDefault(); onDrop(event.dataTransfer.files); }}
      >
        <p>KMLまたはGeoJSONをここへドロップ</p>
        <button type="button" onClick={onChooseFile}>ファイルを選択</button>
        <small>EPSG:4326、最大20 MB・50,000地物。KMZは対象外です。</small>
      </div>
      <p role="status">読み込み済み：{count}地物</p>
      <div className="form-actions">
        <button type="button" disabled={!canFit} onClick={onFit}>全地物へ移動</button>
        <button type="button" disabled={count === 0} onClick={() => {
          if (window.confirm('読み込んだGIS地物をすべて取り除きますか？')) onClear();
        }}>地物をクリア</button>
      </div>
      <p className="drawer-note">河川等の線データは青色で表示します。属性の name、riverName、河川名を地図上で選択すると名称を表示します。</p>
    </aside>
  );
}

