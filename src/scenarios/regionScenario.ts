// One scenario evaluation for a monitoring region, shared by the What-If panel, the
// forecast chart, the comparison table and the station drawer.
//
//   baseline  = trained ML model: latest measured hour (reference) and its +24 h forecast
//   scenario  = baseline × (scenario / baseline) of the prototype engine, for the same
//               pollutant, in the grid zone containing the region's area centre
//
// The ML model forecasts pollution; it does not model interventions. The intervention
// effect comes from the prototype rule engine (illustrative coefficients), applied as a
// relative change to the ML baseline. Results are hypothetical estimates.

import type { BaseState, LonLat, Pollutant, ScenarioResult } from '../types';
import {
  API_POLLUTANT_LABEL,
  isMeasured,
  isPredicted,
  type ApiForecast,
  type ApiMeasured,
  type ApiPollutant,
  type ApiStation,
  type ApiUnavailable,
} from '../services/aeromatrixApi';
import { cellAt } from '../services/scenarioService';
import { PUNE_LOCALITIES } from '../data/geojson/puneLocalities';

/** Pollutants the scenario engine models (others get a baseline but no scenario). */
export const SCENARIO_POLLUTANTS: Pollutant[] = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3'];

const words = (s: string) => ` ${s.toLowerCase().replace(/[-_,]/g, ' ').split(/\s+/).filter(Boolean).join(' ')} `;

/**
 * App area whose name appears as whole words in the station name (e.g. "Katraj Dairy" → Katraj).
 * The area centre is approximate (navigation-grade); it only picks the grid zone whose
 * modeled scenario effect is applied. The station itself is not placed on the map.
 */
export function regionLocality(station: ApiStation): { name: string; location: LonLat } | null {
  const label = words([station.name, station.station_name.replace(/,\s*Pune.*$/, ''), ...station.aliases].join(' '));
  const hit = PUNE_LOCALITIES.find((l) => label.includes(words(l.name)));
  return hit ? { name: hit.name, location: hit.location } : null;
}

export interface ValueWithRange {
  value: number;
  lower: number | null;
  upper: number | null;
}

export interface RegionScenarioRow {
  pollutant: ApiPollutant;
  label: string;
  unit: string | null;
  /** This pollutant's forecast issue / validity times (they can differ between pollutants). */
  issuedAt: string | null;
  validAt: string | null;
  /** Measured hourly mean for the forecast's reference hour (null if not that same hour). */
  current: { value: number; time: string } | null;
  baseline: ValueWithRange | null;
  scenario: ValueWithRange | null;
  /** Engine scenario / baseline in the region's zone; 1 when no scenario is active. */
  ratio: number | null;
  absChange: number | null;
  pctChange: number | null;
  reason: string | null;
}

export type RegionScenarioStatus = 'READY' | 'LOADING' | 'SERVICE_OFFLINE' | 'NO_FORECAST' | 'ERROR';

export interface RegionScenario {
  status: RegionScenarioStatus;
  message: string | null;
  station: ApiStation;
  locality: { name: string; location: LonLat } | null;
  cellId: string | null;
  /** Why the scenario effect can't be applied to this region, if it can't. */
  scenarioLimitation: string | null;
  referenceTime: string | null;
  validTime: string | null;
  historical: boolean;
  scenarioName: string | null;
  modelVersion: string | null;
  rows: RegionScenarioRow[];
}

/** Percentage change, null when the baseline is zero or missing. */
export function pctChange(before: number | null | undefined, after: number | null | undefined): number | null {
  if (before == null || after == null || !Number.isFinite(before) || !Number.isFinite(after) || before === 0) return null;
  return ((after - before) / before) * 100;
}

