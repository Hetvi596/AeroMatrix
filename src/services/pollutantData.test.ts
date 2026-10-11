// Fallback precedence for current values.

import { describe, expect, it } from 'vitest';
import { CURRENT_MAX_AGE_MS, resolveCurrent, type PlaceRef } from './pollutantData';
import type { LiveAirPoint } from './openMeteo';

const NOW = Date.UTC(2026, 9, 10, 17, 20);
const H = 3600_000;
const place: PlaceRef = { name: 'Swargate', location: [73.8586, 18.5007], reference: 'OSM node/245646553, area centre' };
const model = (value: number | null, time = NOW - 20 * 60_000): LiveAirPoint => ({
  id: 'place:swargate',
  requested: place.location!,
  grid: [73.9, 18.5],
  values: value == null ? {} : { pm25: { value, unit: 'µg/m³', time } },
  missing: value == null ? { pm25: 'Not returned by the provider' } : {},
  aqi: { status: 'UNAVAILABLE', value: null, category: null, dominant_pollutant: null, reason: 'x' },
  hourly: {},
  retrievedAt: NOW,
});
const obs = (ageH: number) => ({ value: 55, unit: 'ug/m3', time: NOW - ageH * H, source: 'station file' });
const pred = (historical: boolean, validAt = NOW) => ({ value: 61, unit: 'ug/m3', validAt, historical, lower: 50, upper: 70, source: 'Trained RF model' });

describe('current value precedence', () => {
  it('1: a recent station observation wins', () => {
    const r = resolveCurrent({ pollutant: 'pm25', place, now: NOW, observation: obs(1), model: model(39), prediction: pred(false) });
    expect(r).toMatchObject({ kind: 'observation', value: 55, freshness: 'current' });
  });

  it('a historical observation is never shown as current: model data is used', () => {
    const r = resolveCurrent({ pollutant: 'pm25', place, now: NOW, observation: obs(24 * 300), model: model(39) });
    expect(r).toMatchObject({ kind: 'model_data', value: 39, freshness: 'current', grid: [73.9, 18.5] });
    expect(r.note).toMatch(/historical/);
  });

  it('2: model data keeps its own time and is flagged when older than 3 h', () => {
    const r = resolveCurrent({ pollutant: 'pm25', place, now: NOW, model: model(39, NOW - CURRENT_MAX_AGE_MS - 1) });
    expect(r.freshness).toBe('stale');
    expect(r.time).toBe(NOW - CURRENT_MAX_AGE_MS - 1);
  });

  it('3: a current trained-model prediction is the next fallback, with its range', () => {
    const r = resolveCurrent({ pollutant: 'pm25', place, now: NOW, model: model(null), prediction: pred(false) });
    expect(r).toMatchObject({ kind: 'ml_prediction', value: 61, range: { lower: 50, upper: 70 } });
  });

  it('historical or off-time predictions are not used as current values', () => {
    expect(resolveCurrent({ pollutant: 'pm25', place, now: NOW, model: model(null), prediction: pred(true) }).value).toBeNull();
    expect(resolveCurrent({ pollutant: 'pm25', place, now: NOW, model: model(null), prediction: pred(false, NOW + 24 * H) }).value).toBeNull();
  });

  it('5: unavailable is null with a reason, never zero', () => {
    const r = resolveCurrent({ pollutant: 'pm25', place, now: NOW, model: model(null) });
    expect(r.value).toBeNull();
    expect(r.kind).toBeNull();
    expect(r.note).toMatch(/Not returned/);
  });

  it('a place without verified coordinates gets no value', () => {
    const r = resolveCurrent({ pollutant: 'pm25', place: { name: 'Mhada Colony', location: null, reference: 'none' }, now: NOW });
    expect(r.value).toBeNull();
    expect(r.note).toMatch(/No verified coordinates/);
  });

  it('ignores an observation in another unit', () => {
    const r = resolveCurrent({ pollutant: 'pm25', place, now: NOW, observation: { ...obs(1), unit: 'ppb' }, model: model(39) });
    expect(r.kind).toBe('model_data');
  });
});
