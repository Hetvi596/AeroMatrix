// Plain-language target and reason for each reduction action, derived from the
// baseline the scenario engine already computed — no new modelling here.

import type { BaseState, CellState, LonLat, ScenarioParams, SourceContribution } from '../types';
import { roadMidpoint } from '../services/traffic';

export interface ActionInsight {
  target: string;
  reason: string;
  /** Where "Show on map" should look; null keeps the current camera. */
  focus: { lonlat: LonLat; range: number } | null;
}

const total = (c: SourceContribution) => c.traffic + c.industry + c.background + c.other;

function sourceShare(states: CellState[], key: keyof SourceContribution): number {
  const all = states.reduce((a, s) => a + total(s.contributionAbs), 0);
  return all > 0 ? (states.reduce((a, s) => a + s.contributionAbs[key], 0) / all) * 100 : 0;
}

function centroid(points: LonLat[]): LonLat | null {
  if (!points.length) return null;
  return [points.reduce((a, p) => a + p[0], 0) / points.length, points.reduce((a, p) => a + p[1], 0) / points.length];
}

const pct = (v: number) => `${Math.round(v)}%`;

export function explainAction(actionId: string, base: BaseState, baseline: CellState[], params: ScenarioParams): ActionInsight {
  const inTarget = new Set(params.targetCells);
  const targetStates = baseline.filter((s) => inTarget.has(s.cellId));
  const targetCentre = centroid(base.cells.filter((c) => inTarget.has(c.id)).map((c) => c.center));
  const zones = `${params.targetCells.length} urban-core and residential zones`;

  switch (actionId) {
    case 'traffic-restriction':
      return {
        target: zones,
        reason: `Traffic makes up ${pct(sourceShare(targetStates, 'traffic'))} of modeled PM2.5 in these zones.`,
        focus: targetCentre && { lonlat: targetCentre, range: 16000 },
      };
    case 'industrial-control': {
      const c = centroid(base.industries.map((i) => i.location));
      return {
        target: `All ${base.industries.length} industrial sources`,
        reason: `Industry makes up ${pct(sourceShare(baseline, 'industry'))} of modeled PM2.5 across the city.`,
        focus: c && { lonlat: c, range: 20000 },
      };
    }
    case 'green-expansion': {
      const mean = (xs: CellState[]) => (xs.length ? xs.reduce((a, s) => a + s.greenCover, 0) / xs.length : 0);
      return {
        target: zones,
        reason: `These zones average ${pct(mean(targetStates))} green cover, against ${pct(mean(baseline))} city-wide.`,
        focus: targetCentre && { lonlat: targetCentre, range: 16000 },
      };
    }
    case 'road-diversion': {
      const closure = params.roadClosures[0];
      const from = closure && base.roads.find((r) => r.id === closure.roadId);
      const to = closure?.divertToRoadId ? base.roads.find((r) => r.id === closure.divertToRoadId) : undefined;
      if (!from) return { target: 'No suitable road pair', reason: 'Needs two major roads of similar class near each other.', focus: null };
      return {
        target: to ? `${from.name}, diverted to ${to.name}` : from.name,
        reason: `${from.name} carries the highest modeled traffic load of the major roads.`,
        focus: { lonlat: roadMidpoint(from), range: 9000 },
      };
    }
    case 'industrial-relocation': {
      const ind = base.industries.find((i) => i.id === params.removedIndustryIds[0]);
      if (!ind) return { target: 'No source selected', reason: '', focus: null };
      return {
        target: `${ind.name} (${ind.id})`,
        reason: `Highest emission intensity of all modeled sources (${ind.emissionIntensity}/100).`,
        focus: { lonlat: ind.location, range: 7000 },
      };
    }
    case 'public-transport':
      return {
        target: 'City-wide vehicle fleet',
        reason: `Traffic makes up ${pct(sourceShare(baseline, 'traffic'))} of modeled PM2.5 across the city.`,
        focus: null,
      };
    default:
      return { target: 'Analysis area', reason: '', focus: null };
  }
}
