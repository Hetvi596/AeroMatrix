// Industrial geography for the twin: MIDC estates, mapped OSM industry sites,
// TERI/ARAI fuel emission factors, the 2021 district inventory and ERA5 weather
// cases. Built by scripts/build-industry-data.mjs from the AeroMatrix industry
// scenario dataset. Location, plot-status and source-factor data only — the
// dataset holds no facility-level emissions, and none are invented here.

import type { GridCell, Industry, LonLat, Weather } from '../types';
import { haversineKm } from '../utils/geo';

export interface IndustrialArea {
  code: number;
  name: string;
  category: string | null;
  fieldType: string | null;
  district: string | null;
  /** Published MIDC area (hectares; matches mapped polygon area for most estates). */
  areaHa: number | null;
  mappedAreaHa: number;
  plots: {
    total: number | null;
    industrial: number | null;
    residential: number | null;
    commercial: number | null;
    allotted: number | null;
    vacant: number | null;
    encroached: number | null;
  } | null;
  centroid: LonLat;
  bbox: { west: number; south: number; east: number; north: number };
  analysisArea: 'inside' | 'partial' | 'outside';
  era5: boolean;
  geometry: { type: 'MultiPolygon'; coordinates: LonLat[][][] };
}

export interface IndustrySite {
  id: string;
  name: string | null;
  kind: string | null;
  operator: string | null;
  location: LonLat;
  midcCode: number | null;
  inAnalysisArea: boolean;
}

export interface EmissionFactor {
  fuel: string;
  /** Source denominator, e.g. "kg/tonnes", "kg/KL", "kg/m3". */
  denominator: string;
  kgPerUnit: Record<'pm10' | 'pm25' | 'so2' | 'nox' | 'co' | 'nmvoc', number | null>;
}

export interface DistrictSector {
  code: string;
  sector: string;
  tonnesPerYear: Record<'pm10' | 'pm25' | 'so2' | 'nox' | 'co' | 'nmvoc', number | null>;
}

export interface WeatherCase {
  areaCode: number;
  areaName: string;
  era5Grid: LonLat;
  season: string;
  label: string;
  hours: number;
  weather: Pick<Weather, 'temperature' | 'humidity' | 'windSpeed' | 'windDirection' | 'rainfall' | 'pressure'>;
}

export interface IndustryData {
  version: number;
  builtAt: string;
  provenance: Record<string, string | number | null>;
  counts: Record<string, number>;
  warnings: string[];
  areas: IndustrialArea[];
  sites: IndustrySite[];
  emissionFactors: EmissionFactor[];
  districtEmissions: DistrictSector[];
  weatherCases: WeatherCase[];
}

let cached: Promise<IndustryData> | null = null;

/** Loads the processed dataset once per session. */
export function loadIndustryData(): Promise<IndustryData> {
  if (!cached) {
    cached = fetch('/data/industry/industry_data.json')
      .then((r) => {
        if (!r.ok) throw new Error(`Industry data: HTTP ${r.status}`);
        return r.json() as Promise<IndustryData>;
      })
      .catch((e) => {
        cached = null; // allow a retry
        throw e;
      });
  }
  return cached;
}

// --------------------------------------------------------------- geometry

