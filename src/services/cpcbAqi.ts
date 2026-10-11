// CPCB National AQI from hourly concentrations. A port of the backend's
// preprocessing/aqi.py so both sides apply the same rules:
//   - sub-index per pollutant from the CPCB breakpoint table
//   - PM2.5, PM10, NO2, SO2: 24 h mean; CO, O3: trailing 8 h mean (all 8 hours required)
//   - at least 16 valid hours in the trailing 24 h for every pollutant used
//   - at least three pollutants, one of them PM2.5 or PM10
//   - open-ended severe concentrations give a lower bound (≥401), never an invented value
//   - ozone above 208 µg/m³ needs the separate one-hour rule, so the AQI is withheld
// Reference: https://airquality.cpcb.gov.in/ccr_docs/FINAL-REPORT_AQI_.pdf (Table 3.11).
// Units: µg/m³, except CO in mg/m³.

import type { ApiAqi } from './aeromatrixApi';

export type AqiPollutant = 'pm25' | 'pm10' | 'no2' | 'so2' | 'co' | 'o3';

const INDEX: [number, number][] = [
  [0, 50],
  [51, 100],
  [101, 200],
  [201, 300],
  [301, 400],
];

const BANDS: Record<AqiPollutant, [number, number][]> = {
  pm25: [[0, 30], [31, 60], [61, 90], [91, 120], [121, 250]],
  pm10: [[0, 50], [51, 100], [101, 250], [251, 350], [351, 430]],
  no2: [[0, 40], [41, 80], [81, 180], [181, 280], [281, 400]],
  so2: [[0, 40], [41, 80], [81, 380], [381, 800], [801, 1600]],
  co: [[0, 1], [1.1, 2], [2.1, 10], [10.1, 17], [17.1, 34]],
  o3: [[0, 50], [51, 100], [101, 168], [169, 208]],
};

const ORDER: AqiPollutant[] = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3'];

export function subindex(p: AqiPollutant, concentration: number): { value: number; bounded: boolean } | null {
  if (!Number.isFinite(concentration) || concentration < 0) return null;
  // Printed bands are discrete: round to the table's precision first.
  const step = p === 'co' ? 10 : 1;
  const c = Math.floor(concentration * step + 0.5) / step;
  for (let i = 0; i < BANDS[p].length; i++) {
    const [lo, hi] = BANDS[p][i];
    const [ilo, ihi] = INDEX[i];
    if (c >= lo && c <= hi) return { value: Math.floor(ilo + ((ihi - ilo) * (c - lo)) / (hi - lo) + 0.5), bounded: false };
  }
  if (p === 'o3') return null;
  return { value: 401, bounded: true };
}

export function aqiCategory(value: number): string {
  if (value <= 50) return 'Good';
  if (value <= 100) return 'Satisfactory';
  if (value <= 200) return 'Moderate';
  if (value <= 300) return 'Poor';
  if (value <= 400) return 'Very Poor';
  return 'Severe';
}

export interface HourlyValue {
  /** End of the hour the value represents, epoch ms. */
  time: number;
  value: number | null;
}

/**
 * AQI for the 24 h ending at `end` (epoch ms). `method` describes the inputs so that an
 * AQI computed from model data is never presented as an official station AQI.
 */
export function calculateAqi(series: Partial<Record<AqiPollutant, HourlyValue[]>>, end: number, method: string): ApiAqi {
  const H = 3600_000;
  const subindices: NonNullable<ApiAqi['subindices']> = {};
  const excluded: Record<string, string> = {};
  for (const p of ORDER) {
    const s = series[p];
    if (!s) continue;
    const day = s.filter((x) => x.time > end - 24 * H && x.time <= end && x.value != null && Number.isFinite(x.value)) as { time: number; value: number }[];
    if (day.length < 16) {
      excluded[p] = 'Fewer than 16 valid hourly values in 24h';
      continue;
    }
    const window = p === 'co' || p === 'o3' ? day.filter((x) => x.time > end - 8 * H) : day;
    if ((p === 'co' || p === 'o3') && window.length < 8) {
      excluded[p] = 'Incomplete trailing 8h average';
      continue;
    }
    const mean = window.reduce((a, x) => a + x.value, 0) / window.length;
    const si = subindex(p, mean);
    if (!si) {
      excluded[p] = 'Unsupported concentration range or one-hour ozone rule required';
      continue;
    }
    subindices[p] = { ...si, concentration: mean, averaging_hours: p === 'co' || p === 'o3' ? 8 : 24 };
  }
  const keys = Object.keys(subindices);
  const ozoneUnsupported = (excluded.o3 ?? '').startsWith('Unsupported');
  const eligible = keys.length >= 3 && (keys.includes('pm25') || keys.includes('pm10')) && !ozoneUnsupported;
  const dominant = keys.length ? keys.reduce((a, b) => (subindices[b].value > subindices[a].value ? b : a)) : null;
  const bounded = keys.some((k) => subindices[k].bounded);
  const value = eligible && dominant ? subindices[dominant].value : null;
  return {
    status: eligible ? (bounded ? 'LOWER_BOUND' : 'AVAILABLE') : 'UNAVAILABLE',
    value,
    category: value != null ? aqiCategory(value) : null,
    dominant_pollutant: eligible && !bounded ? dominant : null,
    reason: eligible
      ? null
      : ozoneUnsupported
        ? 'Ozone requires the separate one-hour rule; overall AQI withheld'
        : 'Requires at least three eligible pollutants including PM2.5 or PM10',
    subindices,
    excluded,
    period_end: new Date(end).toISOString(),
    method,
  };
}
