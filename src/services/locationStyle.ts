import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import type { FeatureLike } from 'ol/Feature';

const accuracyStyle = new Style({
  fill: new Fill({ color: 'rgba(0, 119, 190, 0.13)' }),
  stroke: new Stroke({ color: 'rgba(0, 92, 153, 0.8)', width: 2 }),
});
const positionStyle = new Style({
  image: new CircleStyle({
    radius: 7,
    fill: new Fill({ color: '#0878be' }),
    stroke: new Stroke({ color: '#fff', width: 3 }),
  }),
});

export function locationStyle(feature: FeatureLike): Style {
  return feature.get('kind') === 'accuracy' ? accuracyStyle : positionStyle;
}
