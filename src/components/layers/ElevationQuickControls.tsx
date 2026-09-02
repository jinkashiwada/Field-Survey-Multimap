interface ElevationQuickControlsProps {
  paneNumber: number;
  minimum: number;
  maximum: number;
  automatic: boolean;
  loading: boolean;
  onEstimate: () => void;
  onAutomaticChange: (enabled: boolean) => void;
}

export function ElevationQuickControls({ paneNumber, minimum, maximum, automatic, loading, onEstimate, onAutomaticChange }: ElevationQuickControlsProps) {
  return (
    <section className="elevation-quick-controls" aria-label={`画面${paneNumber}の標高配色クイック操作`}>
      <button type="button" disabled={loading} onClick={onEstimate}>
        {loading ? '標高レンジ推定中…' : '表示範囲から配色レンジを推定'}
      </button>
      <label>
        <input
          type="checkbox"
          checked={automatic}
          onChange={(event) => onAutomaticChange(event.target.checked)}
        />
        <span>移動後に自動推定</span>
      </label>
      <small>{minimum}～{maximum} m</small>
    </section>
  );
}
