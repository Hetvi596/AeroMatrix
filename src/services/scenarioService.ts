// ScenarioService — the UI only talks to this interface.
// Today: DemoScenarioService wraps the deterministic prototype rule model.
// Later: an ML-backed implementation (e.g. a FastAPI endpoint serving a trained
// model) can implement the same interface without any UI changes.

import type {
  BaseState,
  CellState,
  Industry,
  IndustryCategory,
  LonLat,
  Pollutant,
  ScenarioParams,
  ScenarioResult,
} from '../types';
import { uid } from '../utils/format';
import { haversineKm } from '../utils/geo';
import { MODEL_ID, MODEL_VERSION, POLLUTANTS, computeCellStates, meanContribution } from './pollutionModel';

export const AFFECTED_THRESHOLD = 0.5; // µg/m³ PM2.5

export interface ScenarioService {
  readonly id: string;
  readonly label: string;
  run(base: BaseState, params: ScenarioParams): ScenarioResult;
  baseline(base: BaseState): CellState[];
}

export function defaultParams(base: BaseState): ScenarioParams {
  return {
    name: 'Baseline',
    targetCells: [],
    trafficMultiplier: 1,
    areaTrafficMultiplier: 1,
    vehicleEmissionControl: 0,
    publicTransportShift: 0,
    roadClosures: [],
    addedIndustries: [],
    removedIndustryIds: [],
    industryIntensityOverrides: {},
    industrialControl: 0,
    greenCoverDelta: 0,
    greenBuffer: false,
    buildingDensityDelta: 0,
    buildingHeightMultiplier: 1,
    weather: { ...base.weather },
  };
}

