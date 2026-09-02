import { baseLayerDefinitions, layerById, overlayLayerDefinitions } from '../../config/layers';
import type { PaneLayerState } from '../../domain/layers';

interface PaneLayerControlsProps {
  index: number;
  config: PaneLayerState;
  onBaseChange: (id: string) => void;
  onOverlayToggle: (id: string) => void;
  onOpacityChange: (id: string, opacity: number) => void;
}

export function PaneLayerControls({ index, config, onBaseChange, onOverlayToggle, onOpacityChange }: PaneLayerControlsProps) {
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
        <fieldset>
          <legend>重畳レイヤー</legend>
          {overlayLayerDefinitions.map((layer) => (
            <label className="overlay-option" key={layer.id}>
              <input
                type="checkbox"
                checked={config.overlayLayerIds.includes(layer.id)}
                onChange={() => onOverlayToggle(layer.id)}
              />
              <span>{layer.titleJa}</span>
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

