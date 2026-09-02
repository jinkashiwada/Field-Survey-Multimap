import type { FeatureLike } from 'ol/Feature';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';

const pinColors: Record<string, string> = {
  'trace-candidate': '#ed7d20',
  'needs-review': '#ffd43b',
  danger: '#d7191c',
  memo: '#1f78b4',
};

export function pinStyle(feature: FeatureLike): Style {
  const color = pinColors[String(feature.get('pinType'))] ?? '#1f78b4';
  return new Style({
    image: new CircleStyle({ radius: 8, fill: new Fill({ color }), stroke: new Stroke({ color: '#fff', width: 3 }) }),
  });
}

const riverLineStyle = new Style({ stroke: new Stroke({ color: '#0878be', width: 3 }) });
const polygonStyle = new Style({
  fill: new Fill({ color: 'rgba(8, 120, 190, 0.18)' }),
  stroke: new Stroke({ color: '#075b91', width: 2 }),
});
const pointStyle = new Style({
  image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#25a7d9' }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
});

export function gisStyle(feature: FeatureLike): Style {
  const type = feature.getGeometry()?.getType() ?? '';
  if (type.includes('LineString')) return riverLineStyle;
  if (type.includes('Polygon')) return polygonStyle;
  return pointStyle;
}

export function featureDisplayName(feature: FeatureLike): string | null {
  for (const key of ['name', 'riverName', '河川名']) {
    const value: unknown = feature.get(key);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

