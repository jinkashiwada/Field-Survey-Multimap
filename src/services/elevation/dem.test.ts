import { describe, expect, it } from 'vitest';
import { calculateTilePixel, decodeElevationRgb } from './dem';

describe('GSI DEM RGB decoding', () => {
  it('decodes positive elevations', () => {
    expect(decodeElevationRgb(0, 48, 57)).toBe(123.45);
  });

  it('decodes negative elevations and the no-data marker', () => {
    expect(decodeElevationRgb(255, 255, 206)).toBe(-0.5);
    expect(decodeElevationRgb(128, 0, 0)).toBeNull();
  });
});

describe('Web Mercator DEM tile calculation', () => {
  it('calculates the origin tile and pixel at longitude/latitude zero', () => {
    expect(calculateTilePixel(0, 0, 1)).toEqual({ tileX: 1, tileY: 1, pixelX: 0, pixelY: 0, zoom: 1 });
  });

  it('keeps edge coordinates inside a 256 pixel tile', () => {
    const coordinate = calculateTilePixel(180, 90, 5);
    expect(coordinate.tileX).toBe(31);
    expect(coordinate.tileY).toBe(0);
    expect(coordinate.pixelX).toBeGreaterThanOrEqual(0);
    expect(coordinate.pixelX).toBeLessThan(256);
    expect(coordinate.pixelY).toBeGreaterThanOrEqual(0);
    expect(coordinate.pixelY).toBeLessThan(256);
  });
});

