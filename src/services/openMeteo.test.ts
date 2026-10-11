// Open-Meteo parsing against real responses recorded on 10 Oct 2026 (src/services/__fixtures__),
// plus controlled failure cases. No live network calls are made here.

import { describe, expect, it } from 'vitest';
import airFixture from './__fixtures__/openmeteo-air-quality.json';
import weatherFixture from './__fixtures__/openmeteo-weather.json';
import {
  AQI_MODEL_METHOD,
  MAX_POINTS_PER_REQUEST,
  OPEN_METEO_VARIABLES,
  airQualityUrl,
  fetchAirQuality,
  fetchJson,
  parseAirQuality,
  parseWeather,
  weatherUrl,
  type LivePointRequest,
} from './openMeteo';

// Points the fixture was requested for (Swargate, Alandi, Karve Road: OSM reference points).
const POINTS: LivePointRequest[] = [
  { id: 'place:swargate', location: [73.8586, 18.5007] },
  { id: 'place:alandi', location: [73.8981, 18.6772] },
  { id: 'place:karve-road', location: [73.8301, 18.5079] },
];
const RETRIEVED = 1791652800000; // 10 Oct 2026, 22:50 IST: when the fixture was recorded
const raw = airFixture as unknown as Record<string, any>[];
const clone = () => JSON.parse(JSON.stringify(raw)) as Record<string, any>[];

