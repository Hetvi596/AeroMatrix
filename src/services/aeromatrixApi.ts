// Client for the trained AeroMatrix inference backend (backend/trained_model).
//
// The backend serves real station observations and +24 h forecasts for 12 Pune/PCMC
// monitoring stations. It never trains at startup and never invents values: missing
// data comes back as status UNAVAILABLE with a reason, which the UI shows as-is.
// Contract: backend/trained_model/API_CONTRACT.json and INTEGRATION_GUIDE.md.

export const MODEL_API_URL = (
  (import.meta.env.VITE_AEROMATRIX_API_URL as string | undefined) ??
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'http://127.0.0.1:8000'
).replace(/\/$/, '');

/** Canonical pollutant keys used by the backend. */
export type ApiPollutant = 'pm25' | 'pm10' | 'no2' | 'no' | 'nox' | 'so2' | 'co' | 'o3' | 'nh3' | 'benzene' | 'toluene' | 'xylene';

export const API_POLLUTANT_ORDER: ApiPollutant[] = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3', 'nh3', 'no', 'nox', 'benzene', 'toluene', 'xylene'];

export const API_POLLUTANT_LABEL: Record<ApiPollutant, string> = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  no2: 'NO₂',
  no: 'NO',
  nox: 'NOx',
  so2: 'SO₂',
  co: 'CO',
  o3: 'O₃',
  nh3: 'NH₃',
  benzene: 'Benzene',
  toluene: 'Toluene',
  xylene: 'Xylene',
};

/** Backend units are ASCII ("ug/m3"); show them typographically without converting values. */
export function unitLabel(unit: string): string {
  return unit.replace('ug/m3', 'µg/m³').replace('mg/m3', 'mg/m³');
}

export interface ApiStation {
  station: string;
  station_name: string;
  name: string;
  aliases: string[];
  longitude: number | null;
  latitude: number | null;
  source_files: string;
  available_snapshot_pollutants?: string[];
  coordinate_status?: 'unavailable' | 'verified';
}

export interface ApiHealth {
  status: string;
  model_loaded: boolean;
  model_count: number;
  supported_pollutants: string[];
  station_count: number;
  units: Record<string, string>;
  training_on_startup: boolean;
  bundled_data_is_historical: boolean;
  spatial_estimation_available: boolean;
}

export interface ApiUnavailable {
  status: 'UNAVAILABLE';
  reason: string;
  pollutant?: string;
  issued_at?: string;
  valid_at?: string;
  historical?: boolean;
  region?: string;
}

export interface ApiAqi {
  status: 'AVAILABLE' | 'LOWER_BOUND' | 'UNAVAILABLE';
  value: number | null;
  category: string | null;
  dominant_pollutant: string | null;
  reason: string | null;
  subindices?: Record<string, { value: number; bounded: boolean; concentration: number; averaging_hours: number }>;
  excluded?: Record<string, string>;
  period_end?: string;
  method?: string;
}

export interface ApiMeasuredValue {
  status: 'MEASURED';
  value: number;
  unit: string;
  time: string;
  historical: boolean;
  source: string;
  window: { start: string; end: string; statistic: string };
}

export interface ApiMeasured {
  status: 'MEASURED';
  region: ApiStation;
  pollutants: Partial<Record<ApiPollutant, ApiMeasuredValue | ApiUnavailable>>;
  aqi: ApiAqi;
  historical: boolean;
  snapshot_end: string;
  snapshot_window_end: string;
  notice: string;
}

export interface ApiPredictedValue {
  status: 'PREDICTED';
  pollutant: ApiPollutant;
  value: number;
  unit: string;
  issued_at: string;
  valid_at: string;
  generated_at: string;
  horizon_hours: number;
  historical: boolean;
  model: { algorithm: string; version: string; artifact_sha256: string; kind: 'fitted_ml_model' | 'statistical_baseline' };
  lower: number;
  upper: number;
  uncertainty: { method: string; radius: number; test_coverage: number };
  test_metrics: { mae: number; rmse: number; r2: number | null; n: number };
  reliability_warnings: string[];
  imputed_features: string[];
  source: string;
  spatial_scope: string;
}

export interface ApiForecast {
  status: 'PREDICTED' | 'PARTIAL' | 'UNAVAILABLE';
  region: ApiStation;
  pollutants: Partial<Record<ApiPollutant, ApiPredictedValue | ApiUnavailable>>;
  aqi: ApiUnavailable;
  scenario_note: string;
}

export interface ApiAqiHistory {
  status: 'SOURCE_REPORTED_AQI';
  historical: true;
  records: { station: string; time: string; aqi: number; category: string; source_file: string }[];
  note: string;
}

export interface ApiRegions {
  station_locations: ApiStation[];
  wards: { id: string; name: string; centroid: [number, number]; prediction_status: string; reason: string }[];
  notice: string;
}

/** Network / server failure — distinct from a scientifically unavailable value. */
export class ModelApiError extends Error {}

