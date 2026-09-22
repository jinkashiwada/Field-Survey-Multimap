import { useRef } from 'react';

export function ShareFallbackDialog({ open, url, onClose }: { open: boolean; url: string; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title">
        <h2 id="share-dialog-title">表示URL</h2>
        <p>自動コピーできませんでした。次のURLをコピーしてください。</p>
        <input
          ref={(element) => { inputRef.current = element; window.setTimeout(() => element?.select(), 0); }}
          readOnly
          value={url}
          aria-label="共有する表示URL"
          onFocus={(event) => event.currentTarget.select()}
        />
        <button type="button" onClick={onClose}>閉じる</button>
      </section>
    </div>
  );
}
