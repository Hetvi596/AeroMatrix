// ============================================================================
// PROTOTYPE POLLUTION MODEL — deterministic, rule-based, NOT calibrated.
//
// A transparent screening-level relationship between urban parameters and
// pollutant concentrations, used only to make the what-if engine interactive.
// Coefficients are illustrative. Replace with a trained, validated model
// (see PredictionService / ScenarioService) once CPCB + ERA5 + traffic data exist.
// ============================================================================

import type { BaseState, CellState, Industry, Pollutant, ScenarioParams, SourceContribution } from '../types';
import { riskFromPm25 } from '../utils/colors';
import { haversineKm, offsetKm } from '../utils/geo';

export const MODEL_ID = 'prototype-rule-model';
export const MODEL_VERSION = '0.1.0-demo';

/** Illustrative coefficients — kept together so they are easy to audit / calibrate. */
export const COEF = {
  trafficPmAtFull: 42, // µg/m³ PM2.5 at traffic index 100
  industryPmAtFull: 62, // µg/m³ at source-adjacent, intensity 100, zero control
  plumeLengthKm: 2.0,
  regionalBackground: 26,
  dustBase: 6,
  dustPerDensity: 8,
  greenPerPoint: 0.004, // fractional PM reduction per % green cover
  greenBufferBoostPts: 8,
  greenBufferEmissionFactor: 0.85,
  greenBufferRadiusKm: 2.0,
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function effectiveIndustries(base: BaseState, params: ScenarioParams): Industry[] {
  const removed = new Set(params.removedIndustryIds);
  const list = base.industries
    .filter((i) => !removed.has(i.id))
    .map((i) =>
      params.industryIntensityOverrides[i.id] !== undefined
        ? { ...i, emissionIntensity: params.industryIntensityOverrides[i.id] }
        : i,
    );
  return [...list, ...params.addedIndustries.filter((i) => !removed.has(i.id))];
}

/** Meteorological dispersion multiplier (>1 = worse dispersion). */
export function meteoFactor(w: ScenarioParams['weather']): number {
  const disp = clamp(1.45 / (0.55 + 0.38 * w.windSpeed), 0.55, 1.7);
  const washout = Math.exp(-0.05 * w.rainfall);
  const humid = 1 + 0.004 * (w.humidity - 55);
  const temp = clamp(1 - 0.012 * (w.temperature - 27), 0.8, 1.2);
  const pressure = 1 + 0.004 * (w.pressure - 1010);
  return disp * washout * humid * temp * pressure;
}

/** Wind-aware dispersion kernel from a point source to a receptor. */
function plumeKernel(src: [number, number], rcp: [number, number], w: ScenarioParams['weather']): number {
  const d = Math.max(0.35, haversineKm(src, rcp));
  const [ex, ny] = offsetKm(src, rcp);
  const toRad = Math.PI / 180;
  // Direction the wind blows TOWARDS (meteorological "from" + 180°), as unit vector (east, north).
  const toDir = (w.windDirection + 180) * toRad;
  const ux = Math.sin(toDir);
  const uy = Math.cos(toDir);
  const cos = (ex * ux + ny * uy) / Math.hypot(ex, ny);
  const ws = Math.min(w.windSpeed, 6) / 6;
  const length = COEF.plumeLengthKm * (1 + 0.8 * Math.max(0, cos) * (w.windSpeed / 3));
  const directional = cos > 0 ? 1 + 1.1 * cos * ws : Math.max(0.35, 1 + 0.7 * cos * ws);
  return Math.exp(-d / length) * directional;
}

export function computeCellStates(base: BaseState, params: ScenarioParams): CellState[] {
  const w = params.weather;
  const meteo = meteoFactor(w);
  const bgFactor = 0.5 + 0.5 * meteo;
  const targetSet = params.targetCells.length ? new Set(params.targetCells) : null;
  const industries = effectiveIndustries(base, params);
  const addedIds = new Set(params.addedIndustries.map((i) => i.id));

  // Road closures & diversions → per-road multipliers.
  const roadFactor: Record<string, number> = {};
  const localSpill: Record<string, number> = {};
  for (const c of params.roadClosures) {
    roadFactor[c.roadId] = 0;
    const closedTotal = base.cells.reduce((s, cell) => s + (cell.trafficByRoad[c.roadId] ?? 0), 0);
    if (c.divertToRoadId) {
      const divTotal = base.cells.reduce((s, cell) => s + (cell.trafficByRoad[c.divertToRoadId!] ?? 0), 0);
      if (divTotal > 0) {
        roadFactor[c.divertToRoadId] = (roadFactor[c.divertToRoadId] ?? 1) + (c.diversionShare * closedTotal) / divTotal;
      }
    }
    // Traffic not diverted to the named road spills partially onto local streets.
    const spillShare = c.divertToRoadId ? (1 - c.diversionShare) * 0.4 : 0.4;
    for (const cell of base.cells) {
      const v = cell.trafficByRoad[c.roadId];
      if (v) localSpill[cell.id] = (localSpill[cell.id] ?? 0) + v * spillShare;
    }
  }

  return base.cells.map((cell) => {
    const inArea = targetSet ? targetSet.has(cell.id) : true;
    const inTarget = targetSet ? targetSet.has(cell.id) : false;

    // --- Traffic ---
    let corridor = 0;
    for (const [roadId, v] of Object.entries(cell.trafficByRoad)) corridor += v * (roadFactor[roadId] ?? 1);
    let traffic = corridor + cell.localTraffic + (localSpill[cell.id] ?? 0);
    traffic *= params.trafficMultiplier * (inTarget ? params.areaTrafficMultiplier : 1);
    traffic *= 1 - params.publicTransportShift;
    traffic = clamp(traffic, 0, 140);

    // --- Land surface ---
    let green = cell.greenCover + (inArea ? params.greenCoverDelta : 0);
    if (params.greenBuffer) {
      const nearAdded = params.addedIndustries.some(
        (ind) => haversineKm(ind.location, cell.center) < COEF.greenBufferRadiusKm,
      );
      if (nearAdded) green += COEF.greenBufferBoostPts;
    }
    green = clamp(green, 0, 95);
    const density = clamp(cell.buildingDensity + (inArea ? params.buildingDensityDelta : 0), 0.02, 0.98);
    const height = cell.avgBuildingHeight * (inArea ? params.buildingHeightMultiplier : 1);
    const canyon = clamp(1 + 0.3 * (density - 0.4) + 0.12 * (height / 25 - 1) * density, 0.8, 1.5);
    const greenFactor = 1 - COEF.greenPerPoint * green;
    const localMod = canyon * greenFactor * meteo;

    // --- Sources (µg/m³ PM2.5 before modifiers) ---
    const trafficPM = (traffic / 100) * COEF.trafficPmAtFull * (1 - params.vehicleEmissionControl);
    let industryPM = 0;
    let industrySO2 = 0;
    let industryNO2 = 0;
    for (const ind of industries) {
      const control = 1 - (1 - ind.controlEfficiency) * (1 - params.industrialControl);
      const buffered = params.greenBuffer && addedIds.has(ind.id) ? COEF.greenBufferEmissionFactor : 1;
      const e = (ind.emissionIntensity / 100) * (1 - control) * COEF.industryPmAtFull * buffered;
      const k = plumeKernel(ind.location, cell.center, w);
      industryPM += e * k;
      industrySO2 += e * k * (ind.mainPollutants.includes('so2') ? 1 : 0.25);
      industryNO2 += e * k * (ind.mainPollutants.includes('no2') ? 1 : 0.3);
    }
    const dryness = Math.exp(-0.1 * w.rainfall);
    const otherPM = (COEF.dustBase + COEF.dustPerDensity * density) * dryness;

    const contributionAbs: SourceContribution = {
      traffic: trafficPM * localMod,
      industry: industryPM * localMod,
      other: otherPM * localMod,
      background: COEF.regionalBackground * bgFactor,
    };
    const pm25 = contributionAbs.traffic + contributionAbs.industry + contributionAbs.other + contributionAbs.background;

    const pm10 = pm25 * 1.45 + contributionAbs.other * 1.6 + contributionAbs.traffic * 0.4;
    const no2 = (9 + trafficPM * 1.5 + industryNO2 * 0.5) * meteo * canyon;
    const so2 = (3 + industrySO2 * 0.55) * meteo;
    const co = (0.35 + trafficPM * 0.035) * meteo * canyon;
    const o3 = clamp(40 + (w.temperature - 25) * 2.2 - no2 * 0.18 + (1 - meteo) * 10, 5, 150);

    return {
      cellId: cell.id,
      pm25,
      pm10,
      no2,
      so2,
      co,
      o3,
      trafficIntensity: Math.min(100, traffic),
      industrialInfluence: clamp((industryPM / 40) * 100, 0, 100),
      greenCover: green,
      buildingDensity: density,
      temperature: w.temperature + 1.8 * density - 0.03 * green,
      windInfluence: meteo,
      risk: riskFromPm25(pm25),
      contributionAbs,
    };
  });
}

export const POLLUTANTS: Pollutant[] = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3'];

export function meanContribution(states: CellState[]): SourceContribution {
  const n = Math.max(1, states.length);
  const acc: SourceContribution = { traffic: 0, industry: 0, background: 0, other: 0 };
  for (const s of states) {
    acc.traffic += s.contributionAbs.traffic / n;
    acc.industry += s.contributionAbs.industry / n;
    acc.background += s.contributionAbs.background / n;
    acc.other += s.contributionAbs.other / n;
  }
  return acc;
}