export function evaluateRegionScenario(input: {
  station: ApiStation;
  measured: ApiMeasured | ApiUnavailable | undefined;
  forecast: { loading: boolean; data: ApiForecast | ApiUnavailable | null; error?: string } | undefined;
  serviceOnline: boolean;
  base: BaseState;
  result: ScenarioResult | null;
}): RegionScenario {
  const { station, measured, forecast, serviceOnline, base, result } = input;
  const locality = regionLocality(station);
  const cell = locality ? cellAt(base, locality.location) : undefined;
  const scenarioLimitation = !locality
    ? 'No mapped area matches this station, so the scenario effect can’t be located.'
    : !cell
      ? `${locality.name} is outside the modeled zone grid.`
      : null;

  const empty = {
    station,
    locality,
    cellId: cell?.id ?? null,
    scenarioLimitation,
    referenceTime: null,
    validTime: null,
    historical: false,
    scenarioName: result?.params.name ?? null,
    modelVersion: null,
    rows: [],
  };
  if (!serviceOnline) return { ...empty, status: 'SERVICE_OFFLINE', message: 'The model service isn’t running.' };
  if (!forecast || forecast.loading) return { ...empty, status: 'LOADING', message: 'Running the trained models…' };
  if (forecast.error) return { ...empty, status: 'ERROR', message: 'Couldn’t reach the model service.' };
  const fc = forecast.data && 'pollutants' in forecast.data ? forecast.data : null;
  if (!fc) {
    const why = forecast.data && forecast.data.status === 'UNAVAILABLE' && 'reason' in forecast.data ? forecast.data.reason : null;
    return { ...empty, status: 'NO_FORECAST', message: why ?? 'No forecast for this region.' };
  }

  const m = measured && measured.status === 'MEASURED' ? measured : null;
  const bIdx = result && cell ? result.baseline.findIndex((s) => s.cellId === cell.id) : -1;
  const sIdx = result && cell ? result.scenario.findIndex((s) => s.cellId === cell.id) : -1;

  const rows: RegionScenarioRow[] = [];
  let referenceTime: string | null = null;
  let validTime: string | null = null;
  let historical = false;
  let modelVersion: string | null = null;
  for (const [p, v] of Object.entries(fc.pollutants) as [ApiPollutant, (typeof fc.pollutants)[ApiPollutant]][]) {
    const row: RegionScenarioRow = {
      pollutant: p,
      label: API_POLLUTANT_LABEL[p],
      unit: null,
      issuedAt: null,
      validAt: null,
      current: null,
      baseline: null,
      scenario: null,
      ratio: null,
      absChange: null,
      pctChange: null,
      reason: null,
    };
    if (!isPredicted(v)) {
      row.reason = v?.reason ?? 'No forecast for this pollutant.';
      rows.push(row);
      continue;
    }
    row.unit = v.unit;
    row.issuedAt = v.issued_at;
    row.validAt = v.valid_at;
    referenceTime ??= v.issued_at;
    validTime ??= v.valid_at;
    historical ||= v.historical;
    modelVersion ??= v.model.version;
    row.baseline = { value: v.value, lower: v.lower, upper: v.upper };
    // Anchor at the measured value only if it is the very hour the forecast was issued from.
    const mv = m?.pollutants[p];
    if (isMeasured(mv) && mv.window.end === v.issued_at && mv.unit === v.unit) row.current = { value: mv.value, time: mv.window.end };

    const supported = (SCENARIO_POLLUTANTS as string[]).includes(p);
    if (!supported) row.reason = 'The scenario engine has no model for this pollutant.';
    else if (scenarioLimitation) row.reason = scenarioLimitation;
    else {
      let ratio = 1;
      if (result && bIdx >= 0 && sIdx >= 0) {
        const b = result.baseline[bIdx][p as Pollutant];
        const s = result.scenario[sIdx][p as Pollutant];
        ratio = b > 0 ? s / b : 1;
      }
      row.ratio = ratio;
      row.scenario = {
        value: v.value * ratio,
        lower: v.lower * ratio,
        upper: v.upper * ratio,
      };
      row.absChange = row.scenario.value - v.value;
      row.pctChange = pctChange(v.value, row.scenario.value);
    }
    rows.push(row);
  }

  return {
    ...empty,
    status: 'READY',
    message: null,
    referenceTime,
    validTime,
    historical,
    modelVersion,
    rows,
  };
}
