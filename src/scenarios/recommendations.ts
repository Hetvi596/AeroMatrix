// Data-driven pollution-reduction recommendations for one target area.
//
// Inputs, all already in the app:
//   - the target zone (selected, or the worst hotspot) and its 3×3 neighbourhood
//   - the source mix the scenario engine attributes there (traffic / industry / other)
//   - nearby modelled industrial sources and the busiest roads through the zone
//   - dispersion (wind/weather) and, when loaded, the zone's current PM2.5 model data
//   - Plan-It's priced intervention items, for costs where they exist
// Each candidate is included only when the evidence supports it, then evaluated with the
// existing scenario engine (target-zone change, city change, and a range from ±r source
// strength). Effects are modelled estimates from the prototype engine, never outcomes.

import type { BaseState, CellState, GridCell, LonLat, Pollutant, ScenarioParams, ScenarioResult } from '../types';
import { defaultParams, makeScenarioIndustry, scenarioService } from '../services/scenarioService';
import { majorRoads, roadMidpoint } from '../services/traffic';
import { haversineKm } from '../utils/geo';
import { DEFAULT_ASSUMPTIONS, eligibleSources, industryOption, trafficOption, treeOption, type InterventionOption, type PlanTarget } from '../plan/costModel';
import { scaleSources } from './actionStability';
import { POLLUTANT_LABEL } from '../utils/colors';

export type ActionKind = 'traffic' | 'industry' | 'green' | 'diversion' | 'relocation' | 'transit';
export type Timeframe = 'Weeks' | 'Months' | 'Years';

export interface Recommendation {
  id: ActionKind;
  name: string;
  target: string;
  /** What is changed, in plain words. */
  measure: string;
  reasons: string[];
  timeframe: Timeframe;
  /** Modelled change in the target zone for the chosen pollutant, and its range under ±r source strength. */
  effect: { target: number; targetPct: number | null; low: number; high: number; city: number; zonesImproved: number };
  cost: { total: number; oneTime: number; recurring: number } | null;
  limitations: string[];
  focus: { lonlat: LonLat; range: number } | null;
  result: ScenarioResult;
}

export interface Excluded {
  name: string;
  reason: string;
}

export interface RecommendationSet {
  target: { cellId: string; label: string; value: number; shares: { traffic: number; industry: number; other: number } };
  pollutant: Pollutant;
  recommendations: Recommendation[];
  excluded: Excluded[];
  /** True when the first-ranked action is the same in every ±r case. */
  topStable: boolean;
  uncertainty: number;
}

export interface RecommendOptions {
  targetCellId?: string | null;
  pollutant?: Pollutant;
  /** Current PM2.5 model data at the target zone, µg/m³ (null when not loaded). */
  currentPm25?: number | null;
  /** Relative source-strength uncertainty for the effect range (e.g. from the trained model's interval). */
  uncertainty?: number;
  placeName?: (cellId: string) => string | undefined;
}

// Evidence thresholds: below these a source isn't a plausible target in this area.
export const MIN_TRAFFIC_SHARE = 0.15;
export const MIN_INDUSTRY_SHARE = 0.05;
export const MIN_CITY_TRAFFIC_SHARE = 0.25;
const SEVERE_PM25 = 90;

const pct = (v: number) => `${Math.round(v * 100)}%`;

function shares(states: CellState[]) {
  const sum = (k: 'traffic' | 'industry' | 'background' | 'other') => states.reduce((a, s) => a + s.contributionAbs[k], 0);
  const total = sum('traffic') + sum('industry') + sum('background') + sum('other');
  return total > 0
    ? { traffic: sum('traffic') / total, industry: sum('industry') / total, other: (sum('background') + sum('other')) / total }
    : { traffic: 0, industry: 0, other: 1 };
}

function neighbourhood(base: BaseState, cell: GridCell): GridCell[] {
  return base.cells.filter((c) => Math.abs(c.row - cell.row) <= 1 && Math.abs(c.col - cell.col) <= 1);
}

/** Worst zone for the pollutant in the given states. */
export function hotspot(states: CellState[], pollutant: Pollutant): CellState {
  return states.reduce((a, b) => (b[pollutant] > a[pollutant] ? b : a));
}