function inRing([x, y]: LonLat, ring: LonLat[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function pointInArea(p: LonLat, area: IndustrialArea): boolean {
  const b = area.bbox;
  if (p[0] < b.west || p[0] > b.east || p[1] < b.south || p[1] > b.north) return false;
  return area.geometry.coordinates.some((poly) => inRing(p, poly[0]) && !poly.slice(1).some((h) => inRing(p, h)));
}

/**
 * A point of the estate inside `box` (the analysis grid): its centroid when that is inside,
 * otherwise the in-box point of the estate nearest the centroid. Null when no part is inside.
 */
export function candidatePoint(area: IndustrialArea, box: { west: number; south: number; east: number; north: number }): LonLat | null {
  const inBox = ([x, y]: LonLat) => x >= box.west && x <= box.east && y >= box.south && y <= box.north;
  if (inBox(area.centroid) && pointInArea(area.centroid, area)) return area.centroid;
  const w = Math.max(area.bbox.west, box.west), e = Math.min(area.bbox.east, box.east);
  const s = Math.max(area.bbox.south, box.south), n = Math.min(area.bbox.north, box.north);
  if (w >= e || s >= n) return null;
  const N = 32;
  let best: LonLat | null = null;
  let bestD = Infinity;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const p: LonLat = [w + ((e - w) * (i + 0.5)) / N, s + ((n - s) * (j + 0.5)) / N];
      if (!pointInArea(p, area)) continue;
      const d = (p[0] - area.centroid[0]) ** 2 + (p[1] - area.centroid[1]) ** 2;
      if (d < bestD) (bestD = d), (best = p);
    }
  return best;
}

/** Distance from a point to a segment, km (local equirectangular; fine at city scale). */
function segmentKm(p: LonLat, a: LonLat, b: LonLat): number {
  const kx = 111.32 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 110.57;
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** 0 inside the estate, otherwise the distance to its nearest boundary, km. */
export function distanceToAreaKm(p: LonLat, area: IndustrialArea): number {
  if (pointInArea(p, area)) return 0;
  let best = Infinity;
  for (const poly of area.geometry.coordinates)
    for (const ring of poly) for (let i = 1; i < ring.length; i++) best = Math.min(best, segmentKm(p, ring[i - 1], ring[i]));
  return best;
}

/** Scenario footprint: an estate polygon, or a circle around a mapped site. */
export type IndustrialTarget =
  | { kind: 'area'; area: IndustrialArea }
  | { kind: 'site'; site: IndustrySite; radiusKm: number };

/** Buffer around an estate boundary within which a modeled source counts as part of it. */
export const AREA_BUFFER_KM = 1;
/** Radius of the cluster around a selected mapped site. */
export const SITE_RADIUS_KM = 1;

export interface AffectedSource {
  industry: Industry;
  /** 0 = inside the estate; for sites, distance from the selected site. */
  distanceKm: number;
}

/** Modeled sources (scenario engine) that a target covers, nearest first. */
export function modeledSourcesFor(target: IndustrialTarget, industries: Industry[]): AffectedSource[] {
  const out: AffectedSource[] = [];
  for (const industry of industries) {
    const d =
      target.kind === 'area' ? distanceToAreaKm(industry.location, target.area) : haversineKm(industry.location, target.site.location);
    const limit = target.kind === 'area' ? AREA_BUFFER_KM : target.radiusKm;
    if (d <= limit) out.push({ industry, distanceKm: d });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

export function sitesInArea(area: IndustrialArea, sites: IndustrySite[]): IndustrySite[] {
  return sites.filter((s) => s.midcCode === area.code);
}

export function sitesNear(p: LonLat, sites: IndustrySite[], radiusKm: number): IndustrySite[] {
  return sites.filter((s) => haversineKm(s.location, p) <= radiusKm);
}

export function sitesInCell(cell: GridCell, sites: IndustrySite[]): IndustrySite[] {
  const b = cell.bounds;
  return sites.filter((s) => s.location[0] >= b.west && s.location[0] <= b.east && s.location[1] >= b.south && s.location[1] <= b.north);
}

/** Estates whose polygon overlaps a grid cell (cell corner/centre inside, or estate vertex inside the cell). */
export function areasInCell(cell: GridCell, areas: IndustrialArea[]): IndustrialArea[] {
  const b = cell.bounds;
  const probes: LonLat[] = [cell.center, [b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north]];
  return areas.filter((a) => {
    if (a.bbox.east < b.west || a.bbox.west > b.east || a.bbox.north < b.south || a.bbox.south > b.north) return false;
    if (probes.some((p) => pointInArea(p, a))) return true;
    return a.geometry.coordinates.some((poly) => poly[0].some(([x, y]) => x >= b.west && x <= b.east && y >= b.south && y <= b.north));
  });
}

export function nearestArea(p: LonLat, areas: IndustrialArea[]): { area: IndustrialArea; distanceKm: number } | null {
  let best: { area: IndustrialArea; distanceKm: number } | null = null;
  for (const area of areas) {
    const d = distanceToAreaKm(p, area);
    if (!best || d < best.distanceKm) best = { area, distanceKm: d };
  }
  return best;
}

// ------------------------------------------------------- emissions maths

/** Unit label for a fuel quantity from the source denominator ("kg/KL" → "kL"). */
export function fuelUnit(denominator: string): string {
  const unit = denominator.split('/')[1] ?? '';
  return { tonnes: 'tonnes', KL: 'kL', m3: 'm³' }[unit] ?? unit;
}

/**
 * Emitted mass from fuel use and a source emission factor: kg = quantity × kg/unit.
 * Returns null where the source table has no factor. This is emitted mass, not an
 * ambient concentration — converting it needs a dispersion model and stack data.
 */
export function emittedKg(factor: EmissionFactor, quantity: number): Record<keyof EmissionFactor['kgPerUnit'], number | null> {
  const out = {} as Record<keyof EmissionFactor['kgPerUnit'], number | null>;
  for (const [k, v] of Object.entries(factor.kgPerUnit) as [keyof EmissionFactor['kgPerUnit'], number | null][]) {
    out[k] = v == null || !Number.isFinite(quantity) ? null : v * quantity;
  }
  return out;
}
