import type View from 'ol/View';
import { toLonLat } from 'ol/proj';
import type { ElevationColorRange } from '../../domain/layers';
import { demPriority, fetchElevationFromDem } from './dem';

const SAMPLE_GRID_SIZE = 4;

function percentile(sorted: number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
  return sorted[index]!;
}

function roundedRange(low: number, high: number): ElevationColorRange {
  const rawSpan = Math.max(2, high - low);
  const padding = rawSpan * 0.08;
  const step = rawSpan <= 10 ? 0.5 : rawSpan <= 50 ? 1 : rawSpan <= 200 ? 5 : 10;
  const minimum = Math.floor((low - padding) / step) * step;
  const maximum = Math.ceil((high + padding) / step) * step;
  return maximum > minimum ? { minimum, maximum } : { minimum, maximum: minimum + step };
}

/**
 * DEM10Bの16地点だけを、手動操作時またはmoveend後の自動設定時に標本抽出する。
 */
export async function estimateVisibleElevationRange(
  view: View,
  signal: AbortSignal,
  viewportSize: readonly [number, number] = [window.innerWidth, window.innerHeight],
): Promise<ElevationColorRange | null> {
  const extent = view.calculateExtent([
    Math.min(viewportSize[0], 1_200),
    Math.min(viewportSize[1], 800),
  ]);
  const dem10b = demPriority.find((dem) => dem.id === 'dem10b');
  if (!dem10b) return null;
  const [minimumX, minimumY, maximumX, maximumY] = extent as [number, number, number, number];
  const requests: Promise<number | null>[] = [];
  for (let row = 0; row < SAMPLE_GRID_SIZE; row += 1) {
    for (let column = 0; column < SAMPLE_GRID_SIZE; column += 1) {
      const x = minimumX + (maximumX - minimumX) * ((column + 0.5) / SAMPLE_GRID_SIZE);
      const y = minimumY + (maximumY - minimumY) * ((row + 0.5) / SAMPLE_GRID_SIZE);
      const [longitude, latitude] = toLonLat([x, y]);
      requests.push(
        fetchElevationFromDem(dem10b, longitude!, latitude!, signal)
          .then((result) => result?.elevation ?? null)
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === 'AbortError') throw error;
            return null;
          }),
      );
    }
  }
  const values = (await Promise.all(requests))
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((left, right) => left - right);
  if (values.length < 4) return null;
  return roundedRange(percentile(values, 0.06), percentile(values, 0.94));
}
