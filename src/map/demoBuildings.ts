// Procedural demo building massing used by the committed (Sep 29) map engine.
// Restored verbatim from the original demo data provider, which no longer exports it.

import type { LonLat } from '../types';
import { buildGrid } from '../data/demo/demoDataProvider';
import { DEMO_GREEN_AREAS } from '../data/geojson/puneDemoGeometry';
import { pointInPolygon } from '../utils/geo';
import { hashSeed, mulberry32 } from '../utils/prng';

export interface DemoBuilding {
  id: string;
  position: LonLat;
  width: number; // m
  depth: number; // m
  height: number; // m
  rotation: number; // radians
}

export function getDemoBuildings(): DemoBuilding[] {
  const cells = buildGrid(20); // finer sampling for building placement
  const out: DemoBuilding[] = [];
  for (const cell of cells) {
    if (cell.buildingDensity < 0.3) continue;
    const rng = mulberry32(hashSeed(`bld-${cell.id}`));
    const n = Math.round(cell.buildingDensity * 9);
    for (let i = 0; i < n; i++) {
      const p: LonLat = [
        cell.bounds.west + rng() * (cell.bounds.east - cell.bounds.west),
        cell.bounds.south + rng() * (cell.bounds.north - cell.bounds.south),
      ];
      if (DEMO_GREEN_AREAS.some((g) => pointInPolygon(p, g.polygon))) continue;
      const tall = rng() < 0.18;
      out.push({
        id: `B-${cell.id}-${i}`,
        position: p,
        width: 50 + rng() * 90,
        depth: 40 + rng() * 70,
        height: cell.avgBuildingHeight * (0.5 + rng() * 1.1) * (tall ? 2.4 : 1),
        rotation: rng() * Math.PI,
      });
    }
  }
  return out;
}