export function recommendActions(base: BaseState, baseline: CellState[], opts: RecommendOptions = {}): RecommendationSet {
  const pollutant = opts.pollutant ?? 'pm25';
  const r = Math.max(0.05, Math.min(0.6, opts.uncertainty ?? 0.25));
  const targetState = (opts.targetCellId && baseline.find((s) => s.cellId === opts.targetCellId)) || hotspot(baseline, pollutant);
  const cell = base.cells.find((c) => c.id === targetState.cellId)!;
  const place = opts.placeName?.(cell.id);
  const label = place ? `Zone ${cell.id} (${place})` : `Zone ${cell.id}`;
  const area = neighbourhood(base, cell);
  const areaIds = new Set(area.map((c) => c.id));
  const mix = shares(baseline.filter((s) => areaIds.has(s.cellId)));
  const cityMix = shares(baseline);
  const zoneTarget: PlanTarget = { id: cell.id, label, cells: [cell], cityWide: false };
  const a = DEFAULT_ASSUMPTIONS;
  const stagnant = targetState.windInfluence >= 1.3;
  const severe = opts.currentPm25 != null && opts.currentPm25 >= SEVERE_PM25;
  const dispersionReason = stagnant ? 'Weak winds today trap pollution here, so cutting emissions matters more than usual.' : null;

  type Candidate = Omit<Recommendation, 'effect' | 'result'> & { params: ScenarioParams };
  const candidates: Candidate[] = [];
  const excluded: Excluded[] = [];
  const add = (c: Omit<Recommendation, 'effect' | 'result'>, params: ScenarioParams) => candidates.push({ ...c, params });
  const priced = (o: InterventionOption) => ({ total: o.total, oneTime: o.oneTime, recurring: o.recurring });
  const zoneParams = (name: string, patch: Partial<ScenarioParams>): ScenarioParams => ({ ...defaultParams(base), targetCells: [cell.id], ...patch, name: `Action: ${name}` });

  // 1. Traffic enforcement zone in the hotspot.
  if (mix.traffic >= MIN_TRAFFIC_SHARE) {
    const o = trafficOption(zoneTarget, 'intensive', a);
    add(
      {
        id: 'traffic',
        name: 'Traffic enforcement zone',
        target: label,
        measure: `Cut vehicle traffic in the zone by ${pct(a.trafficReduction.intensive)} (cameras and wardens)`,
        reasons: [`Traffic is about ${pct(mix.traffic)} of modelled PM2.5 around this zone.`, ...(dispersionReason ? [dispersionReason] : [])],
        timeframe: 'Weeks',
        cost: priced(o),
        limitations: ['Traffic may shift to nearby roads.'],
        focus: { lonlat: cell.center, range: 7000 },
      },
      zoneParams('Traffic enforcement zone', o.patch),
    );
  } else excluded.push({ name: 'Traffic enforcement zone', reason: `traffic is only about ${pct(mix.traffic)} of PM2.5 here` });

  // 2. Bag filters on the nearest industrial sources.
  const sources = eligibleSources(base, zoneTarget);
  if (sources.length && mix.industry >= MIN_INDUSTRY_SHARE) {
    const k = Math.min(2, sources.length);
    const o = industryOption(sources, k, a);
    add(
      {
        id: 'industry',
        name: 'Industrial emission control',
        target: sources.slice(0, k).map((s) => s.name).join(', '),
        measure: `Fit bag filters to ${k} source${k > 1 ? 's' : ''} in or within 2 km of the zone`,
        reasons: [`Industry is about ${pct(mix.industry)} of modelled PM2.5 around this zone.`, `${sources.length} modelled source${sources.length > 1 ? 's lie' : ' lies'} within 2 km.`, ...(dispersionReason ? [dispersionReason] : [])],
        timeframe: 'Months',
        cost: priced(o),
        limitations: ['Sources and intensities are illustrative, not a verified registry.'],
        focus: { lonlat: sources[0].location, range: 6000 },
      },
      zoneParams('Industrial emission control', o.patch),
    );
  } else excluded.push({ name: 'Industrial emission control', reason: sources.length ? `industry is only about ${pct(mix.industry)} of PM2.5 here` : 'no modelled industrial source within 2 km' });

  // 3. Tree planting (long term).
  {
    const o = treeOption(zoneTarget, 1000, a);
    add(
      {
        id: 'green',
        name: 'Tree planting',
        target: label,
        measure: `Plant 1,000 trees (about ${Math.round(((1000 * a.treeCanopyM2) / 1e4) * 10) / 10} ha of mature canopy)`,
        reasons: [`Green cover here is ${Math.round(cell.greenCover)}%, against ${Math.round(base.cells.reduce((s, c) => s + c.greenCover, 0) / base.cells.length)}% city-wide.`],
        timeframe: 'Years',
        cost: priced(o),
        limitations: [severe ? 'Takes years to grow: not a fix for today’s high pollution.' : 'Benefit grows as trees mature.'],
        focus: { lonlat: cell.center, range: 7000 },
      },
      zoneParams('Tree planting', o.patch),
    );
  }

  // 4. Divert the busiest road through the zone.
  const roads = majorRoads(base, 40);
  const busiest = roads.filter((rd) => (cell.trafficByRoad[rd.id] ?? 0) > 0).sort((x, y) => (cell.trafficByRoad[y.id] ?? 0) - (cell.trafficByRoad[x.id] ?? 0))[0];
  const alt = busiest && roads.filter((rd) => rd.id !== busiest.id && rd.volume >= busiest.volume * 0.6 && !(cell.trafficByRoad[rd.id] > 0)).sort((x, y) => haversineKm(roadMidpoint(x), roadMidpoint(busiest)) - haversineKm(roadMidpoint(y), roadMidpoint(busiest)))[0];
  if (busiest && alt && mix.traffic >= MIN_TRAFFIC_SHARE) {
    add(
      {
        id: 'diversion',
        name: 'Road traffic diversion',
        target: busiest.name,
        measure: `Divert 70% of ${busiest.name} traffic to ${alt.name}`,
        reasons: [`${busiest.name} carries the most modelled traffic through this zone.`],
        timeframe: 'Weeks',
        cost: null,
        limitations: [`Raises pollution along ${alt.name}.`],
        focus: { lonlat: roadMidpoint(busiest), range: 8000 },
      },
      { ...defaultParams(base), name: 'Action: Road traffic diversion', roadClosures: [{ roadId: busiest.id, divertToRoadId: alt.id, diversionShare: 0.7 }] },
    );
  } else excluded.push({ name: 'Road traffic diversion', reason: !busiest || !alt ? 'no suitable major road pair through this zone' : 'traffic is a small share here' });

  // 5. Relocate the strongest nearby source.
  const near = base.industries.filter((i) => haversineKm(i.location, cell.center) <= 3).sort((x, y) => y.emissionIntensity - x.emissionIntensity)[0];
  if (near && mix.industry >= 0.1) {
    add(
      {
        id: 'relocation',
        name: 'Industrial relocation',
        target: near.name,
        measure: `Move ${near.name} to the south-east periphery`,
        reasons: [`Strongest modelled source within 3 km (intensity ${near.emissionIntensity}/100).`],
        timeframe: 'Years',
        cost: null,
        limitations: ['Moves the emissions elsewhere rather than removing them.'],
        focus: { lonlat: near.location, range: 7000 },
      },
      {
        ...defaultParams(base),
        name: 'Action: Industrial relocation',
        removedIndustryIds: [near.id],
        addedIndustries: [makeScenarioIndustry([73.972, 18.448], near.category, near.emissionIntensity, near.controlEfficiency, `${near.name} (relocated)`)],
      },
    );
  } else excluded.push({ name: 'Industrial relocation', reason: near ? 'industry is a small share here' : 'no modelled source within 3 km' });

  // 6. City-wide public transport.
  if (cityMix.traffic >= MIN_CITY_TRAFFIC_SHARE) {
    add(
      {
        id: 'transit',
        name: 'Public transport improvement',
        target: 'City-wide',
        measure: '15% of trips move to buses and metro; 10% cleaner bus fleet',
        reasons: [`Traffic is about ${pct(cityMix.traffic)} of modelled PM2.5 across the city.`],
        timeframe: 'Years',
        cost: null,
        limitations: ['Depends on service expansion and uptake.'],
        focus: null,
      },
      { ...defaultParams(base), name: 'Action: Public transport', publicTransportShift: 0.15, vehicleEmissionControl: 0.1 },
    );
  } else excluded.push({ name: 'Public transport improvement', reason: `traffic is only about ${pct(cityMix.traffic)} of PM2.5 city-wide` });

  // Evaluate: central estimate plus lower/upper source strength.
  const variants = [scaleSources(base, 1 - r, 1 - r), scaleSources(base, 1 + r, 1 + r)];
  const zoneDelta = (res: ScenarioResult) => res.delta[cell.id]?.[pollutant] ?? 0;
  const evaluated: Recommendation[] = candidates.map(({ params, ...c }) => {
    const result = scenarioService.run(base, params);
    const d = zoneDelta(result);
    const range = variants.map((v) => zoneDelta(scenarioService.run(v, params)));
    const b = result.baseline.find((s) => s.cellId === cell.id)?.[pollutant] ?? 0;
    return {
      ...c,
      effect: {
        target: d,
        targetPct: b > 0 ? (d / b) * 100 : null,
        low: Math.min(d, ...range),
        high: Math.max(d, ...range),
        city: result.summary.meanDelta,
        zonesImproved: Object.values(result.delta).filter((x) => x.pm25 <= -0.5).length,
      },
      result,
    };
  });

  // Keep actions that reduce the pollutant in the target; rank by that reduction, then cost.
  const useful = evaluated.filter((e) => e.effect.target < -0.005);
  for (const e of evaluated.filter((x) => x.effect.target >= -0.005)) excluded.push({ name: e.name, reason: `no modelled ${POLLUTANT_LABEL[pollutant]} reduction in this zone` });
  useful.sort((x, y) => x.effect.target - y.effect.target || (x.cost?.total ?? Infinity) - (y.cost?.total ?? Infinity));

  // Is the first place robust to the source-strength uncertainty?
  const rankIn = (vi: number) =>
    [...useful].sort((x, y) => {
      const dx = zoneDelta(scenarioService.run(variants[vi], x.result.params));
      const dy = zoneDelta(scenarioService.run(variants[vi], y.result.params));
      return dx - dy;
    })[0]?.id;
  const topStable = useful.length < 2 || [0, 1].every((vi) => rankIn(vi) === useful[0].id);

  return {
    target: { cellId: cell.id, label, value: targetState[pollutant], shares: mix },
    pollutant,
    recommendations: useful,
    excluded,
    topStable,
    uncertainty: r,
  };
}
