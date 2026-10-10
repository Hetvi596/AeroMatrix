import type { GridCell } from '../types';
import { PUNE_LOCALITIES } from '../data/geojson/puneLocalities';
import { bboxContains, haversineKm } from './geo';

const cache = new WeakMap<GridCell[], Map<string, string>>();

/**
 * Human-readable place name for each zone: the Pune locality whose (approximate)
 * centre lies inside the cell, nearest the cell centre. Zones without one get none.
 */
export function zonePlaceNames(cells: GridCell[]): Map<string, string> {
  const hit = cache.get(cells);
  if (hit) return hit;
  const names = new Map<string, string>();
  for (const c of cells) {
    let best: { name: string; d: number } | null = null;
    for (const l of PUNE_LOCALITIES) {
      if (!bboxContains(c.bounds, l.location)) continue;
      const d = haversineKm(l.location, c.center);
      if (!best || d < best.d) best = { name: l.name, d };
    }
    if (best) names.set(c.id, best.name);
  }
  cache.set(cells, names);
  return names;
}
