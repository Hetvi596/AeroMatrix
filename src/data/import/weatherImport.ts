// Importer for weather CSVs: ERA5 point extractions, CPCB station meteorology
// (AT, RH, WS, WD, RF, BP) or any tidy hourly table. Produces a Weather summary
// (last 24 h of the file) with unit auto-detection.

import type { Weather, WeatherObservation } from '../../types';
import { normHeader, parseCsv, parseNumber, parseTimestamp, shiftHours } from './csv';

const ALIASES: Record<keyof Weather | 'u10' | 'v10' | 'time', string[]> = {
  time: ['datetime', 'fromdate', 'timestamp', 'time', 'date', 'validtime'],
  temperature: ['temperature', 'temp', 't2m', 'at', 'airtemperature', 'tempc'],
  windSpeed: ['windspeed', 'ws', 'wind', 'si10', 'ws10'],
  windDirection: ['winddirection', 'wd', 'winddir', 'wdir'],
  humidity: ['humidity', 'rh', 'relativehumidity', 'r2'],
  rainfall: ['rainfall', 'rf', 'rain', 'precipitation', 'precip', 'tp'],
  pressure: ['pressure', 'bp', 'sp', 'msl', 'surfacepressure', 'airpressure'],
  u10: ['u10', 'u'],
  v10: ['v10', 'v'],
};

export function parseWeatherCsv(text: string, fileName: string): { obs: WeatherObservation; warnings: string[] } {
  const rows = parseCsv(text);
  const warnings: string[] = [];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const h = rows[i].map(normHeader);
    if (h.some((x) => ALIASES.time.includes(x)) && h.some((x) => [...ALIASES.temperature, ...ALIASES.windSpeed, ...ALIASES.u10].includes(x))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) throw new Error(`${fileName}: no header with a time column and temperature / wind columns was found.`);
  const header = rows[headerIdx].map(normHeader);
  const col = (k: keyof typeof ALIASES) => {
    for (const n of ALIASES[k]) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const c = {
    time: col('time'),
    temperature: col('temperature'),
    windSpeed: col('windSpeed'),
    windDirection: col('windDirection'),
    humidity: col('humidity'),
    rainfall: col('rainfall'),
    pressure: col('pressure'),
    u10: col('u10'),
    v10: col('v10'),
  };
  const rainIsEra5 = c.rainfall >= 0 && header[c.rainfall] === 'tp';

  type Row = { time: string; t?: number; ws?: number; wd?: number; rh?: number; rf?: number; p?: number };
  const parsed: Row[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const time = parseTimestamp(row[c.time] ?? '');
    if (!time) continue;
    const get = (i: number) => (i >= 0 ? parseNumber(row[i]) ?? undefined : undefined);
    let t = get(c.temperature);
    if (t !== undefined && t > 150) t -= 273.15; // Kelvin (ERA5 t2m)
    let ws = get(c.windSpeed);
    let wd = get(c.windDirection);
    const u = get(c.u10);
    const v = get(c.v10);
    if (u !== undefined && v !== undefined) {
      ws ??= Math.hypot(u, v);
      wd ??= ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360; // meteorological "from"
    }
    let rf = get(c.rainfall);
    if (rf !== undefined && rainIsEra5) rf *= 1000; // ERA5 tp is metres
    let p = get(c.pressure);
    if (p !== undefined) {
      if (p > 20000) p /= 100; // Pa → hPa
      else if (p > 600 && p < 800) p *= 1.33322; // mmHg (CPCB BP) → hPa
    }
    parsed.push({ time, t, ws, wd, rh: get(c.humidity), rf, p });
  }
  if (!parsed.length) throw new Error(`${fileName}: no rows with a valid timestamp.`);
  parsed.sort((a, b) => (a.time < b.time ? -1 : 1));
  const end = parsed[parsed.length - 1].time;
  const since = shiftHours(end, -24);
  const recent = parsed.filter((r) => r.time > since);

  const mean = (k: keyof Row) => {
    const xs = recent.map((r) => r[k]).filter((x): x is number => typeof x === 'number');
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
  };
  const dirs = recent.filter((r) => r.wd !== undefined);
  let wd: number | undefined;
  if (dirs.length) {
    const sx = dirs.reduce((a, r) => a + Math.sin((r.wd! * Math.PI) / 180), 0);
    const cx = dirs.reduce((a, r) => a + Math.cos((r.wd! * Math.PI) / 180), 0);
    wd = ((Math.atan2(sx, cx) * 180) / Math.PI + 360) % 360;
  }
  const rainSum = recent.some((r) => r.rf !== undefined) ? recent.reduce((a, r) => a + (r.rf ?? 0), 0) : undefined;

  const t = mean('t');
  const ws = mean('ws');
  const rh = mean('rh');
  const p = mean('p');
  const missing: string[] = [];
  const pick = (v: number | undefined, fallback: number, label: string) => {
    if (v === undefined || !Number.isFinite(v)) {
      missing.push(label);
      return fallback;
    }
    return v;
  };
  const weather: Weather = {
    temperature: +pick(t, 27, 'temperature').toFixed(1),
    windSpeed: +pick(ws, 2.4, 'wind speed').toFixed(2),
    windDirection: Math.round(pick(wd, 290, 'wind direction')),
    humidity: Math.round(pick(rh, 58, 'humidity')),
    rainfall: +pick(rainSum, 0, 'rainfall').toFixed(1),
    pressure: Math.round(pick(p, 1009, 'pressure')),
  };
  if (missing.length) warnings.push(`${fileName}: no data for ${missing.join(', ')} — demo values kept for those.`);

  return {
    obs: { weather, fileName, period: `${since.replace('T', ' ')} → ${end.replace('T', ' ')} (last 24 h)`, records: recent.length },
    warnings,
  };
}

export const WEATHER_TEMPLATE =
  'datetime,temperature,wind_speed,wind_direction,humidity,rainfall,pressure\n' +
  '# hourly rows; °C, m/s, degrees (FROM), %, mm, hPa. ERA5 names (t2m K, u10, v10, tp m, sp Pa) are also accepted.\n';
