// One resolver for "the current value of a pollutant at a place". Every screen that
// shows a current concentration goes through here, so the same place shows the same
// number everywhere, with its source, timestamps and kind.
//
// Precedence (first that applies wins):
//   1. recent station observation for this place and pollutant (≤ 3 h old)
//   2. Open-Meteo air-quality model data at the place's coordinates (may be stale; its
//      time is always shown)
//   3. trained AeroMatrix model prediction valid within ±3 h of now (not historical)
//   4. spatial estimate: none implemented (no validated spatial model or station coordinates)
//   5. unavailable, with the reason. Never zero, never an old number shown as current.

import type { LonLat, Pollutant } from '../types';
import type { LiveAirPoint } from './openMeteo';
import { AIR_QUALITY_SOURCE, OPEN_METEO_VARIABLES } from './openMeteo';

export type ValueKind = 'observation' | 'model_data' | 'ml_prediction';
export type Freshness = 'current' | 'stale';

/** An observation or model value older than this isn't "current". Matches the backend's historical cut-off. */
export const CURRENT_MAX_AGE_MS = 3 * 3600_000;

export interface PlaceRef {
  name: string;
  /** Reference point the value was requested for; null if the place has no verified coordinates. */
  location: LonLat | null;
  /** How the reference point was chosen, e.g. "OSM node/245646553, area centre". */
  reference: string;
}

export interface PollutantRecord {
  pollutant: Pollutant;
  place: PlaceRef;
  value: number | null;
  unit: string;
  kind: ValueKind | null;
  source: string | null;
  /** Observation / model valid time, epoch ms. */
  time: number | null;
  retrievedAt: number | null;
  freshness: Freshness | null;
  /** Model grid point used (model data only). */
  grid: LonLat | null;
  /** Prediction interval, when the source provides one. */
  range: { lower: number; upper: number } | null;
  /** Why nothing better was available (fallbacks and unavailable values). */
  note: string | null;
}

export interface ObservationInput {
  value: number;
  unit: string;
  time: number;
  source: string;
}

export interface PredictionInput {
  value: number;
  unit: string;
  validAt: number;
  historical: boolean;
  lower: number | null;
  upper: number | null;
  source: string;
}

const appUnit = (u: string) => u.replace('ug/m3', 'µg/m³').replace('mg/m3', 'mg/m³').replace('μ', 'µ');

export function resolveCurrent(args: {
  pollutant: Pollutant;
  place: PlaceRef;
  now: number;
  observation?: ObservationInput | null;
  model?: LiveAirPoint | null;
  prediction?: PredictionInput | null;
}): PollutantRecord {
  const { pollutant, place, now, observation, model, prediction } = args;
  const unit = OPEN_METEO_VARIABLES[pollutant].unit;
  const blank: PollutantRecord = { pollutant, place, value: null, unit, kind: null, source: null, time: null, retrievedAt: null, freshness: null, grid: null, range: null, note: null };
  const notes: string[] = [];

  // 1. Recent observation (same unit as the app only).
  if (observation) {
    if (appUnit(observation.unit) !== unit) notes.push(`Station reading in ${observation.unit} not used`);
    else if (now - observation.time <= CURRENT_MAX_AGE_MS)
      return { ...blank, value: observation.value, kind: 'observation', source: observation.source, time: observation.time, retrievedAt: now, freshness: 'current' };
    else notes.push('Latest station reading is historical');
  }

  // 2. Open-Meteo model data at the place.
  const mv = model?.values[pollutant];
  if (model && mv) {
    return {
      ...blank,
      value: mv.value,
      kind: 'model_data',
      source: AIR_QUALITY_SOURCE,
      time: mv.time,
      retrievedAt: model.retrievedAt,
      freshness: now - mv.time <= CURRENT_MAX_AGE_MS ? 'current' : 'stale',
      grid: model.grid,
      note: notes.length ? notes.join('; ') : null,
    };
  }
  if (!place.location) notes.push('No verified coordinates for this place');
  else if (model) notes.push(`Model data: ${model.missing[pollutant] ?? 'not returned'}`);
  else notes.push('Model data not loaded');

  // 3. Trained-model prediction valid around now.
  if (prediction) {
    if (prediction.historical) notes.push('Trained-model forecast is historical');
    else if (Math.abs(prediction.validAt - now) > CURRENT_MAX_AGE_MS) notes.push('No trained-model forecast valid now');
    else if (appUnit(prediction.unit) !== unit) notes.push(`Forecast in ${prediction.unit} not used`);
    else
      return {
        ...blank,
        value: prediction.value,
        kind: 'ml_prediction',
        source: prediction.source,
        time: prediction.validAt,
        retrievedAt: now,
        freshness: 'current',
        range: prediction.lower != null && prediction.upper != null ? { lower: prediction.lower, upper: prediction.upper } : null,
        note: notes.join('; '),
      };
  }

  // 4. No defensible spatial estimate. 5. Unavailable.
  return { ...blank, note: notes.join('; ') || 'No data source covers this place' };
}

export const KIND_LABEL: Record<ValueKind, string> = {
  observation: 'Station observation',
  model_data: 'Model data',
  ml_prediction: 'Trained-model prediction',
};

/** "22:30" today, or "9 Oct, 22:30", in IST. */
export function fmtIst(ms: number | null, now = Date.now()): string {
  if (ms == null) return '—';
  const d = new Date(ms);
  const day = (x: Date) => x.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  const time = d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
  return day(d) === day(new Date(now)) ? time : `${d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}, ${time}`;
}
