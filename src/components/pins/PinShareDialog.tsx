import { useEffect, useRef, useState } from 'react';
import { pinTypeLabels, type PinRecord } from '../../domain/pins';
import type { UrlMapState } from '../../domain/urlState';
import { buildCompactPinShareUrl } from '../../services/pinShare';
import { copyText } from '../../services/clipboard';

export function PinShareDialog({ pin, map, onClose }: { pin: PinRecord; map: UrlMapState; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [includeMemo, setIncludeMemo] = useState(false);
  const [message, setMessage] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  useEffect(() => {
    let active = true;
    void buildCompactPinShareUrl(window.location.href, map, pin, includeMemo)
      .then((value) => { if (active) setUrl(value); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '共有URLを作成できませんでした。');
      });
    return () => { active = false; };
  }, [includeMemo, map, pin]);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  return (
    <dialog ref={dialogRef} className="share-dialog pin-share-dialog" aria-labelledby="pin-share-title" onCancel={onClose}>
      <h2 id="pin-share-title">このピンを共有</h2>
      <p><strong>{pin.name}</strong>（{pinTypeLabels[pin.type]}）</p>
      <p>{pin.latitude.toFixed(6)}, {pin.longitude.toFixed(6)} / 標高：{pin.elevation ?? '未取得'}{pin.elevation !== null ? ' m' : ''}</p>
      <p>このピンを中心に、現在の画面数・レイヤー・配色・ズームで開く、QRコードにも使いやすい圧縮URLです。</p>
      <label className="pin-share-memo"><input type="checkbox" checked={includeMemo} onChange={(event) => { setIncludeMemo(event.target.checked); setUrl(''); setError(''); setMessage(''); }} />メモを含める</label>
      {includeMemo && <p className="pin-share-preview">{pin.memo || '（メモなし）'}</p>}
      <p className="drawer-note">URLを知る人はピン情報を読めます。個人情報や非公開の調査情報が含まれていないか確認してください。共有後にピンを編集・削除しても、渡したURLの内容は変わりません。</p>
      {local && <p role="note">このURLはローカル開発用です。他の人へ渡す場合は、公開サイト上で作成してください。</p>}
      {error ? <p role="alert">{error}</p> : <input aria-label="ピン付き共有URL" readOnly value={url} placeholder="URLを生成中…" onFocus={(event) => event.currentTarget.select()} />}
      {url && <small>
        URL長：{url.length}文字。{url.length <= 1_800
          ? '一般的なQRコード作成サービスで扱いやすい長さです。'
          : 'QRコードには長すぎる場合があります。メモを外すか、KML・GeoJSONをご利用ください。'}
        外部の短縮サービスは使用していません。
      </small>}
      <div className="form-actions">
        <button type="button" disabled={!url} onClick={() => {
          void copyText(url).then((copied) => setMessage(copied ? 'ピン付きURLをコピーしました。' : '自動コピーできませんでした。URL欄を選択してコピーしてください。'));
        }}>ピン付きURLをコピー</button>
        <button type="button" onClick={onClose}>閉じる</button>
      </div>
      <p role="status">{message}</p>
    </dialog>
  );
}
