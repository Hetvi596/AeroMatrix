// Open-Meteo clients: air-quality model data (CAMS global) and weather.
//
// Air quality: https://open-meteo.com/en/docs/air-quality-api
//   Values are CAMS atmospheric-model output on a coarse global grid, not monitor
//   readings. Open-Meteo snaps each request to its nearest model grid point, which is
//   kept with every value so the reference point and the grid point are both traceable.
// Weather: https://open-meteo.com/en/docs
//
// No API key is needed. Requests are batched (many coordinates per call), cached in
// memory, de-duplicated while in flight, and time out with one retry.

import type { LonLat, Pollutant, Weather } from '../types';
import type { ApiAqi } from './aeromatrixApi';
import { calculateAqi, type HourlyValue } from './cpcbAqi';

export const AIR_QUALITY_ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality';
export const WEATHER_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
export const AIR_QUALITY_DOMAIN = 'cams_global';
export const AIR_QUALITY_SOURCE = 'Open-Meteo Air Quality API (CAMS global model)';
export const WEATHER_SOURCE = 'Open-Meteo Forecast API';

/** App pollutant → Open-Meteo variable, and the factor from the provider's unit to the app's. */
export const OPEN_METEO_VARIABLES: Record<Pollutant, { variable: string; providerUnit: string; factor: number; unit: string }> = {
  pm25: { variable: 'pm2_5', providerUnit: 'µg/m³', factor: 1, unit: 'µg/m³' },
  pm10: { variable: 'pm10', providerUnit: 'µg/m³', factor: 1, unit: 'µg/m³' },
  no2: { variable: 'nitrogen_dioxide', providerUnit: 'µg/m³', factor: 1, unit: 'µg/m³' },
  so2: { variable: 'sulphur_dioxide', providerUnit: 'µg/m³', factor: 1, unit: 'µg/m³' },
  // Open-Meteo reports CO in µg/m³; the app (and CPCB breakpoints) use mg/m³.
  co: { variable: 'carbon_monoxide', providerUnit: 'µg/m³', factor: 0.001, unit: 'mg/m³' },
  o3: { variable: 'ozone', providerUnit: 'µg/m³', factor: 1, unit: 'µg/m³' },
};

export const LIVE_POLLUTANTS = Object.keys(OPEN_METEO_VARIABLES) as Pollutant[];

/** Coordinates per request; Open-Meteo accepts comma-separated lists. */
export const MAX_POINTS_PER_REQUEST = 100;

export interface LivePointRequest {
  id: string;
  location: LonLat; // [lon, lat]
}

export interface LiveValue {
  value: number;
  unit: string;
  /** Model valid time, epoch ms (UTC). */
  time: number;
}

export interface LiveAirPoint {
  id: string;
  requested: LonLat;
  /** Model grid point Open-Meteo used for this request. */
  grid: LonLat | null;
  values: Partial<Record<Pollutant, LiveValue>>;
  /** Pollutants without a usable value, with the reason. */
  missing: Partial<Record<Pollutant, string>>;
  /** CPCB AQI calculated from the model's hourly concentrations: an estimate. */
  aqi: ApiAqi;
  /** Hourly model values (past day and the forecast days), app units, hour-end epoch ms. */
  hourly: Partial<Record<Pollutant, HourlyValue[]>>;
  retrievedAt: number;
}

/** Days of hourly model forecast requested (today included); CAMS global covers about five. */
export const FORECAST_DAYS = 3;

export interface LiveWeather {
  weather: Weather;
  time: number;
  grid: LonLat | null;
  retrievedAt: number;
  /** Hours of precipitation that went into the 24 h total. */
  rainHours: number;
}

export const AQI_MODEL_METHOD = 'CPCB National AQI breakpoints applied to Open-Meteo CAMS model concentrations: an estimate, not an official station AQI';

// ------------------------------------------------------------------ fetching

export class FetchError extends Error {}

/** fetch → JSON with a timeout and retries; an aborted signal stops immediately. */
export async function fetchJson<T>(url: string, opts: { signal?: AbortSignal; timeoutMs?: number; retries?: number; fetcher?: typeof fetch } = {}): Promise<T> {
  const { signal, timeoutMs = 12_000, retries = 1, fetcher = fetch } = opts;
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetcher(url, { signal: ctrl.signal });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new FetchError(body && typeof body === 'object' && 'reason' in body ? String(body.reason) : `HTTP ${res.status}`);
      return body as T;
    } catch (e) {
      last = e;
      if (signal?.aborted) throw e;
      if (e instanceof FetchError && !/HTTP 5\d\d/.test(e.message)) throw e; // a 4xx won't fix itself
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw last instanceof Error ? last : new FetchError(String(last));
}

