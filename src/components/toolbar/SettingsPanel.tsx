import { layerRegistry } from '../../config/layers';

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <aside className="data-drawer" aria-label="設定とデータ出典">
      <header><h2>設定・出典</h2><button type="button" aria-label="設定を閉じる" onClick={onClose}>×</button></header>
      <section>
        <h3>プライバシー</h3>
        <p>通常の表示URLにはピン、現在地マーカー、読み込んだKML・GeoJSONを含めません。「このピンを共有」を選んだ場合だけ、選択ピンの情報をURLへ含めます。共有メモは任意です。URLを知る人は内容を読めます。保存したピンはこのブラウザーのlocalStorageへ保存します。</p>
      </section>
      <section>
        <h3>内蔵レイヤーの出典</h3>
        <ul className="source-list">
          {layerRegistry.map((layer) => (
            <li key={layer.id}><strong>{layer.titleJa}</strong> — {layer.attribution} <a href={layer.sourcePageUrl} target="_blank" rel="noreferrer">公式情報</a></li>
          ))}
        </ul>
      </section>
      <section>
        <h3>重要な注意</h3>
        <p>本ツールは公式の避難判断や安全判断を代替しません。外部データの最新性・完全性は保証されません。</p>
      </section>
    </aside>
  );
}
