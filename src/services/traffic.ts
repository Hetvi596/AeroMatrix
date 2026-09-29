import type { BaseState, CellState, LonLat, Road } from '../types';

/** Contribution-weighted mean traffic intensity of the cells a road feeds (0-100). */
export function roadTrafficLevel(road: Road, base: BaseState, stateById: Map<string, CellState>): number {
  let w = 0;
  let sum = 0;
  for (const c of base.cells) {
    const contrib = c.trafficByRoad[road.id];
    if (!contrib) continue;
    const s = stateById.get(c.id);
    if (!s) continue;
    w += contrib;
    sum += contrib * s.trafficIntensity;
  }
  return w > 0 ? sum / w : road.volume * 0.6;
}

export function trafficLevelLabel(v: number): { label: string; color: string } {
  if (v < 40) return { label: 'LOW', color: '#22c55e' };
  if (v < 60) return { label: 'MEDIUM', color: '#facc15' };
  if (v < 80) return { label: 'HIGH', color: '#f97316' };
  return { label: 'VERY HIGH', color: '#ef4444' };
}

const RANK: Record<string, number> = { motorway: 0, trunk: 1, primary: 2, secondary: 3 };

/** Named, significant roads for lists and dropdowns (all roads for the small demo set). */
export function majorRoads(base: BaseState, limit = 60): Road[] {
  if (base.geometrySource === 'demo') return base.roads;
  return base.roads
    .filter((r) => !r.name.startsWith('Unnamed') && (r.lengthKm ?? 0) >= 1)
    .sort((a, b) => (RANK[a.roadClass ?? ''] ?? 9) - (RANK[b.roadClass ?? ''] ?? 9) || (b.lengthKm ?? 0) - (a.lengthKm ?? 0))
    .slice(0, limit);
}

/** A representative point on a road (middle of its longest part). */
export function roadMidpoint(road: Road): LonLat {
  const longest = road.paths.reduce((a, b) => (b.length > a.length ? b : a), road.paths[0]);
  return longest[Math.floor(longest.length / 2)];
}
