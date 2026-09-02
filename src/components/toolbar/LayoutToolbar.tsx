import type { MapLayout } from '../../domain/layout';
import type { ViewportSize } from '../../utils/layout';
import { splitForViewport, supportsQuad } from '../../utils/layout';

interface LayoutToolbarProps {
  activeLayout: MapLayout;
  viewport: ViewportSize;
  onChange: (layout: MapLayout) => void;
}

export function LayoutToolbar({ activeLayout, viewport, onChange }: LayoutToolbarProps) {
  const twoPaneLayout = splitForViewport(viewport);
  return (
    <nav className="toolbar" aria-label="地図表示ツール">
      <div className="toolbar-group" aria-label="画面数">
        <button type="button" aria-pressed={activeLayout === 'single'} onClick={() => onChange('single')}>
          1画面
        </button>
        <button type="button" aria-pressed={activeLayout === twoPaneLayout} onClick={() => onChange(twoPaneLayout)}>
          2画面
        </button>
        <button
          type="button"
          aria-pressed={activeLayout === 'quad'}
          disabled={!supportsQuad(viewport)}
          title={supportsQuad(viewport) ? '4画面を表示' : '4画面には幅1024px・高さ700px以上が必要です'}
          onClick={() => onChange('quad')}
        >
          4画面
        </button>
      </div>
    </nav>
  );
}

