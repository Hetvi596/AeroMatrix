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