describe('Open-Meteo air quality', () => {
  it('maps every pollutant to the documented variable name', () => {
    expect(Object.fromEntries(Object.entries(OPEN_METEO_VARIABLES).map(([k, v]) => [k, v.variable]))).toEqual({
      pm25: 'pm2_5',
      pm10: 'pm10',
      no2: 'nitrogen_dioxide',
      so2: 'sulphur_dioxide',
      co: 'carbon_monoxide',
      o3: 'ozone',
    });
  });

  it('requests each place at its own coordinates, in order, from the CAMS global domain', () => {
    const url = new URL(airQualityUrl(POINTS));
    expect(url.origin + url.pathname).toBe('https://air-quality-api.open-meteo.com/v1/air-quality');
    expect(url.searchParams.get('latitude')).toBe('18.5007,18.6772,18.5079');
    expect(url.searchParams.get('longitude')).toBe('73.8586,73.8981,73.8301');
    expect(url.searchParams.get('current')).toBe('pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,ozone');
    expect(url.searchParams.get('domains')).toBe('cams_global');
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
  });

  it('parses a real response: values, units, times and grid points', () => {
    const pts = parseAirQuality(raw, POINTS, RETRIEVED);
    expect(pts.map((p) => p.id)).toEqual(POINTS.map((p) => p.id));
    pts.forEach((p, i) => {
      const loc = raw[i];
      expect(p.requested).toEqual(POINTS[i].location);
      expect(p.grid).toEqual([loc.longitude, loc.latitude]);
      expect(p.values.pm25).toEqual({ value: loc.current.pm2_5, unit: 'µg/m³', time: loc.current.time * 1000 });
      expect(p.values.o3?.value).toBe(loc.current.ozone);
      // CO arrives in µg/m³ and is shown in mg/m³.
      expect(loc.current_units.carbon_monoxide.replace('μ', 'µ')).toBe('µg/m³');
      expect(p.values.co?.value).toBeCloseTo(loc.current.carbon_monoxide / 1000, 9);
      expect(p.values.co?.unit).toBe('mg/m³');
    });
  });

  it('labels the AQI as an estimate and uses only hours up to retrieval time', () => {
    const [p] = parseAirQuality(raw, POINTS, RETRIEVED);
    expect(p.aqi.method).toBe(AQI_MODEL_METHOD);
    const times = (raw[0].hourly.time as number[]).map((t) => t * 1000);
    const end = Math.max(...times.filter((t) => t <= RETRIEVED));
    expect(Date.parse(p.aqi.period_end!)).toBe(end);
    const pm = (raw[0].hourly.pm2_5 as (number | null)[]).filter((_, i) => times[i] > end - 24 * 3600_000 && times[i] <= end) as number[];
    expect(p.aqi.subindices?.pm25?.concentration).toBeCloseTo(pm.reduce((a, b) => a + b, 0) / pm.length, 9);
  });

  it('reports a missing value instead of turning it into zero', () => {
    const json = clone();
    json[0].current.pm2_5 = null;
    const [p] = parseAirQuality(json, POINTS, RETRIEVED);
    expect(p.values.pm25).toBeUndefined();
    expect(p.missing.pm25).toBe('Not returned by the provider');
  });

  it('refuses a value in an unexpected unit', () => {
    const json = clone();
    json[1].current_units.ozone = 'ppb';
    const p = parseAirQuality(json, POINTS, RETRIEVED)[1];
    expect(p.values.o3).toBeUndefined();
    expect(p.missing.o3).toContain('Unexpected unit');
  });

  it('rejects a response for a different number of places', () => {
    expect(() => parseAirQuality(raw.slice(0, 2), POINTS, RETRIEVED)).toThrow(/Expected 3/);
  });

  it('splits large batches and keeps every place in order', async () => {
    const points = Array.from({ length: MAX_POINTS_PER_REQUEST * 2 + 30 }, (_, i) => ({ id: `p${i}`, location: [73.8 + i * 1e-4, 18.5] as [number, number] }));
    const calls: string[] = [];
    const fetcher = (async (url: string) => {
      calls.push(url);
      const n = new URL(url).searchParams.get('latitude')!.split(',').length;
      return new Response(JSON.stringify(Array.from({ length: n }, () => raw[0])), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await fetchAirQuality(points, { fetcher });
    expect(calls).toHaveLength(3);
    expect(out.map((p) => p.id)).toEqual(points.map((p) => p.id));
  });
});

describe('fetchJson', () => {
  it('retries a network failure once, then succeeds', async () => {
    let n = 0;
    const fetcher = (async () => {
      if (n++ === 0) throw new TypeError('network down');
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;
    await expect(fetchJson('https://x', { fetcher })).resolves.toEqual({ ok: true });
    expect(n).toBe(2);
  });

  it('does not retry a client error', async () => {
    let n = 0;
    const fetcher = (async () => {
      n++;
      return new Response('{"error":true,"reason":"Bad latitude"}', { status: 400 });
    }) as unknown as typeof fetch;
    await expect(fetchJson('https://x', { fetcher })).rejects.toThrow('Bad latitude');
    expect(n).toBe(1);
  });

  it('times out', async () => {
    const fetcher = ((_: string, init: RequestInit) =>
      new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))) as unknown as typeof fetch;
    await expect(fetchJson('https://x', { fetcher, timeoutMs: 20, retries: 0 })).rejects.toThrow();
  });
});

describe('Open-Meteo weather', () => {
  it('parses current weather in the scenario engine’s units', () => {
    const w = parseWeather(weatherFixture, RETRIEVED);
    const c = (weatherFixture as any).current;
    expect(w.weather).toMatchObject({
      temperature: c.temperature_2m,
      humidity: c.relative_humidity_2m,
      windSpeed: c.wind_speed_10m,
      windDirection: c.wind_direction_10m,
      pressure: c.pressure_msl,
    });
    expect(w.weather.rainfall).toBeGreaterThanOrEqual(0);
    expect(w.rainHours).toBeGreaterThanOrEqual(23);
    expect(new URL(weatherUrl([73.8567, 18.5204])).searchParams.get('wind_speed_unit')).toBe('ms');
  });

  it('rejects wind in the wrong unit and incomplete responses', () => {
    const bad = JSON.parse(JSON.stringify(weatherFixture));
    bad.current_units.wind_speed_10m = 'km/h';
    expect(() => parseWeather(bad, RETRIEVED)).toThrow(/wind unit/);
    const missing = JSON.parse(JSON.stringify(weatherFixture));
    missing.current.temperature_2m = null;
    expect(() => parseWeather(missing, RETRIEVED)).toThrow(/missing/);
  });
});
