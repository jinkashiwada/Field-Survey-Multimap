import { buildRiverObservationMapUrl, HYDROLOGICAL_DATABASE_MAP_URL } from '../../services/riverObservationLinks';

interface ObservationSitesPanelProps {
  open: boolean;
  longitude: number;
  latitude: number;
  zoom: number;
  onClose: () => void;
}

export function ObservationSitesPanel({ open, longitude, latitude, zoom, onClose }: ObservationSitesPanelProps) {
  if (!open) return null;
  const officialMapUrl = buildRiverObservationMapUrl(longitude, latitude, zoom);

  return (
    <aside className="data-drawer observation-sites-panel" aria-label="河川観測施設">
      <header>
        <h2>河川観測施設</h2>
        <button type="button" aria-label="河川観測施設を閉じる" onClick={onClose}>×</button>
      </header>
      <section>
        <h3>現在の表示範囲から探す</h3>
        <p>国土交通省「川の防災情報」を現在の地図中心付近で開きます。公式マップ上で、水位計、危機管理型水位計、河川監視カメラの位置を確認し、各マーカーから観測情報を開けます。</p>
        <a className="drawer-primary-link" href={officialMapUrl} target="_blank" rel="noreferrer">
          川の防災情報で観測施設を開く
        </a>
        <p className="drawer-note">リンクを開いた時だけ、現在表示中の中心座標とズームが国土交通省サイトへ渡ります。ピン、現在地、読み込んだGISデータは送りません。</p>
      </section>
      <section>
        <h3>過去の水位を調べる</h3>
        <p>観測所の過去データは、国土交通省「水文水質データベース」の観測所地図から検索できます。</p>
        <a href={HYDROLOGICAL_DATABASE_MAP_URL} target="_blank" rel="noreferrer">水文水質データベースの地図を開く</a>
      </section>
      <section>
        <h3>このアプリでの取り扱い</h3>
        <p>Version 0.1では、公開仕様のない通信を解析せず、観測施設の全国位置データやリアルタイム値をアプリ内へ取り込みません。公式サイトへの安全な案内だけを提供します。</p>
        <p><a href="https://www.river.go.jp/kawabou/kwb_apend/html/caution.html" target="_blank" rel="noreferrer">川の防災情報：取り扱い上の注意</a></p>
      </section>
    </aside>
  );
}
