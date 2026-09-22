import { pinTypeLabels } from '../../domain/pins';
import type { SharedPin } from '../../services/pinShare';

export function SharedPinBanner({ pin, error, onSave, onDismiss, onFocus }: {
  pin: SharedPin | null; error: string | null; onSave: () => void; onDismiss: () => void; onFocus: () => void;
}) {
  if (!pin && !error) return null;
  return (
    <section className="shared-pin-banner" aria-label="受け取った共有ピン">
      {pin ? <>
        <strong>共有ピン：{pin.name}（{pinTypeLabels[pin.type]}）</strong>
        <span>一時表示・未保存</span>
        <details><summary>ピンの詳細</summary>
          <p>{pin.latitude.toFixed(6)}, {pin.longitude.toFixed(6)} / 標高：{pin.elevation ?? '未取得'}{pin.elevation !== null ? ' m' : ''} {pin.elevationSource}</p>
          <p className="pin-share-preview">{pin.memo || 'メモなし'}</p>
        </details>
        <button type="button" onClick={onFocus}>ピンへ戻る</button>
        <button type="button" onClick={onSave}>自分のピンに保存</button>
      </> : <span role="alert">{error}</span>}
      <button type="button" onClick={onDismiss}>共有ピンを閉じる</button>
    </section>
  );
}
