// Observed-data analytics: time-window aggregation, IDW gridding, time series,
// and prototype-model-vs-observation validation. Pure functions.

import type {
  AggregationWindow,
  BaseState,
  CellState,
  ModelCalibration,
  ObservationDataset,
  ObservedField,
  Pollutant,
  StationSummary,
  TimePoint,
} from '../types';
import { shiftHours } from '../data/import/csv';
import { haversineKm } from '../utils/geo';
import { cellAt } from './scenarioService';

/** Stations further than this from the analysis-area centre are ignored for gridding. */
const MAX_STATION_DISTANCE_KM = 40;
const IDW_POWER = 2;

export function windowStart(ds: ObservationDataset, window: AggregationWindow): string {
  return window === 'last24h' ? shiftHours(ds.end, -24) : '';
}

export function summariseStations(ds: ObservationDataset, window: AggregationWindow, base: BaseState): StationSummary[] {
  const since = windowStart(ds, window);
  const acc = new Map<string, { sums: Partial<Record<Pollutant, number>>; counts: Partial<Record<Pollutant, number>>; n: number }>();
  for (const r of ds.records) {
    if (since && r.time <= since) continue;
    let a = acc.get(r.stationId);
    if (!a) acc.set(r.stationId, (a = { sums: {}, counts: {}, n: 0 }));
    a.n++;
    for (const [p, v] of Object.entries(r.values) as [Pollutant, number][]) {
      a.sums[p] = (a.sums[p] ?? 0) + v;
      a.counts[p] = (a.counts[p] ?? 0) + 1;
    }
  }
  return ds.stations.map((station) => {
    const a = acc.get(station.id);
    const values: Partial<Record<Pollutant, number>> = {};
    if (a) for (const p of Object.keys(a.sums) as Pollutant[]) values[p] = a.sums[p]! / a.counts[p]!;
    return {
      station,
      cellId: station.location ? cellAt(base, station.location)?.id ?? null : null,
      values,
      count: a?.n ?? 0,
    };
  });
}

/** Inverse-distance-weighted interpolation of station means onto grid cell centres. */
export function interpolateField(summaries: StationSummary[], pollutant: Pollutant, base: BaseState): ObservedField | null {
  const pts = summaries.filter(
    (s) =>
      s.station.location &&
      s.values[pollutant] !== undefined &&
      haversineKm(s.station.location, base.city.center) <= MAX_STATION_DISTANCE_KM,
  );
  if (!pts.length) return null;
  const values: Record<string, number> = {};
  const nearestKm: Record<string, number> = {};
  for (const cell of base.cells) {
    let wsum = 0;
    let vsum = 0;
    let nearest = Infinity;
    for (const s of pts) {
      const d = Math.max(0.2, haversineKm(cell.center, s.station.location!));
      nearest = Math.min(nearest, d);
      const w = 1 / d ** IDW_POWER;
      wsum += w;
      vsum += w * s.values[pollutant]!;
    }
    values[cell.id] = vsum / wsum;
    nearestKm[cell.id] = nearest;
  }
  return { pollutant, values, nearestKm, stationCount: pts.length };
}

/**
 * Observed series for the stations relevant to a cell (stations inside it, else
 * the nearest station within 6 km), or the all-station mean when cellId is null.
 * Hourly for ≤ 3 days of data in the window, otherwise daily means.
 */
export function observedSeries(
  ds: ObservationDataset,
  summaries: StationSummary[],
  pollutant: Pollutant,
  base: BaseState,
  cellId: string | null,
  days: number,
): { points: TimePoint[]; label: string } | null {
  let stationIds: string[];
  let label: string;
  if (cellId) {
    const inCell = summaries.filter((s) => s.cellId === cellId);
    if (inCell.length) {
      stationIds = inCell.map((s) => s.station.id);
      label = inCell.map((s) => s.station.name).join(', ');
    } else {
      const cell = base.cells.find((c) => c.id === cellId);
      const near = summaries
        .filter((s) => s.station.location && cell)
        .map((s) => ({ s, d: haversineKm(s.station.location!, cell!.center) }))
        .filter((x) => x.d <= 6)
        .sort((a, b) => a.d - b.d)[0];
      if (!near) return null;
      stationIds = [near.s.station.id];
      label = `${near.s.station.name} (${near.d.toFixed(1)} km away)`;
    }
  } else {
    stationIds = ds.stations.map((s) => s.id);
    label = `mean of ${stationIds.length} station(s)`;
  }
  const ids = new Set(stationIds);
  const since = shiftHours(ds.end, -24 * days);
  const hourly = days <= 3;
  const buckets = new Map<string, { sum: number; n: number }>();
  for (const r of ds.records) {
    if (!ids.has(r.stationId) || r.time <= since) continue;
    const v = r.values[pollutant];
    if (v === undefined) continue;
    const key = hourly ? r.time.slice(0, 13) : r.time.slice(0, 10);
    const b = buckets.get(key) ?? { sum: 0, n: 0 };
    b.sum += v;
    b.n++;
    buckets.set(key, b);
  }
  if (!buckets.size) return null;
  const points = [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, b]) => ({ t: hourly ? `${k.slice(8, 10)}/${k.slice(5, 7)} ${k.slice(11, 13)}h` : `${k.slice(8, 10)}/${k.slice(5, 7)}`, value: b.sum / b.n }));
  return { points, label };
}

