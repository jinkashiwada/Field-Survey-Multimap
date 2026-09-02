import type { CenterStatus } from '../../domain/location';

export function CenterStatusBar({ status }: { status: CenterStatus }) {
  const elevation = status.elevationState === 'loading'
    ? '取得中…'
    : status.elevationState === 'available' && status.elevation !== null
      ? `${status.elevation.toFixed(2)} m`
      : '取得不可';
  return (
    <footer className="center-status" aria-label="地図中心地点情報">
      <dl>
        <div><dt>緯度</dt><dd>{status.latitude.toFixed(6)}</dd></div>
        <div><dt>経度</dt><dd>{status.longitude.toFixed(6)}</dd></div>
        <div><dt>ズーム</dt><dd>{status.zoom.toFixed(2)}</dd></div>
        <div><dt>標高</dt><dd>{elevation}</dd></div>
        <div><dt>DEM</dt><dd>{status.elevationSource ?? '—'}</dd></div>
      </dl>
      <p>標高は地形の概況確認用であり、現地測量値ではありません。</p>
    </footer>
  );
}

