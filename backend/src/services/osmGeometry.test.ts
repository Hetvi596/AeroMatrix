import { describe, expect, it } from 'vitest';
import { chainWays, processOverpass } from './osmGeometry';
import { getDemoBaseState } from '../data/demo/demoDataProvider';
import type { LonLat } from '../types';

// Synthetic Overpass-shaped fixture (tiny, hand-made) — tests processing logic only.
const way = (id: number, tags: Record<string, string>, coords: LonLat[]) => ({
  type: 'way' as const,
  id,
  tags,
  geometry: coords.map(([lon, lat]) => ({ lon, lat })),
});

const square = (x: number, y: number, d: number): LonLat[] => [
  [x, y],
  [x + d, y],
  [x + d, y + d],
  [x, y + d],
  [x, y],
];

describe('chainWays', () => {
  it('joins split ways that share endpoints, in either direction', () => {
    const out = chainWays([
      [[0, 0], [1, 0]],
      [[2, 0], [1, 0]], // reversed
      [[2, 0], [3, 0]],
      [[10, 10], [11, 10]], // separate
    ]);
    expect(out).toHaveLength(2);
    const long = out.find((p) => p.length === 4)!;
    expect([long[0], long[3]].map((p) => p[0]).sort()).toEqual([0, 3]);
  });
});

describe('processOverpass', () => {
  const json = {
    elements: [
      way(1, { highway: 'trunk', name: 'Katraj-Kondhwa Road' }, [[73.85, 18.46], [73.86, 18.47]]),
      way(2, { highway: 'trunk', name: 'Katraj-Kondhwa Road' }, [[73.86, 18.47], [73.87, 18.48]]),
      way(3, { highway: 'trunk', name: 'Katraj Kondhwa Road' }, [[73.88, 18.46], [73.89, 18.47]]), // slug collision
      way(4, { highway: 'secondary' }, [[73.80, 18.50], [73.81, 18.51]]),
      way(5, { leisure: 'park', name: 'Big Park' }, square(73.82, 18.52, 0.005)),
      way(6, { leisure: 'park' }, square(73.83, 18.53, 0.0002)), // too small → dropped
      way(7, { landuse: 'industrial', name: 'Test Estate' }, square(73.93, 18.50, 0.01)),
    ],
  };
  const geo = processOverpass(json);

  it('groups ways by name, keeps ids unique, and assigns demo volumes by class', () => {
    const ids = geo.roads.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const katraj = geo.roads.find((r) => r.name === 'Katraj-Kondhwa Road')!;
    expect(katraj.paths).toHaveLength(1); // two ways chained
    expect(katraj.volume).toBeGreaterThan(geo.roads.find((r) => r.roadClass === 'secondary')!.volume);
  });

  it('filters tiny green polygons and turns industrial zones into sources', () => {
    expect(geo.greenAreas.map((g) => g.name)).toEqual(['Big Park']);
    expect(geo.industrialAreas).toHaveLength(1);
    expect(geo.industries).toHaveLength(1);
    expect(geo.industries[0].status).toBe('DEMO');
  });

  it('builds a grid from OSM geometry with bounded traffic', () => {
    const base = getDemoBaseState(10, geo);
    expect(base.geometrySource).toBe('osm');
    for (const c of base.cells) {
      const corridor = Object.values(c.trafficByRoad).reduce((a, b) => a + b, 0);
      expect(corridor + c.localTraffic).toBeLessThanOrEqual(100.0001);
    }
    expect(base.cells.some((c) => Object.keys(c.trafficByRoad).length > 0)).toBe(true);
    expect(base.cells.some((c) => c.landUse === 'Industrial')).toBe(true);
  });
});