const cache = new Map<string, { at: number; promise: Promise<unknown> }>();

/** Short stable key for a URL (FNV-1a), so browser-storage keys stay small. */
function urlKey(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) h = Math.imul(h ^ url.charCodeAt(i), 0x01000193);
  return `aeromatrix.om.${(h >>> 0).toString(36)}`;
}

/** Last successful response for a URL, kept across page reloads (each reload would otherwise spend API quota). */
function readStored(url: string, ttlMs: number): { at: number; body: unknown } | null {
  try {
    const raw = localStorage.getItem(urlKey(url));
    if (!raw) return null;
    const v = JSON.parse(raw) as { url: string; at: number; body: unknown };
    return v.url === url && Date.now() - v.at < ttlMs ? { at: v.at, body: v.body } : null;
  } catch {
    return null;
  }
}
function writeStored(url: string, body: unknown) {
  try {
    localStorage.setItem(urlKey(url), JSON.stringify({ url, at: Date.now(), body }));
  } catch {
    /* storage full or blocked: the in-memory cache still works */
  }
}

/**
 * Cache with in-flight de-duplication: in memory, then the browser's storage for reloads.
 * Failed requests are not cached. Open-Meteo counts every coordinate as an API call, so
 * this keeps reloads from using up the free hourly quota.
 */
export function cachedJson<T>(url: string, ttlMs: number, opts: Parameters<typeof fetchJson>[1] = {}): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise as Promise<T>;
  const stored = readStored(url, ttlMs);
  if (stored) {
    const p = Promise.resolve(stored.body as T);
    cache.set(url, { at: stored.at, promise: p });
    return p;
  }
  const promise = fetchJson<T>(url, opts);
  cache.set(url, { at: Date.now(), promise });
  promise.then((body) => writeStored(url, body)).catch(() => cache.get(url)?.promise === promise && cache.delete(url));
  return promise;
}

export function clearOpenMeteoCache() {
  cache.clear();
}

// ------------------------------------------------------------------ air quality

const coord = (v: number) => v.toFixed(4);

export function airQualityUrl(points: LivePointRequest[]): string {
  const vars = LIVE_POLLUTANTS.map((p) => OPEN_METEO_VARIABLES[p].variable).join(',');
  const q = new URLSearchParams({
    latitude: points.map((p) => coord(p.location[1])).join(','),
    longitude: points.map((p) => coord(p.location[0])).join(','),
    current: vars,
    hourly: vars,
    past_days: '1',
    forecast_days: String(FORECAST_DAYS),
    domains: AIR_QUALITY_DOMAIN,
    timeformat: 'unixtime',
  });
  return `${AIR_QUALITY_ENDPOINT}?${q}`;
}

interface OmLocation {
  latitude: number;
  longitude: number;
  current_units?: Record<string, string>;
  current?: Record<string, number | null>;
  hourly_units?: Record<string, string>;
  hourly?: Record<string, (number | null)[]>;
}

/** Provider unit strings vary between the micro sign and the Greek mu. */
const normUnit = (u: string | undefined) => (u ?? '').replace('μ', 'µ');

/** One response location → app values. Unknown units or missing values are reported, never guessed. */
function parseLocation(loc: OmLocation, req: LivePointRequest, retrievedAt: number): LiveAirPoint {
  const values: LiveAirPoint['values'] = {};
  const missing: LiveAirPoint['missing'] = {};
  const series: Partial<Record<Pollutant, HourlyValue[]>> = {};
  const curTime = typeof loc.current?.time === 'number' ? loc.current.time * 1000 : null;
  const hourTimes = (loc.hourly?.time ?? []).map((t) => (t as number) * 1000);
  for (const p of LIVE_POLLUTANTS) {
    const { variable, providerUnit, factor, unit } = OPEN_METEO_VARIABLES[p];
    const cu = normUnit(loc.current_units?.[variable]);
    const v = loc.current?.[variable];
    if (cu && cu !== providerUnit) missing[p] = `Unexpected unit “${cu}”`;
    else if (v == null || !Number.isFinite(v) || curTime == null) missing[p] = 'Not returned by the provider';
    else values[p] = { value: v * factor, unit, time: curTime };
    const hu = normUnit(loc.hourly_units?.[variable]);
    const hv = loc.hourly?.[variable];
    if (hv && (!hu || hu === providerUnit))
      series[p] = hourTimes.map((t, i) => ({ time: t, value: hv[i] == null || !Number.isFinite(hv[i]) ? null : (hv[i] as number) * factor }));
  }
  // AQI over the 24 h ending at the latest model hour that isn't in the future.
  const past = hourTimes.filter((t) => t <= retrievedAt);
  const end = past.length ? past[past.length - 1] : null;
  const aqi: ApiAqi =
    end == null
      ? { status: 'UNAVAILABLE', value: null, category: null, dominant_pollutant: null, reason: 'No hourly model values', method: AQI_MODEL_METHOD }
      : calculateAqi(series, end, AQI_MODEL_METHOD);
  return {
    id: req.id,
    requested: req.location,
    grid: Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude) ? [loc.longitude, loc.latitude] : null,
    values,
    missing,
    aqi,
    hourly: series,
    retrievedAt,
  };
}

