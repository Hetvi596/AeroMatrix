// Client for the Task 2 service (backend/task2_model): missing sensors, unseen locations and
// sensor-loss replay with the trained one-hour PM2.5/PM10 models, plus an estimated PM-based AQI. The models run only in the
// Python service. The browser chooses a station, hour and scenario; the service builds the
// model inputs from its own historical record, so this client never sends measurements.
// Requests go to the same origin (/task2/…), which the Vite dev/preview server proxies to the
// service on 127.0.0.1:8030; VITE_TASK2_API_URL overrides that.

export const TASK2_API_URL = ((import.meta.env.VITE_TASK2_API_URL as string | undefined)?.trim() || '').replace(/\/$/, '');

export type T2Pollutant = 'pm25' | 'pm10';
export type T2Mode = 'network' | 'unseen';
export type T2Pattern = 'random' | 'block12h' | 'station';
export const T2_LOSS_LEVELS = [0, 0.1, 0.3, 0.5, 0.7] as const;
export const T2_SEEDS = [17, 29, 43] as const;

export interface T2Station {
  station: string;
  name: string;
  city: string | null;
  verified: boolean;
  latitude: number | null;
  longitude: number | null;
  coordinate_status: string | null;
  coordinate_source?: string | null;
  models: string[];
  test_coverage?: Record<T2Pollutant, number>;
}

export interface T2Stations {
  stations: T2Station[];
  test_start: string;
  data_end: string;
  horizon_hours: number;
  version: string;
  live: false;
}

export interface T2Request {
  station: string;
  pollutant: T2Pollutant;
  cutoff: string;
  mode: T2Mode;
  outage: string[];
  target_offline: boolean;
  loss_level: number;
  loss_pattern: T2Pattern;
  seed: number;
}

export interface T2Reliability {
  status: 'LOW' | 'CAUTION';
  donor_count: number;
  nearest_km: number;
  oldest_donor_hours: number;
  out_of_training_bounds: string[];
  weather_available: boolean;
  nominal_interval_coverage: number;
  coverage_warning: string;
}

export type T2Prediction =
  | {
      status: 'AVAILABLE';
      category: 'FORECAST_ML';
      pollutant: T2Pollutant;
      units: 'ug/m3';
      station: string;
      value: number;
      cutoff: string;
      target_time: string;
      horizon_hours: 1;
      interval: [number, number];
      model: string;
      version: string;
      baselines: { idw: number | null; persistence: number | null };
      reliability: T2Reliability;
      causal_effects_estimated: false;
    }
  | { status: 'UNAVAILABLE'; value: null; reason: string; pollutant: T2Pollutant; units: 'ug/m3' };

export type T2DonorState = 'USED' | 'STALE' | 'NO_READING' | 'LOSS_MASKED' | 'OUTAGE_SIMULATED' | 'OUT_OF_RANGE';

export interface T2Donor {
  station: string;
  name: string;
  distance_km: number;
  state: T2DonorState;
  value: number | null;
  timestamp: string | null;
  age_hours: number | null;
}

export interface T2Reading {
  state: 'REPORTING' | 'LATE' | 'MISSING';
  value: number | null;
  last_reading: string | null;
  age_hours: number | null;
}

export interface T2NetworkStation {
  station: string;
  name: string;
  verified: boolean;
  readings: Record<T2Pollutant, T2Reading>;
}

/** One pollutant's model run for the chosen station and hour. */
export interface T2PollutantResult {
  model_artifact: string;
  prediction: T2Prediction;
  target_reading_at_cutoff: { value: number | null; recorded: boolean };
  reference: { value: number | null; time: string; units: string; category: 'MEASURED'; note: string };
  errors: { ml: number; idw: number | null; persistence: number | null; inside_interval: boolean } | null;
  donors: T2Donor[];
  observations_used: number;
}

export type T2AqiStatus = 'estimated' | 'insufficient_data';

/** CPCB sub-index breakpoints on 24 h means (recorded hours + the 1 h forecast); never official. */
export interface T2AqiDetail {
  aqi: number | null;
  aqi_category: string | null;
  aqi_status: T2AqiStatus;
  aqi_type: 'ESTIMATED_PM_BASED' | null;
  aqi_bounded: boolean;
  dominant_pollutant: T2Pollutant | null;
  official: false;
  subindices: Partial<Record<T2Pollutant, { value: number; bounded: boolean; concentration_24h: number; valid_hours: number; forecast_hours: number }>>;
  excluded: Partial<Record<T2Pollutant, string>>;
  window_start: string;
  window_end: string;
  reason: string | null;
}

export interface T2Replay extends T2PollutantResult {
  mode: 'HISTORICAL_REPLAY';
  live: false;
  request: T2Request;
  cutoff: string;
  target_time: string;
  pollutants: Record<T2Pollutant, T2PollutantResult>;
  predicted_pm25: number | null;
  predicted_pm10: number | null;
  aqi: number | null;
  aqi_category: string | null;
  aqi_status: T2AqiStatus;
  aqi_type: 'ESTIMATED_PM_BASED' | null;
  aqi_detail: T2AqiDetail;
  network_status: T2NetworkStation[];
  weather: { reference_time: string | null; source: string; delay_days: number; available: boolean | undefined };
  data_end: string;
}

