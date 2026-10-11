// CPCB National AQI rules (same cases as the backend's preprocessing/aqi.py).

import { describe, expect, it } from 'vitest';
import { aqiCategory, calculateAqi, subindex, type HourlyValue } from './cpcbAqi';

const H = 3600_000;
const END = Date.UTC(2026, 9, 10, 12);
const flat = (v: number | null, hours = 24): HourlyValue[] => Array.from({ length: hours }, (_, i) => ({ time: END - i * H, value: v }));

describe('CPCB sub-indices', () => {
  it('follows the breakpoint table at band edges', () => {
    expect(subindex('pm25', 30)).toEqual({ value: 50, bounded: false });
    expect(subindex('pm25', 31)).toEqual({ value: 51, bounded: false });
    expect(subindex('pm25', 60)?.value).toBe(100);
    expect(subindex('pm25', 250)?.value).toBe(400);
    expect(subindex('pm10', 100)?.value).toBe(100);
    expect(subindex('no2', 80)?.value).toBe(100);
    expect(subindex('co', 2)?.value).toBe(100);
  });

  it('rounds to the table precision before looking up a band', () => {
    expect(subindex('pm25', 30.4)?.value).toBe(50);
    expect(subindex('pm25', 30.6)?.value).toBe(51);
    expect(subindex('co', 1.04)?.value).toBe(50);
    expect(subindex('co', 1.06)?.value).toBe(51);
  });

  it('reports a lower bound above the table and refuses ozone beyond 208', () => {
    expect(subindex('pm25', 300)).toEqual({ value: 401, bounded: true });
    expect(subindex('o3', 250)).toBeNull();
    expect(subindex('pm25', -1)).toBeNull();
  });

  it('names categories', () => {
    expect([50, 100, 200, 300, 400, 401].map(aqiCategory)).toEqual(['Good', 'Satisfactory', 'Moderate', 'Poor', 'Very Poor', 'Severe']);
  });
});

describe('CPCB AQI', () => {
  it('takes the highest sub-index of at least three pollutants', () => {
    const a = calculateAqi({ pm25: flat(45), pm10: flat(60), no2: flat(20) }, END, 'test');
    expect(a.status).toBe('AVAILABLE');
    expect(a.value).toBe(subindex('pm25', 45)!.value);
    expect(a.dominant_pollutant).toBe('pm25');
    expect(a.method).toBe('test');
  });

  it('never averages concentrations across pollutants', () => {
    const a = calculateAqi({ pm25: flat(100), pm10: flat(10), no2: flat(10) }, END, 'test');
    expect(a.value).toBe(subindex('pm25', 100)!.value);
  });

  it('needs PM2.5 or PM10 and three pollutants', () => {
    expect(calculateAqi({ no2: flat(20), so2: flat(10), co: flat(1) }, END, 't').status).toBe('UNAVAILABLE');
    expect(calculateAqi({ pm25: flat(20), no2: flat(20) }, END, 't').status).toBe('UNAVAILABLE');
  });

  it('needs 16 valid hours and a complete 8 h window for CO and O3', () => {
    const sparse = flat(40).map((x, i) => (i % 2 ? { ...x, value: null } : x));
    const a = calculateAqi({ pm25: sparse, pm10: flat(50), no2: flat(20), o3: flat(30, 6) }, END, 't');
    expect(a.excluded?.pm25).toMatch(/16 valid/);
    expect(a.excluded?.o3).toMatch(/16 valid/);
    const gap = flat(30).map((x, i) => (i === 2 ? { ...x, value: null } : x));
    expect(calculateAqi({ pm25: flat(40), pm10: flat(50), o3: gap }, END, 't').excluded?.o3).toMatch(/8h/);
  });

  it('uses the trailing 8 h for ozone', () => {
    const o3 = flat(0).map((x, i) => ({ ...x, value: i < 8 ? 120 : 10 }));
    const a = calculateAqi({ pm25: flat(20), pm10: flat(20), o3 }, END, 't');
    expect(a.subindices?.o3?.concentration).toBe(120);
    expect(a.subindices?.o3?.averaging_hours).toBe(8);
  });

  it('withholds the AQI when ozone needs the one-hour rule, and bounds severe values', () => {
    expect(calculateAqi({ pm25: flat(20), pm10: flat(20), no2: flat(20), o3: flat(260) }, END, 't').status).toBe('UNAVAILABLE');
    const severe = calculateAqi({ pm25: flat(400), pm10: flat(20), no2: flat(20) }, END, 't');
    expect(severe.status).toBe('LOWER_BOUND');
    expect(severe.dominant_pollutant).toBeNull();
  });
});

describe('parity with the backend (preprocessing/aqi.py)', () => {
  // 40 random cases computed by the backend's own calculate_aqi (src/services/__fixtures__/aqi-parity-backend.json).
  it('gives the same AQI, status and sub-indices', async () => {
    const cases = (await import('./__fixtures__/aqi-parity-backend.json')).default as {
      end: string;
      series: Record<string, (number | null)[]>;
      status: string;
      value: number | null;
      dominant: string | null;
      sub: Record<string, number>;
    }[];
    for (const c of cases) {
      const end = Date.parse(c.end);
      const series = Object.fromEntries(Object.entries(c.series).map(([p, vals]) => [p, vals.map((value, i) => ({ time: end - i * H, value }))]));
      const a = calculateAqi(series, end, 'parity');
      expect(a.status).toBe(c.status);
      expect(a.value).toBe(c.value);
      expect(a.dominant_pollutant).toBe(c.dominant);
      expect(Object.fromEntries(Object.entries(a.subindices ?? {}).map(([p, s]) => [p, s.value]))).toEqual(c.sub);
    }
  });
});