async function get<T>(path: string, signal?: AbortSignal, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${MODEL_API_URL}${path}`, { signal: ctrl.signal });
    if (!r.ok) throw new ModelApiError(`${path}: HTTP ${r.status}`);
    return (await r.json()) as T;
  } catch (e) {
    if (signal?.aborted) throw e;
    throw e instanceof ModelApiError ? e : new ModelApiError(`Model service unreachable at ${MODEL_API_URL}`);
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}

export const modelApi = {
  health: (signal?: AbortSignal) => get<ApiHealth>('/health', signal, 4000),
  regions: (signal?: AbortSignal) => get<ApiRegions>('/regions', signal),
  /** Latest measured concentrations (historical snapshot) with a gated CPCB AQI. */
  pollution: (region: string, signal?: AbortSignal) => get<ApiMeasured | ApiUnavailable>(`/pollution?region=${encodeURIComponent(region)}`, signal),
  /** One +24 h point per pollutant. Stale inputs are UNAVAILABLE unless allowHistorical is explicit. */
  forecast: (region: string, allowHistorical: boolean, signal?: AbortSignal) =>
    get<ApiForecast | ApiUnavailable>(`/forecast?region=${encodeURIComponent(region)}&allow_historical=${allowHistorical}`, signal, 30000),
  /** Evaluation metadata for one pollutant model, incl. its empirical interval. */
  metrics: (pollutant: ApiPollutant, signal?: AbortSignal) =>
    get<Record<string, { interval: { method: string; radius: number; test_coverage: number }; chosen_model: string }>>(
      `/model/metrics?pollutant=${pollutant}`,
      signal,
    ),
  /** Test-period results of every pollutant model and its baselines. */
  allMetrics: (signal?: AbortSignal) => get<Record<string, PollutantModelMetrics>>('/model/metrics', signal),
  aqiHistory: (region: string, signal?: AbortSignal) => get<ApiAqiHistory | ApiUnavailable>(`/aqi/history?region=${encodeURIComponent(region)}`, signal),
};

export function isMeasured(v: ApiMeasuredValue | ApiUnavailable | undefined): v is ApiMeasuredValue {
  return !!v && v.status === 'MEASURED';
}
export function isPredicted(v: ApiPredictedValue | ApiUnavailable | undefined): v is ApiPredictedValue {
  return !!v && v.status === 'PREDICTED';
}

/** Readable IST date-time for an ISO timestamp, e.g. "1 Jan 2026, 05:00". */
export function fmtTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

/** AQI display text honouring LOWER_BOUND (severe open-ended range) and UNAVAILABLE. */
export function aqiText(aqi: ApiAqi | undefined): string {
  if (!aqi || aqi.status === 'UNAVAILABLE' || aqi.value == null) return '—';
  return aqi.status === 'LOWER_BOUND' ? `≥${Math.max(401, aqi.value)}` : String(aqi.value);
}

/** CPCB AQI category colours. */
export const AQI_CATEGORY_COLOR: Record<string, string> = {
  Good: '#22c55e',
  Satisfactory: '#a3e635',
  Moderate: '#facc15',
  Poor: '#f97316',
  'Very Poor': '#ef4444',
  Severe: '#a8236e',
};

export const WARNING_LABEL: Record<string, string> = {
  WEAK_MODEL_NEGATIVE_OR_UNDEFINED_TEST_R2: 'Weak model: test R² is negative or undefined',
  LOW_EXPLAINED_TEST_VARIANCE: 'Low explained test variance (R² < 0.3)',
  EMPIRICAL_INTERVAL_TEST_COVERAGE_BELOW_80_PERCENT: 'Interval covered under 80% of test cases',
};

export const ALGORITHM_LABEL: Record<string, string> = {
  random_forest: 'Random forest',
  hist_gradient_boosting: 'Gradient boosting',
  persistence: 'Persistence baseline',
  seasonal_average: 'Seasonal average baseline',
};

// ------------------------------------------------------------------ model quality

type MetricSet = { mae: number; rmse: number; r2: number | null; n: number };
export interface PollutantModelMetrics {
  chosen_model: string;
  results: Record<string, { test?: MetricSet; val?: MetricSet }>;
}

/**
 * How each trained model did on the held-out test period against the persistence
 * baseline (repeat the last reading):
 *   ok             – lower RMSE than persistence
 *   below_baseline – higher RMSE than persistence: less accurate than the simple baseline
 *   baseline_only  – persistence itself was chosen (no learned model)
 */
export type ModelQuality = 'ok' | 'below_baseline' | 'baseline_only';

export function modelQuality(all: Record<string, PollutantModelMetrics>): Record<string, ModelQuality> {
  const out: Record<string, ModelQuality> = {};
  for (const [p, m] of Object.entries(all)) {
    if (m.chosen_model === 'persistence') {
      out[p] = 'baseline_only';
      continue;
    }
    const t = m.results[m.chosen_model]?.test;
    const base = m.results.persistence?.test;
    out[p] = t && base && t.rmse > base.rmse ? 'below_baseline' : 'ok';
  }
  return out;
}

export const MODEL_QUALITY_NOTE: Record<Exclude<ModelQuality, 'ok'>, string> = {
  below_baseline: 'Less accurate than simply repeating the last reading (test period)',
  baseline_only: 'Simple baseline (repeats the last reading); low accuracy',
};