export function validateParams(p: ScenarioParams): string[] {
  const errors: string[] = [];
  const range = (v: number, lo: number, hi: number, label: string) => {
    if (!Number.isFinite(v) || v < lo || v > hi) errors.push(`${label} must be between ${lo} and ${hi}`);
  };
  range(p.trafficMultiplier, 0, 3, 'City traffic multiplier');
  range(p.areaTrafficMultiplier, 0, 3, 'Area traffic multiplier');
  range(p.vehicleEmissionControl, 0, 0.9, 'Vehicle emission control');
  range(p.publicTransportShift, 0, 0.6, 'Public transport shift');
  range(p.industrialControl, 0, 0.95, 'Industrial control');
  range(p.greenCoverDelta, -60, 60, 'Green cover change');
  range(p.buildingDensityDelta, -0.6, 0.6, 'Building density change');
  range(p.buildingHeightMultiplier, 0.2, 5, 'Building height multiplier');
  range(p.weather.windSpeed, 0, 25, 'Wind speed');
  range(p.weather.windDirection, 0, 360, 'Wind direction');
  range(p.weather.rainfall, 0, 300, 'Rainfall');
  range(p.weather.temperature, -5, 50, 'Temperature');
  range(p.weather.humidity, 0, 100, 'Humidity');
  range(p.weather.pressure, 900, 1100, 'Pressure');
  for (const ind of p.addedIndustries) range(ind.emissionIntensity, 0, 100, `${ind.name} intensity`);
  return errors;
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/**
 * runScenario(baseState, scenarioParameters) → { baseline, scenario, delta, affectedZones, sourceContribution, metadata }
 * The single entry point the UI uses. Pure & deterministic.
 */
export function runScenario(base: BaseState, params: ScenarioParams): ScenarioResult {
  const baseline = computeCellStates(base, defaultParams(base));
  const scenario = computeCellStates(base, params);

  const delta: ScenarioResult['delta'] = {};
  const affectedZones: string[] = [];
  let maxIncrease = 0;
  let maxDecrease = 0;
  let exposedPopulation = 0;
  const popById = new Map(base.cells.map((c) => [c.id, c.population]));

  scenario.forEach((s, i) => {
    const b = baseline[i];
    const d = {} as Record<Pollutant, number>;
    for (const p of POLLUTANTS) d[p] = s[p] - b[p];
    delta[s.cellId] = d;
    if (Math.abs(d.pm25) >= AFFECTED_THRESHOLD) {
      affectedZones.push(s.cellId);
      if (d.pm25 > 0) exposedPopulation += popById.get(s.cellId) ?? 0;
    }
    maxIncrease = Math.max(maxIncrease, d.pm25);
    maxDecrease = Math.min(maxDecrease, d.pm25);
  });

  const meanBaseline = mean(baseline.map((s) => s.pm25));
  const meanScenario = mean(scenario.map((s) => s.pm25));
  const highRisk = (xs: CellState[]) => xs.filter((s) => s.risk === 'HIGH' || s.risk === 'VERY_HIGH').length;

  return {
    id: uid('SCN'),
    params,
    baseline,
    scenario,
    delta,
    affectedZones,
    sourceContribution: { baseline: meanContribution(baseline), scenario: meanContribution(scenario) },
    summary: {
      meanBaseline,
      meanScenario,
      meanDelta: meanScenario - meanBaseline,
      meanDeltaPct: meanBaseline ? ((meanScenario - meanBaseline) / meanBaseline) * 100 : 0,
      maxIncrease,
      maxDecrease,
      affectedCount: affectedZones.length,
      exposedPopulation,
      highRiskBaseline: highRisk(baseline),
      highRiskScenario: highRisk(scenario),
    },
    metadata: {
      status: 'MODELED_SCENARIO',
      engine: MODEL_ID,
      engineVersion: MODEL_VERSION,
      createdAt: new Date().toISOString(),
      disclaimer:
        'Prototype modeled estimate from an uncalibrated rule-based model on DEMO inputs. Not an observation or validated prediction.',
    },
  };
}

export const demoScenarioService: ScenarioService = {
  id: MODEL_ID,
  label: 'Prototype rule-based model (uncalibrated)',
  run: runScenario,
  baseline: (base) => computeCellStates(base, defaultParams(base)),
};

/** Active implementation — swap here for an ML-backed service later. */
export const scenarioService: ScenarioService = demoScenarioService;

// ---------------------------------------------------------------------------
// Industry factory (used by the simulator and location comparison)
// ---------------------------------------------------------------------------

const CATEGORY_DEFAULTS: Record<IndustryCategory, { pollutants: Pollutant[]; profile: string; control: number }> = {
  Manufacturing: { pollutants: ['pm25', 'no2'], profile: 'General manufacturing; boilers + DG sets', control: 0.4 },
  Chemical: { pollutants: ['so2', 'no2', 'pm25'], profile: 'Chemical process + combustion', control: 0.45 },
  Power: { pollutants: ['so2', 'no2', 'pm25'], profile: 'Thermal / captive power generation', control: 0.5 },
  Metal: { pollutants: ['pm10', 'pm25', 'so2'], profile: 'Foundry / furnace operations', control: 0.3 },
  Processing: { pollutants: ['pm25', 'pm10'], profile: 'Material processing; biomass boilers', control: 0.35 },
};

export function makeScenarioIndustry(
  location: LonLat,
  category: IndustryCategory,
  intensity: number,
  controlEfficiency?: number,
  name?: string,
): Industry {
  const d = CATEGORY_DEFAULTS[category];
  return {
    id: uid('NEW'),
    name: name ?? `Proposed ${category} Unit`,
    category,
    location,
    emissionIntensity: intensity,
    controlEfficiency: controlEfficiency ?? d.control,
    mainPollutants: d.pollutants,
    emissionProfile: `${d.profile} (scenario)`,
    status: 'MODELED_SCENARIO',
    scenarioAdded: true,
  };
}

export function cellAt(base: BaseState, p: LonLat) {
  return base.cells.find(
    (c) => p[0] >= c.bounds.west && p[0] < c.bounds.east && p[1] >= c.bounds.south && p[1] < c.bounds.north,
  );
}

export function nearestIndustryKm(base: BaseState, p: LonLat): number {
  return base.industries.reduce((m, i) => Math.min(m, haversineKm(i.location, p)), Infinity);
}
