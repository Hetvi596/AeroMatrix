// Candidate-site comparison for a proposed industry / project.
// Demo scoring rules only — designed to be replaced by a trained geospatial/ML model.

import type { BaseState, CandidateLocation, IndustryCategory, ScenarioParams, ScenarioResult } from '../types';
import { cellAt, defaultParams, makeScenarioIndustry, nearestIndustryKm, scenarioService } from '../services/scenarioService';

export interface LocationAssessment {
  candidate: CandidateLocation;
  hostCellId: string | null;
  result: ScenarioResult | null;
  meanDelta: number;
  maxDelta: number;
  affectedZones: number;
  exposedPopulation: number;
  hostTraffic: number;
  hostGreenCover: number;
  hostBuildingDensity: number;
  nearestIndustryKm: number;
  riskScore: number; // 0-100, lower is better
  outOfArea: boolean;
}

export function assessLocations(
  base: BaseState,
  candidates: CandidateLocation[],
  category: IndustryCategory,
  intensity: number,
  extra?: Partial<ScenarioParams>,
): LocationAssessment[] {
  const baseline = scenarioService.baseline(base);
  const rows = candidates.map((candidate): LocationAssessment => {
    const cell = cellAt(base, candidate.location);
    if (!cell) {
      return {
        candidate, hostCellId: null, result: null, meanDelta: 0, maxDelta: 0, affectedZones: 0,
        exposedPopulation: 0, hostTraffic: 0, hostGreenCover: 0, hostBuildingDensity: 0,
        nearestIndustryKm: nearestIndustryKm(base, candidate.location), riskScore: 100, outOfArea: true,
      };
    }
    const ind = makeScenarioIndustry(candidate.location, category, intensity, undefined, `Candidate ${candidate.id}`);
    const params: ScenarioParams = {
      ...defaultParams(base),
      ...extra,
      name: `Site ${candidate.id}`,
      addedIndustries: [ind],
    };
    const result = scenarioService.run(base, params);
    const hostState = baseline.find((s) => s.cellId === cell.id)!;
    return {
      candidate,
      hostCellId: cell.id,
      result,
      meanDelta: result.summary.meanDelta,
      maxDelta: result.summary.maxIncrease,
      affectedZones: result.summary.affectedCount,
      exposedPopulation: result.summary.exposedPopulation,
      hostTraffic: hostState.trafficIntensity,
      hostGreenCover: cell.greenCover,
      hostBuildingDensity: cell.buildingDensity,
      nearestIndustryKm: nearestIndustryKm(base, candidate.location),
      riskScore: 0,
      outOfArea: false,
    };
  });

  // Normalised composite risk score (demo weights).
  const valid = rows.filter((r) => !r.outOfArea);
  for (const r of valid) r.riskScore = scoreBreakdown(r, valid).reduce((a, c) => a + c.points, 0);
  return rows;
}

/** Demo weights of the composite environmental-risk score (sum = 1). */
export const SCORE_WEIGHTS = [
  { key: 'exposedPopulation', label: 'Population in worsened zones', weight: 0.35 },
  { key: 'maxDelta', label: 'Max local Δ PM2.5', weight: 0.25 },
  { key: 'meanDelta', label: 'Δ mean PM2.5', weight: 0.15 },
  { key: 'hostGreenCover', label: 'Green cover at the site', weight: 0.15 },
  { key: 'hostBuildingDensity', label: 'Building density at the site', weight: 0.1 },
] as const;

/** Points each factor contributes to a candidate's 0–100 risk score (normalised across `valid`). */
export function scoreBreakdown(r: LocationAssessment, valid: LocationAssessment[]): { key: string; label: string; weight: number; points: number }[] {
  const maxOf = (f: (x: LocationAssessment) => number) => Math.max(1e-6, ...valid.map(f));
  const share: Record<(typeof SCORE_WEIGHTS)[number]['key'], number> = {
    exposedPopulation: r.exposedPopulation / maxOf((x) => x.exposedPopulation),
    maxDelta: r.maxDelta / maxOf((x) => x.maxDelta),
    meanDelta: r.meanDelta / maxOf((x) => x.meanDelta),
    hostGreenCover: r.hostGreenCover / 100,
    hostBuildingDensity: r.hostBuildingDensity,
  };
  return SCORE_WEIGHTS.map((w) => ({ key: w.key, label: w.label, weight: w.weight, points: 100 * w.weight * share[w.key] }));
}

// ------------------------------------------------------------------ site comparison

export interface ComparisonCriterion {
  key: string;
  label: string;
  /** Share of the risk score, or null for context-only rows. */
  weight: number | null;
  lowerIsBetter: boolean;
  values: (number | null)[];
  format: (v: number) => string;
}

export interface SiteComparison {
  /** Assessable sites, best (lowest risk score) first. */
  sites: LocationAssessment[];
  criteria: ComparisonCriterion[];
  preferred: string | null;
  summary: string;
  advantages: string[];
  disadvantages: string[];
  unavailable: string[];
}

const f1 = (v: number) => v.toFixed(1);
const f0 = (v: number) => Math.round(v).toLocaleString('en-IN');

