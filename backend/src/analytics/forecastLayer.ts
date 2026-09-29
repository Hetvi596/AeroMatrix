// Builds the MODEL PREDICTION map layer from the backend's per-station forecasts.

import type { ForecastLayer, LonLat, Pollutant, StationSummary } from '../types';
import { backendClient, type BackendHealth, type StationForecast } from '../services/predictionService';
import { interpolateField } from '../services/observations';
import { cellAt } from '../services/scenarioService';
import { useTwin } from '../store/useTwinStore';

export function buildForecastLayer(health: BackendHealth, forecasts: StationForecast[]): ForecastLayer | null {
  const { base, observations } = useTwin.getState();
  const m = health.model;
  if (!base || !m || !forecasts.length) return null;
  const pollutant = m.target as Pollutant;
  const obsLoc = new Map((observations?.stations ?? []).filter((s) => s.location).map((s) => [s.name, s.location as LonLat]));
  const stations = forecasts
    .map((f) => ({ name: f.station, value: f.value, location: (m.station_locations?.[f.station] as LonLat | undefined) ?? obsLoc.get(f.station) }))
    .filter((s): s is { name: string; value: number; location: LonLat } => !!s.location);
  const summaries: StationSummary[] = stations.map((s) => ({
    station: { id: s.name, name: s.name, location: s.location },
    cellId: cellAt(base, s.location)?.id ?? null,
    values: { [pollutant]: s.value },
    count: 1,
  }));
  const field = interpolateField(summaries, pollutant, base);
  if (!field) return null;
  return {
    pollutant,
    model: m.chosen_model,
    horizonHours: m.horizon_hours,
    validAt: forecasts[0].valid_at,
    field,
    stations,
  };
}

/** Fetch forecasts and publish the layer to the store. Returns what was found (null = backend offline). */
export async function refreshForecastLayer(): Promise<{ health: BackendHealth; forecasts: StationForecast[] } | null> {
  const health = await backendClient.health();
  if (!health) {
    useTwin.getState().setForecastLayer(null);
    return null;
  }
  if (!health.model_loaded || !health.model) {
    useTwin.getState().setForecastLayer(null);
    return { health, forecasts: [] };
  }
  const forecasts = (await Promise.allSettled(health.model.stations.map((s) => backendClient.forecast(s))))
    .filter((r): r is PromiseFulfilledResult<StationForecast> => r.status === 'fulfilled')
    .map((r) => r.value);
  useTwin.getState().setForecastLayer(buildForecastLayer(health, forecasts));
  return { health, forecasts };
}
