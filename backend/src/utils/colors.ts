import type { Pollutant, RiskLevel } from '../types';

export type RGB = [number, number, number];

/** Pollution ramp stops (value fraction 0..1 → colour). */
const POLLUTION_STOPS: [number, RGB][] = [
  [0.0, [34, 197, 94]], // green
  [0.25, [163, 230, 53]], // lime
  [0.45, [250, 204, 21]], // yellow
  [0.65, [249, 115, 22]], // orange
  [0.85, [239, 68, 68]], // red
  [1.0, [168, 35, 110]], // magenta
];

const DELTA_NEG: RGB = [56, 189, 248];
const DELTA_ZERO: RGB = [30, 41, 59];
const DELTA_POS: RGB = [244, 63, 94];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function ramp(stops: [number, RGB][], t: number): RGB {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (x <= t1) {
      const u = (x - t0) / (t1 - t0);
      return [lerp(c0[0], c1[0], u), lerp(c0[1], c1[1], u), lerp(c0[2], c1[2], u)];
    }
  }
  return stops[stops.length - 1][1];
}

/** Display ranges per pollutant (for colour scaling only). */
export const POLLUTANT_RANGE: Record<Pollutant, [number, number]> = {
  pm25: [15, 120],
  pm10: [30, 200],
  no2: [10, 90],
  so2: [2, 40],
  co: [0.3, 2.5],
  o3: [20, 90],
};

export const POLLUTANT_LABEL: Record<Pollutant, string> = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  no2: 'NO₂',
  so2: 'SO₂',
  co: 'CO',
  o3: 'O₃',
};

export const POLLUTANT_UNIT: Record<Pollutant, string> = {
  pm25: 'µg/m³',
  pm10: 'µg/m³',
  no2: 'µg/m³',
  so2: 'µg/m³',
  co: 'mg/m³',
  o3: 'µg/m³',
};

export function pollutionColor(p: Pollutant, v: number): RGB {
  const [lo, hi] = POLLUTANT_RANGE[p];
  return ramp(POLLUTION_STOPS, (v - lo) / (hi - lo));
}

/** Diverging colour for scenario deltas; `scale` = magnitude at full saturation. */
export function deltaColor(d: number, scale: number): RGB {
  const t = Math.max(-1, Math.min(1, d / scale));
  if (t < 0) {
    const u = -t;
    return [lerp(DELTA_ZERO[0], DELTA_NEG[0], u), lerp(DELTA_ZERO[1], DELTA_NEG[1], u), lerp(DELTA_ZERO[2], DELTA_NEG[2], u)];
  }
  return [lerp(DELTA_ZERO[0], DELTA_POS[0], t), lerp(DELTA_ZERO[1], DELTA_POS[1], t), lerp(DELTA_ZERO[2], DELTA_POS[2], t)];
}

export const RISK_COLOR: Record<RiskLevel, string> = {
  LOW: '#22c55e',
  MODERATE: '#facc15',
  HIGH: '#f97316',
  VERY_HIGH: '#ef4444',
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  LOW: 'Low',
  MODERATE: 'Moderate',
  HIGH: 'High',
  VERY_HIGH: 'Very high',
};

/** PM2.5 (24h µg/m³) → risk band, aligned to Indian NAQI breakpoints (Good / Satisfactory / Moderate / Poor+). */
export function riskFromPm25(v: number): RiskLevel {
  if (v <= 30) return 'LOW';
  if (v <= 60) return 'MODERATE';
  if (v <= 90) return 'HIGH';
  return 'VERY_HIGH';
}

export function rgbToCss([r, g, b]: RGB, a = 1): string {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

export const SOURCE_COLORS = {
  traffic: '#f59e0b',
  industry: '#a78bfa',
  background: '#64748b',
  other: '#2dd4bf',
} as const;

export const SOURCE_LABELS = {
  traffic: 'Traffic',
  industry: 'Industry',
  background: 'Regional background',
  other: 'Other (dust / residential)',
} as const;