/** Parse a response for `points` (a single object for one point, an array for several). */
export function parseAirQuality(json: unknown, points: LivePointRequest[], retrievedAt: number): LiveAirPoint[] {
  const list = (Array.isArray(json) ? json : [json]) as OmLocation[];
  if (list.length !== points.length) throw new FetchError(`Expected ${points.length} locations, got ${list.length}`);
  return list.map((loc, i) => parseLocation(loc, points[i], retrievedAt));
}

export async function fetchAirQuality(points: LivePointRequest[], opts: { signal?: AbortSignal; ttlMs?: number; fetcher?: typeof fetch } = {}): Promise<LiveAirPoint[]> {
  const chunks: LivePointRequest[][] = [];
  for (let i = 0; i < points.length; i += MAX_POINTS_PER_REQUEST) chunks.push(points.slice(i, i + MAX_POINTS_PER_REQUEST));
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const url = airQualityUrl(chunk);
      // The shared (cached) request is never cancelled by one caller; callers drop stale results themselves.
      const json = opts.fetcher ? await fetchJson(url, { signal: opts.signal, fetcher: opts.fetcher }) : await cachedJson(url, opts.ttlMs ?? 60 * 60_000);
      return parseAirQuality(json, chunk, Date.now());
    }),
  );
  return results.flat();
}

// ------------------------------------------------------------------ weather

export function weatherUrl(location: LonLat): string {
  const q = new URLSearchParams({
    latitude: coord(location[1]),
    longitude: coord(location[0]),
    // pressure_msl: the dispersion model's pressure term is referenced to sea level (1010 hPa).
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,pressure_msl',
    hourly: 'precipitation',
    past_days: '1',
    forecast_days: '1',
    wind_speed_unit: 'ms',
    timeformat: 'unixtime',
  });
  return `${WEATHER_ENDPOINT}?${q}`;
}

interface OmWeather {
  latitude: number;
  longitude: number;
  current?: Record<string, number | null>;
  current_units?: Record<string, string>;
  hourly?: { time: number[]; precipitation: (number | null)[] };
}

/** Current weather in the units the scenario engine uses; precipitation summed over the past 24 h. */
export function parseWeather(json: unknown, retrievedAt: number): LiveWeather {
  const w = json as OmWeather;
  const c = w.current;
  const need = ['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'wind_direction_10m', 'pressure_msl'] as const;
  if (!c || typeof c.time !== 'number' || need.some((k) => c[k] == null || !Number.isFinite(c[k]))) throw new FetchError('Weather response is missing current values');
  if (w.current_units?.wind_speed_10m && w.current_units.wind_speed_10m !== 'm/s') throw new FetchError(`Unexpected wind unit “${w.current_units.wind_speed_10m}”`);
  const now = c.time * 1000;
  const H = 3600_000;
  const rain = (w.hourly?.time ?? [])
    .map((t, i) => ({ t: t * 1000, v: w.hourly!.precipitation[i] }))
    .filter((x) => x.t > now - 24 * H && x.t <= now && x.v != null && Number.isFinite(x.v));
  return {
    weather: {
      temperature: c.temperature_2m as number,
      humidity: c.relative_humidity_2m as number,
      windSpeed: c.wind_speed_10m as number,
      windDirection: c.wind_direction_10m as number,
      pressure: c.pressure_msl as number,
      rainfall: Math.round(rain.reduce((a, x) => a + (x.v as number), 0) * 10) / 10,
    },
    time: now,
    grid: Number.isFinite(w.latitude) ? [w.longitude, w.latitude] : null,
    retrievedAt,
    rainHours: rain.length,
  };
}

export async function fetchWeather(location: LonLat, opts: { signal?: AbortSignal; ttlMs?: number } = {}): Promise<LiveWeather> {
  const json = await cachedJson(weatherUrl(location), opts.ttlMs ?? 60 * 60_000);
  return parseWeather(json, Date.now());
}
