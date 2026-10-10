// PredictionService — future ML forecasting (PM2.5 first, then PM10 / NO2).
//
// No model is trained yet, so the active implementation reports "not available"
// instead of fabricating forecasts. A future implementation will call the
// backend (backend/api) which serves a model chosen by validation performance
// (baseline RF/XGBoost with lag features → LightGBM → temporal models if justified).

import type { Pollutant, TimePoint } from '../types';

export interface ForecastResult {
  available: boolean;
  reason?: string;
  pollutant: Pollutant;
  cellId: string;
  horizonHours: number;
  points: (TimePoint & { lower?: number; upper?: number })[];
  model?: { id: string; version: string; trainedOn: string; validation: { rmse: number; mae: number; r2: number } };
}

export interface ExplanationResult {
  available: boolean;
  reason?: string;
  /** SHAP-style per-feature attribution (µg/m³). */
  features: { feature: string; contribution: number }[];
}

export interface PredictionService {
  readonly id: string;
  readonly available: boolean;
  forecast(cellId: string, pollutant: Pollutant, horizonHours: number): Promise<ForecastResult>;
  explain(cellId: string, pollutant: Pollutant): Promise<ExplanationResult>;
}

/** Feature set the future model is expected to consume (documented contract). */
export const FUTURE_MODEL_FEATURES = {
  pollutantHistory: ['pm25_lag_1h..72h', 'pm10_lag', 'no2_lag', 'so2_lag', 'co_lag', 'o3_lag'],
  weather: ['temperature', 'humidity', 'wind_speed', 'wind_direction', 'pressure', 'rainfall', 'boundary_layer_height'],
  traffic: ['traffic_intensity', 'road_density', 'distance_to_major_road'],
  industry: ['industrial_proximity', 'emission_intensity_weighted'],
  geospatial: ['elevation', 'green_cover', 'building_density', 'land_use'],
  temporal: ['hour', 'day_of_week', 'month', 'holiday'],
};

export class NotTrainedPredictionService implements PredictionService {
  readonly id = 'none';
  readonly available = false;
  async forecast(cellId: string, pollutant: Pollutant, horizonHours: number): Promise<ForecastResult> {
    return {
      available: false,
      reason: 'No trained forecasting model yet — awaiting CPCB + ERA5 datasets for training and hold-out validation.',
      pollutant,
      cellId,
      horizonHours,
      points: [],
    };
  }
  async explain(): Promise<ExplanationResult> {
    return { available: false, reason: 'Explainability (SHAP) will be computed from the trained model.', features: [] };
  }
}

/** Example of the future HTTP implementation (not active). */
export class HttpPredictionService implements PredictionService {
  readonly id = 'http';
  readonly available = true;
  constructor(private baseUrl: string) {}
  async forecast(cellId: string, pollutant: Pollutant, horizonHours: number): Promise<ForecastResult> {
    const r = await fetch(`${this.baseUrl}/forecast?cell=${encodeURIComponent(cellId)}&pollutant=${pollutant}&h=${horizonHours}`);
    if (!r.ok) throw new Error(`Forecast API error ${r.status}`);
    return r.json();
  }
  async explain(cellId: string, pollutant: Pollutant): Promise<ExplanationResult> {
    const r = await fetch(`${this.baseUrl}/explain?cell=${encodeURIComponent(cellId)}&pollutant=${pollutant}`);
    if (!r.ok) throw new Error(`Explain API error ${r.status}`);
    return r.json();
  }
}

export const predictionService: PredictionService = new NotTrainedPredictionService();

// ---------------------------------------------------------------------------
// Backend client (backend/api). Used to detect a model trained on real data.
// ---------------------------------------------------------------------------

export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000').replace(/\/$/, '');

export interface BackendHealth {
  model_loaded: boolean;
  model: null | {
    chosen_model: string;
    horizon_hours: number;
    data_period: [string, string];
    trained_at: string;
    stations: string[];
    target: string;
    station_locations?: Record<string, [number, number]>;
  };
}

type Metric = { rmse: number; mae: number; r2: number; n: number };
export interface BackendMetrics {
  chosen_model: string;
  results: Record<string, { val: Metric; test: Metric }>;
  split: { val_start: string; test_start: string };
  shap_group_importance: Record<string, number> | null;
}

export interface StationForecast {
  station: string;
  issued_at: string;
  valid_at: string;
  value: number;
}

async function getJson<T>(path: string, timeoutMs = 2000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API_URL}${path}`, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export const backendClient = {
  /** Resolves null when the backend is not running. */
  async health(): Promise<BackendHealth | null> {
    try {
      return await getJson<BackendHealth>('/health');
    } catch {
      return null;
    }
  },
  metrics: () => getJson<BackendMetrics>('/model/metrics'),
  forecast: (station: string) => getJson<StationForecast>(`/forecast?station=${encodeURIComponent(station)}`),
};
