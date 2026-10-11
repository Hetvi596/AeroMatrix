// Forward air-quality forecast for a chosen date, from the hourly CAMS model forecast
// Open-Meteo returns with the current data. Only future IST calendar days that the
// model run actually covers are offered; a day needs at least 20 of its 24 hourly
// values. Nothing is copied from history or shifted in time.

import type { Pollutant } from '../types';
import type { ApiAqi } from './aeromatrixApi';
import { calculateAqi, type HourlyValue } from './cpcbAqi';
import { LIVE_POLLUTANTS, OPEN_METEO_VARIABLES, type LiveAirPoint } from './openMeteo';

const IST_MS = 5.5 * 3600_000;
const DAY_MS = 24 * 3600_000;
export const MIN_HOURS_PER_DAY = 20;

/** "2026-10-11" for the IST calendar day containing `ms`. */
export function istDate(ms: number): string {
  return new Date(ms + IST_MS).toISOString().slice(0, 10);
}

/** [start, end) epoch ms of an IST calendar day. */
export function istDayBounds(date: string): [number, number] {
  const start = Date.parse(`${date}T00:00:00Z`) - IST_MS;
  return [start, start + DAY_MS];
}

export function dayLabel(date: string, now: number): string {
  const tomorrow = istDate(now + DAY_MS);
  const nice = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return date === tomorrow ? `Tomorrow, ${nice}` : nice;
}

const inDay = (s: HourlyValue[] | undefined, [a, b]: [number, number]) =>
  (s ?? []).filter((x) => x.time >= a && x.time < b && x.value != null && Number.isFinite(x.value)) as { time: number; value: number }[];

/** Future IST days the forecast covers well enough to summarise, soonest first. */
export function forecastDates(point: LiveAirPoint | null | undefined, now: number): string[] {
  if (!point) return [];
  const today = istDate(now);
  const days = new Set((point.hourly.pm25 ?? []).map((x) => istDate(x.time)));
  return [...days].filter((d) => d > today && inDay(point.hourly.pm25, istDayBounds(d)).length >= MIN_HOURS_PER_DAY).sort();
}

export interface DailyForecastRow {
  pollutant: Pollutant;
  unit: string;
  mean: number;
  min: number;
  max: number;
  hours: number;
}

export interface DailyForecast {
  date: string;
  status: 'OK' | 'NOT_FUTURE' | 'NOT_COVERED';
  rows: DailyForecastRow[];
  /** CPCB AQI estimate for the day from the forecast concentrations. */
  aqi: ApiAqi | null;
  retrievedAt: number | null;
}

export function dailyForecast(point: LiveAirPoint | null | undefined, date: string, now: number): DailyForecast {
  const empty: DailyForecast = { date, status: 'NOT_COVERED', rows: [], aqi: null, retrievedAt: point?.retrievedAt ?? null };
  if (date <= istDate(now)) return { ...empty, status: 'NOT_FUTURE' };
  if (!point) return empty;
  const bounds = istDayBounds(date);
  const rows: DailyForecastRow[] = [];
  for (const p of LIVE_POLLUTANTS) {
    const hrs = inDay(point.hourly[p], bounds);
    if (hrs.length < MIN_HOURS_PER_DAY) continue;
    const vals = hrs.map((x) => x.value);
    rows.push({ pollutant: p, unit: OPEN_METEO_VARIABLES[p].unit, mean: vals.reduce((a, b) => a + b, 0) / vals.length, min: Math.min(...vals), max: Math.max(...vals), hours: hrs.length });
  }
  if (!rows.length) return empty;
  // Day-end AQI: 24 h means within the day; CO/O3 use the day's last 8 hours (estimate).
  const series = Object.fromEntries(LIVE_POLLUTANTS.map((p) => [p, inDay(point.hourly[p], bounds).map((x) => ({ time: x.time, value: x.value }))]));
  const lastHour = Math.max(...Object.values(series).flatMap((s) => s.map((x) => x.time)));
  const aqi = calculateAqi(series, lastHour, 'CPCB breakpoints on the CAMS model forecast for this day: an estimate');
  return { date, status: 'OK', rows, aqi, retrievedAt: point.retrievedAt };
}
