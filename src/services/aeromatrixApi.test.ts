import { describe, expect, it } from 'vitest';
import { aqiText, fmtTime, isMeasured, isPredicted, modelQuality, unitLabel, type ApiAqi, type PollutantModelMetrics } from './aeromatrixApi';

const aqi = (p: Partial<ApiAqi>): ApiAqi => ({ status: 'AVAILABLE', value: null, category: null, dominant_pollutant: null, reason: null, ...p });

describe('aeromatrixApi helpers', () => {
  it('shows an available AQI as its exact value', () => {
    expect(aqiText(aqi({ status: 'AVAILABLE', value: 283, category: 'Poor' }))).toBe('283');
  });

  it('never presents an open-ended severe AQI as exact', () => {
    expect(aqiText(aqi({ status: 'LOWER_BOUND', value: 401, category: 'Severe' }))).toBe('≥401');
    expect(aqiText(aqi({ status: 'LOWER_BOUND', value: 450 }))).toBe('≥450');
  });

  it('shows a dash when AQI is unavailable, whatever value is present', () => {
    expect(aqiText(aqi({ status: 'UNAVAILABLE', value: 120, reason: 'Fewer than three pollutants' }))).toBe('—');
    expect(aqiText(undefined)).toBe('—');
  });

  it('relabels units without converting them', () => {
    expect(unitLabel('ug/m3')).toBe('µg/m³');
    expect(unitLabel('mg/m3')).toBe('mg/m³');
    expect(unitLabel('ppb')).toBe('ppb');
  });

  it('formats timestamps in IST', () => {
    expect(fmtTime('2026-01-01T05:00:00+05:30')).toContain('05:00');
    expect(fmtTime(undefined)).toBe('—');
  });

  it('distinguishes values from unavailable results', () => {
    expect(isMeasured({ status: 'UNAVAILABLE', reason: 'x' })).toBe(false);
    expect(isPredicted({ status: 'UNAVAILABLE', reason: 'x' })).toBe(false);
    expect(isMeasured(undefined)).toBe(false);
  });
});

describe('model quality against the persistence baseline (real test-period metrics)', () => {
  it('flags the models that are weaker than repeating the last reading', async () => {
    const metrics = (await import('../../backend/trained_model/metadata/model_metrics.json')).default as unknown as Record<string, PollutantModelMetrics>;
    const q = modelQuality(metrics);
    expect(q.so2).toBe('baseline_only');
    for (const p of ['nh3', 'benzene', 'toluene', 'xylene']) expect(q[p]).toBe('below_baseline');
    for (const p of ['pm25', 'pm10', 'no2', 'no', 'nox', 'co', 'o3']) expect(q[p]).toBe('ok');
  });
});
