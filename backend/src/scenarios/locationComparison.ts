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
  const maxOf = (f: (r: LocationAssessment) => number) => Math.max(1e-6, ...valid.map(f));
  const mExp = maxOf((r) => r.exposedPopulation);
  const mMax = maxOf((r) => r.maxDelta);
  const mMean = maxOf((r) => r.meanDelta);
  for (const r of valid) {
    r.riskScore =
      100 *
      (0.35 * (r.exposedPopulation / mExp) +
        0.25 * (r.maxDelta / mMax) +
        0.15 * (r.meanDelta / mMean) +
        0.15 * (r.hostGreenCover / 100) +
        0.1 * r.hostBuildingDensity);
  }
  return rows;
}