/** Phrases for "better" / "worse", given the preferred site's value and another site's. */
const PHRASE: Record<string, { good: string; bad: string }> = {
  exposedPopulation: { good: 'fewer people live in the zones it would worsen', bad: 'more people live in the zones it would worsen' },
  maxDelta: { good: 'its worst local PM2.5 increase is smaller', bad: 'its worst local PM2.5 increase is larger' },
  meanDelta: { good: 'it raises city-wide PM2.5 less', bad: 'it raises city-wide PM2.5 more' },
  hostGreenCover: { good: 'it would build over less green cover', bad: 'it would build over more green cover' },
  hostBuildingDensity: { good: 'the site is less densely built up', bad: 'the site is more densely built up' },
};

/**
 * Side-by-side comparison of candidate sites from their computed assessments. The ranking
 * is the existing risk score; explanations are generated from the sites' own values.
 * `currentPm25` (model data at each site's zone, or null) is shown as context only.
 */
export function compareSites(rows: LocationAssessment[], currentPm25: Record<string, number | null> = {}): SiteComparison {
  const valid = rows.filter((r) => !r.outOfArea).sort((a, b) => a.riskScore - b.riskScore);
  const unavailable = rows.filter((r) => r.outOfArea).map((r) => `Site ${r.candidate.id} is outside the analysis area, so it isn’t scored.`);
  const v = (f: (r: LocationAssessment) => number | null) => valid.map(f);
  const criteria: ComparisonCriterion[] = [
    { key: 'riskScore', label: 'Risk score (0–100)', weight: null, lowerIsBetter: true, values: v((r) => r.riskScore), format: f0 },
    ...SCORE_WEIGHTS.map((w) => ({
      key: w.key,
      label: { exposedPopulation: 'People in worsened zones', maxDelta: 'Worst local PM2.5 rise (µg/m³)', meanDelta: 'City mean PM2.5 rise (µg/m³)', hostGreenCover: 'Green cover at the site (%)', hostBuildingDensity: 'Building density at the site (%)' }[w.key],
      weight: w.weight,
      lowerIsBetter: true,
      values: v((r) => (w.key === 'hostBuildingDensity' ? r.hostBuildingDensity * 100 : r[w.key])),
      format: w.key === 'exposedPopulation' || w.key === 'hostGreenCover' || w.key === 'hostBuildingDensity' ? f0 : (x: number) => (w.key === 'meanDelta' ? x.toFixed(2) : f1(x)),
    })),
    { key: 'currentPm25', label: 'Current PM2.5 at the site (µg/m³)', weight: null, lowerIsBetter: true, values: v((r) => currentPm25[r.candidate.id] ?? null), format: f1 },
    { key: 'hostTraffic', label: 'Traffic at the site (0–100)', weight: null, lowerIsBetter: true, values: v((r) => r.hostTraffic), format: f0 },
    { key: 'nearestIndustryKm', label: 'Nearest existing industry (km)', weight: null, lowerIsBetter: false, values: v((r) => r.nearestIndustryKm), format: f1 },
  ];
  if (valid.some((r) => currentPm25[r.candidate.id] == null)) unavailable.push('Current PM2.5 isn’t available for every site, so it is shown for context only.');

  if (valid.length < 2) {
    return {
      sites: valid,
      criteria,
      preferred: valid[0]?.candidate.id ?? null,
      summary: valid.length ? 'Add another site inside the analysis area to compare.' : 'No site can be assessed yet.',
      advantages: [],
      disadvantages: [],
      unavailable,
    };
  }

  const best = valid[0];
  const scored = criteria.filter((c) => c.weight != null);
  const advantages: { text: string; weight: number }[] = [];
  const disadvantages: string[] = [];
  for (const c of scored) {
    const mine = c.values[0]!;
    const others = c.values.slice(1).filter((x): x is number => x != null);
    const worseThan = valid.slice(1).filter((_, i) => c.values[i + 1] != null && (c.lowerIsBetter ? c.values[i + 1]! < mine - 1e-9 : c.values[i + 1]! > mine + 1e-9));
    // Differences that vanish when rounded for display aren't claimed either way.
    const differs = (x: number) => c.format(x) !== c.format(mine);
    if (others.every((o) => (c.lowerIsBetter ? mine <= o + 1e-9 : mine >= o - 1e-9)) && others.some(differs)) {
      const next = c.lowerIsBetter ? Math.min(...others) : Math.max(...others);
      if (differs(next)) advantages.push({ text: `${PHRASE[c.key].good} (${c.format(mine)} vs ${c.format(next)})`, weight: c.weight! });
    } else {
      const o = worseThan.find((x) => differs(c.values[valid.indexOf(x)]!));
      if (o) disadvantages.push(`${PHRASE[c.key].bad} than Site ${o.candidate.id} (${c.format(mine)} vs ${c.format(c.values[valid.indexOf(o)]!)})`);
    }
  }
  advantages.sort((a, b) => b.weight - a.weight);
  const runnerUp = valid[1];
  const lead = advantages.slice(0, 2).map((a) => a.text.replace(/ \(.*\)$/, ''));
  const summary =
    `Site ${best.candidate.id} ranks first with a risk score of ${f0(best.riskScore)}, against ${f0(runnerUp.riskScore)} for Site ${runnerUp.candidate.id}` +
    (lead.length ? `, mainly because ${lead.join(' and ')}.` : '.');
  return { sites: valid, criteria, preferred: best.candidate.id, summary, advantages: advantages.map((a) => a.text), disadvantages, unavailable };
}
