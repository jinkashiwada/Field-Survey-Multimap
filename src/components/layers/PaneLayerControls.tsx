import { useState } from 'react';
import { baseLayerDefinitions, layerById, overlayLayerDefinitions } from '../../config/layers';
import type { ElevationColorRange, PaneLayerState } from '../../domain/layers';

interface PaneLayerControlsProps {
  index: number;
  config: PaneLayerState;
  onBaseChange: (id: string) => void;
  onOverlayToggle: (id: string) => void;
  onOpacityChange: (id: string, opacity: number) => void;
  onElevationRangeChange: (range: ElevationColorRange) => void;
}

export function PaneLayerControls({ index, config, onBaseChange, onOverlayToggle, onOpacityChange, onElevationRangeChange }: PaneLayerControlsProps) {
  const [minimumDraft, setMinimumDraft] = useState<string | null>(null);
  const [maximumDraft, setMaximumDraft] = useState<string | null>(null);
  const minimum = minimumDraft ?? String(config.elevationColorRange.minimum);
  const maximum = maximumDraft ?? String(config.elevationColorRange.maximum);
  const activeDefinitions = [config.baseLayerId, ...config.overlayLayerIds]
    .map((id) => layerById.get(id))
    .filter((definition) => definition !== undefined);

  return (
    <details className="layer-controls">
      <summary aria-label={`画面${index + 1}のレイヤー設定`}>レイヤー</summary>
      <div className="layer-controls-panel">
        <label>
          <span>背景地図</span>
          <select value={config.baseLayerId} onChange={(event) => onBaseChange(event.target.value)}>
            {baseLayerDefinitions.map((layer) => <option key={layer.id} value={layer.id}>{layer.titleJa}</option>)}
          </select>
        </label>
        {config.baseLayerId === 'gsi-relief-custom' && (
          <section className="elevation-range-control" aria-label="標高配色レンジ">
            <strong>標高配色レンジ</strong>
            <div className="range-inputs">
              <label>最低（m）<input type="number" step="0.5" value={minimum} onChange={(event) => setMinimumDraft(event.target.value)} /></label>
              <label>最高（m）<input type="number" step="0.5" value={maximum} onChange={(event) => setMaximumDraft(event.target.value)} /></label>
            </div>
            <div className="compact-actions">
              <button type="button" onClick={() => {
                const next = { minimum: Number(minimum), maximum: Number(maximum) };
                if (Number.isFinite(next.minimum) && Number.isFinite(next.maximum) && next.maximum > next.minimum) {
                  onElevationRangeChange(next);
                  setMinimumDraft(null);
                  setMaximumDraft(null);
                }
              }}>適用</button>
            </div>
            <p>再配色は新しい256pxタイルの受信時とレンジ変更時だけ行います。地図上のクイック操作では、手動またはmoveend後の自動設定で16地点だけを標本抽出します。</p>
            <div className="elevation-ramp" aria-label={`${config.elevationColorRange.minimum}メートルから${config.elevationColorRange.maximum}メートルの凡例`} />
            <small>{config.elevationColorRange.minimum} m / {config.elevationColorRange.maximum} m</small>
          </section>
        )}
        <fieldset>
          <legend>重畳レイヤー</legend>
          {overlayLayerDefinitions.map((layer) => (
            <label className="overlay-option" key={layer.id}>
              <input
                type="checkbox"
                checked={config.overlayLayerIds.includes(layer.id)}
                onChange={() => onOverlayToggle(layer.id)}
              />
              <span>{layer.titleJa}{layer.stability === 'experimental' ? ' ⚗' : ''}</span>
            </label>
          ))}
        </fieldset>
        <div className="opacity-list">
          {activeDefinitions.map((layer) => (
            <label key={layer.id}>
              <span>{layer.titleJa}：{Math.round((config.opacityByLayerId[layer.id] ?? layer.defaultOpacity) * 100)}%</span>
              <input
                type="range" min="0" max="1" step="0.05"
                value={config.opacityByLayerId[layer.id] ?? layer.defaultOpacity}
                aria-label={`${layer.titleJa}の透明度`}
                onChange={(event) => onOpacityChange(layer.id, Number(event.target.value))}
              />
            </label>
          ))}
        </div>
        <div className="layer-links">
          {activeDefinitions.map((layer) => (
            <div key={layer.id}>
              <strong>{layer.titleJa}</strong>
              <p>{layer.description}</p>
              <a href={layer.legendUrl} target="_blank" rel="noreferrer">凡例</a>{' '}
              <a href={layer.sourcePageUrl} target="_blank" rel="noreferrer">レイヤー詳細</a>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