/**
 * Fit PM2.5 = α·background + β·local to station observations (least squares).
 * Background is ~constant across cells, so α acts as the intercept. With < 3
 * stations only β is fitted (α = 1). Both are clamped to plausible ranges.
 */
export function fitCalibration(
  summaries: StationSummary[],
  uncalibrated: CellState[],
  window: AggregationWindow,
): ModelCalibration | null {
  const byCell = new Map(uncalibrated.map((s) => [s.cellId, s]));
  const pts: { obs: number; bg: number; local: number }[] = [];
  for (const s of summaries) {
    const obs = s.values.pm25;
    const m = s.cellId ? byCell.get(s.cellId) : undefined;
    if (obs === undefined || !m) continue;
    const c = m.contributionAbs;
    pts.push({ obs, bg: c.background, local: c.traffic + c.industry + c.other });
  }
  if (!pts.length) return null;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const n = pts.length;
  const bgMean = pts.reduce((a, p) => a + p.bg, 0) / n;
  let alpha = 1;
  let beta: number;
  const mx = pts.reduce((a, p) => a + p.local, 0) / n;
  const my = pts.reduce((a, p) => a + p.obs, 0) / n;
  const sxx = pts.reduce((a, p) => a + (p.local - mx) ** 2, 0);
  if (n >= 3 && sxx > 1e-6) {
    beta = pts.reduce((a, p) => a + (p.local - mx) * (p.obs - my), 0) / sxx;
    beta = clamp(beta, 0.1, 5);
    alpha = clamp((my - beta * mx) / bgMean, 0.2, 5);
  } else {
    beta = clamp((my - bgMean) / Math.max(mx, 1e-6), 0.1, 5);
  }
  const rmse = (f: (p: (typeof pts)[number]) => number) => Math.sqrt(pts.reduce((a, p) => a + (f(p) - p.obs) ** 2, 0) / n);
  return {
    pollutant: 'pm25',
    backgroundScale: alpha,
    localScale: beta,
    stations: n,
    rmseBefore: rmse((p) => p.bg + p.local),
    rmseAfter: rmse((p) => alpha * p.bg + beta * p.local),
    window: window === 'last24h' ? 'last 24 h' : 'whole period',
    fittedAt: new Date().toISOString(),
  };
}

export interface ValidationRow {
  stationName: string;
  cellId: string;
  observed: number;
  modeled: number;
  error: number;
}

export interface ValidationResult {
  pollutant: Pollutant;
  rows: ValidationRow[];
  n: number;
  mae: number;
  rmse: number;
  bias: number;
  r: number | null;
  /** Multiplicative factor that would remove the mean bias (diagnostic only). */
  ratio: number;
}

/** Compare prototype-model baseline cells against observed station means (paired by host cell). */
export function validateModel(summaries: StationSummary[], baseline: CellState[], pollutant: Pollutant): ValidationResult | null {
  const byCell = new Map(baseline.map((s) => [s.cellId, s]));
  const rows: ValidationRow[] = [];
  for (const s of summaries) {
    const obs = s.values[pollutant];
    if (obs === undefined || !s.cellId) continue;
    const m = byCell.get(s.cellId);
    if (!m) continue;
    rows.push({ stationName: s.station.name, cellId: s.cellId, observed: obs, modeled: m[pollutant], error: m[pollutant] - obs });
  }
  if (!rows.length) return null;
  const n = rows.length;
  const mae = rows.reduce((a, r) => a + Math.abs(r.error), 0) / n;
  const rmse = Math.sqrt(rows.reduce((a, r) => a + r.error ** 2, 0) / n);
  const bias = rows.reduce((a, r) => a + r.error, 0) / n;
  let r: number | null = null;
  if (n >= 3) {
    const mo = rows.reduce((a, x) => a + x.observed, 0) / n;
    const mm = rows.reduce((a, x) => a + x.modeled, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (const x of rows) {
      sxy += (x.observed - mo) * (x.modeled - mm);
      sxx += (x.observed - mo) ** 2;
      syy += (x.modeled - mm) ** 2;
    }
    r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  }
  const sumObs = rows.reduce((a, x) => a + x.observed, 0);
  const sumMod = rows.reduce((a, x) => a + x.modeled, 0);
  return { pollutant, rows, n, mae, rmse, bias, r, ratio: sumMod > 0 ? sumObs / sumMod : 1 };
}