/** CPCB AQI category colours. */
export const T2_AQI_COLOR: Record<string, string> = {
  Good: '#22c55e',
  Satisfactory: '#a3e635',
  'Moderately Polluted': '#facc15',
  Poor: '#f97316',
  'Very Poor': '#ef4444',
  Severe: '#991b1b',
};

export interface T2Cases {
  station: string;
  pollutant: T2Pollutant;
  missing: string[];
  normal: string[];
  /** Hours where the default replay also gives an estimated AQI. */
  with_aqi: string[];
  abstain: string[];
  unseen: string[];
  first: string | null;
  last: string | null;
}

export interface T2Demo {
  scenario: string;
  mode: string;
  configuration: { loss_level: number; pattern: T2Pattern; seed: number; fold: string };
  station: string;
  pollutant: T2Pollutant;
  cutoff: string;
  excluded_station: string | null;
  observations: number;
  prediction: T2Prediction;
  reference: { value: number; timestamp: string; units: string; source: string };
  absolute_error: number | null;
}

export interface T2Action {
  id: string;
  cost: number;
  fraction: number;
  source: string;
}

export interface T2PlanRow {
  selected: string[];
  cost: number;
  benefit: number;
  baseline_case: 'lower' | 'central' | 'upper';
  baseline: number;
  effect_factor: number;
  budget: number;
  unavailable_action: string | null;
  feasible: boolean;
  original_package_feasible: boolean;
  changed: boolean;
}

export type T2PlanAnalysis =
  | { status: 'UNAVAILABLE'; reason: string }
  | {
      status: 'HYPOTHETICAL_SENSITIVITY';
      central: { selected: string[]; cost: number; benefit: number };
      scenarios: T2PlanRow[];
      unchanged_fraction: number;
      assumptions: T2Action[];
      limitations: string;
    };

export interface T2Plan {
  replay: Pick<T2Replay, 'cutoff' | 'target_time' | 'prediction' | 'model_artifact'>;
  analysis: T2PlanAnalysis;
  causal_effects_estimated: false;
}

export class Task2Error extends Error {}

const NOT_CONNECTED = 'Sensor Intelligence isn’t connected: its model service can’t be reached. On a local copy, start it with RUN_AEROMATRIX.bat.';

async function call<T>(path: string, body?: unknown, timeoutMs = 30000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(TASK2_API_URL + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    // A web host without the service answers with its own page, not the service's JSON.
    if (!(r.headers.get('content-type') ?? '').includes('application/json')) throw new Task2Error(NOT_CONNECTED);
    if (!r.ok) {
      let detail = `Task 2 service returned HTTP ${r.status}`;
      try {
        const j = (await r.json()) as { detail?: unknown };
        if (typeof j.detail === 'string') detail = j.detail;
      } catch {
        /* keep the status message */
      }
      throw new Task2Error(detail);
    }
    return (await r.json()) as T;
  } catch (e) {
    if (e instanceof Task2Error) throw e;
    throw new Task2Error(NOT_CONNECTED);
  } finally {
    clearTimeout(timer);
  }
}

export const task2Api = {
  stations: () => call<T2Stations>('/task2/stations'),
  cases: (station: string, pollutant: T2Pollutant) => call<T2Cases>(`/task2/cases?station=${encodeURIComponent(station)}&pollutant=${pollutant}`),
  replay: (req: T2Request) => call<T2Replay>('/task2/replay', req),
  demos: () => call<{ demos: T2Demo[] }>('/task2/demos'),
  plan: (replay: T2Request, actions: T2Action[], budget: number) => call<T2Plan>('/task2/plan', { replay, actions, budget }),
};

/** Whole-hour IST timestamp for a date (YYYY-MM-DD) and hour (0–23). */
export function istCutoff(date: string, hour: number): string {
  return `${date}T${String(hour).padStart(2, '0')}:00:00+05:30`;
}

/** Split an ISO timestamp into its IST date and hour. */
export function istParts(iso: string): { date: string; hour: number } {
  const t = new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000);
  return { date: t.toISOString().slice(0, 10), hour: t.getUTCHours() };
}

/** Shift a cutoff by whole hours. */
export function shiftHours(iso: string, hours: number): string {
  const { date, hour } = istParts(new Date(new Date(iso).getTime() + hours * 3600 * 1000).toISOString());
  return istCutoff(date, hour);
}

export const T2_UNIT = 'µg/m³';
export const T2_LABEL: Record<T2Pollutant, string> = { pm25: 'PM2.5', pm10: 'PM10' };
export const shortName = (name: string) => name.split(',')[0].replace(/_/g, ' ');
