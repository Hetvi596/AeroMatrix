// Forward forecast by target date: only future days the model run covers; never history.

import { describe, expect, it } from 'vitest';
import airFixture from './__fixtures__/openmeteo-air-quality.json';
import { parseAirQuality, type LiveAirPoint } from './openMeteo';
import { dailyForecast, dayLabel, forecastDates, istDate, istDayBounds } from './forecast';

const H = 3600_000;
// 10 Oct 2026, 22:50 IST
const NOW = Date.UTC(2026, 9, 10, 17, 20);

/** A point whose hourly series runs from yesterday to `days` days ahead (UTC hour instants). */
function point(days: number, value = (t: number) => 40 + ((t / H) % 24)): LiveAirPoint {
  const start = Date.UTC(2026, 9, 9, 0);
  const times = Array.from({ length: 24 * (1 + days) }, (_, i) => start + i * H);
  const series = (f: (t: number) => number) => times.map((t) => ({ time: t, value: f(t) }));
  return {
    id: 'place:test',
    requested: [73.85, 18.52],
    grid: [73.9, 18.5],
    values: {},
    missing: {},
    aqi: { status: 'UNAVAILABLE', value: null, category: null, dominant_pollutant: null, reason: null },
    hourly: { pm25: series(value), pm10: series(() => 60), no2: series(() => 25), so2: series(() => 10), co: series(() => 0.7), o3: series(() => 45) },
    retrievedAt: NOW,
  };
}

describe('forward forecast', () => {
  it('uses IST calendar days', () => {
    expect(istDate(NOW)).toBe('2026-10-10');
    expect(istDate(Date.UTC(2026, 9, 10, 18, 30))).toBe('2026-10-11'); // midnight IST
    const [a, b] = istDayBounds('2026-10-11');
    expect(b - a).toBe(24 * H);
    expect(new Date(a).toISOString()).toBe('2026-10-10T18:30:00.000Z');
    expect(dayLabel('2026-10-11', NOW)).toBe('Tomorrow, 11 Oct');
  });

  it('offers only future days the model run covers, tomorrow first', () => {
    expect(forecastDates(point(3), NOW)).toEqual(['2026-10-11', '2026-10-12']);
    expect(forecastDates(point(0), NOW)).toEqual([]);
    expect(forecastDates(null, NOW)).toEqual([]);
  });

  it('summarises the target day from its own forecast hours', () => {
    const p = point(3);
    const f = dailyForecast(p, '2026-10-11', NOW);
    expect(f.status).toBe('OK');
    const pm = f.rows.find((r) => r.pollutant === 'pm25')!;
    const [a, b] = istDayBounds('2026-10-11');
    const hrs = p.hourly.pm25!.filter((x) => x.time >= a && x.time < b).map((x) => x.value as number);
    expect(pm.hours).toBe(24);
    expect(pm.mean).toBeCloseTo(hrs.reduce((s, v) => s + v, 0) / hrs.length, 9);
    expect(pm.min).toBe(Math.min(...hrs));
    expect(pm.max).toBe(Math.max(...hrs));
    expect(f.aqi?.status).toBe('AVAILABLE');
    expect(f.aqi?.method).toMatch(/estimate/);
    expect(f.retrievedAt).toBe(NOW);
  });

  it('refuses today or the past, and days the run does not cover', () => {
    expect(dailyForecast(point(3), '2026-10-10', NOW).status).toBe('NOT_FUTURE');
    expect(dailyForecast(point(3), '2026-10-01', NOW).status).toBe('NOT_FUTURE');
    expect(dailyForecast(point(3), '2026-10-20', NOW).status).toBe('NOT_COVERED');
  });

  it('needs at least 20 of 24 hours', () => {
    const p = point(3);
    const [a] = istDayBounds('2026-10-11');
    p.hourly.pm25 = p.hourly.pm25!.map((x) => (x.time >= a && x.time < a + 5 * H ? { ...x, value: null } : x));
    expect(forecastDates(p, NOW)).toEqual(['2026-10-12']);
    expect(dailyForecast(p, '2026-10-11', NOW).rows.find((r) => r.pollutant === 'pm25')).toBeUndefined();
  });

  it('a real response with no forecast days beyond today offers no forecast', () => {
    const [p] = parseAirQuality((airFixture as unknown[]).slice(0, 1), [{ id: 'place:swargate', location: [73.8586, 18.5007] }], NOW);
    expect(forecastDates(p, NOW)).toEqual([]);
    expect(dailyForecast(p, '2026-10-11', NOW).status).toBe('NOT_COVERED');
  });
});
