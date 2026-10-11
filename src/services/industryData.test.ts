// Estate candidate placement for site comparison: always a point of the estate inside the grid.
import { describe, expect, it } from 'vitest';
import { candidatePoint, pointInArea, type IndustrialArea } from './industryData';
import type { LonLat } from '../types';

const square = (w: number, s: number, e: number, n: number, centroid: LonLat): IndustrialArea =>
  ({
    code: 1,
    name: 'Test estate',
    centroid,
    bbox: { west: w, south: s, east: e, north: n },
    analysisArea: 'partial',
    geometry: { type: 'MultiPolygon', coordinates: [[[[w, s], [e, s], [e, n], [w, n], [w, s]]]] },
  }) as unknown as IndustrialArea;

const box = { west: 73.7, south: 18.4, east: 74.0, north: 18.7 };

describe('candidatePoint', () => {
  it('keeps the centroid when it lies inside the grid', () => {
    const a = square(73.8, 18.5, 73.9, 18.6, [73.85, 18.55]);
    expect(candidatePoint(a, box)).toEqual([73.85, 18.55]);
  });

  it('moves a partly covered estate to its in-grid part, nearest the centroid', () => {
    const a = square(73.95, 18.5, 74.15, 18.6, [74.05, 18.55]); // centroid east of the grid
    const p = candidatePoint(a, box)!;
    expect(p[0]).toBeLessThanOrEqual(box.east);
    expect(p[0]).toBeGreaterThan(73.99); // the strip next to the grid edge
    expect(pointInArea(p, a)).toBe(true);
  });

  it('returns null when no part of the estate is inside the grid', () => {
    expect(candidatePoint(square(74.1, 18.5, 74.2, 18.6, [74.15, 18.55]), box)).toBeNull();
  });
});
