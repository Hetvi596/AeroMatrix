// ============================================================================
// DEMO DATA PROVIDER — the single source of all prototype environmental values.
//
// Every number produced here is DEMO / SIMULATED. It is deterministic (seeded)
// and reproducible. Nothing here is a CPCB observation, ERA5 reanalysis, or a
// measured traffic count. Replace this provider with real adapters (see
// src/services/dataProvider.ts) when datasets are available.
// ============================================================================

import type { BaseState, BBox, CityGeometry, DataStatus, GreenArea, GridCell, LonLat, Pollutant, Road, TimePoint, Weather } from '../../types';
import {
  bboxContains,
  bboxOf,
  cellAreaKm2,
  distanceToBBoxKm,
  distanceToPathKm,
  haversineKm,
  pointInPolygon,
} from '../../utils/geo';
import { hashSeed, mulberry32 } from '../../utils/prng';
import { DEMO_GEOMETRY, DEMO_GREEN_AREAS, PUNE, URBAN_CENTRES } from '../geojson/puneDemoGeometry';

export const DEMO_STATUS: DataStatus = 'DEMO';

/** Demo meteorology — a typical post-monsoon Pune day. Placeholder for ERA5. */
export const DEMO_WEATHER: Weather = {
  temperature: 27,
  windSpeed: 2.4,
  windDirection: 290, // from WNW
  humidity: 58,
  rainfall: 0,
  pressure: 1009,
};

export interface DemoBuilding {
  id: string;
  position: LonLat;
  width: number; // m
  depth: number; // m
  height: number; // m
  rotation: number; // radians
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function urbanness(p: LonLat): number {
  let u = 0;
  for (const c of URBAN_CENTRES) {
    u = Math.max(u, c.weight * Math.exp(-haversineKm(p, c.loc) / 3.2));
  }
  return u;
}

type IndexedPolygon = { polygon: LonLat[]; bbox: BBox };

function indexPolygons(areas: GreenArea[]): IndexedPolygon[] {
  return areas.map((a) => ({ polygon: a.polygon, bbox: bboxOf([a.polygon]) }));
}

/** Fraction of a cell covered by the given polygons (7×7 point sampling). */
function coverFraction(bounds: GridCell['bounds'], polys: IndexedPolygon[]): number {
  const local = polys.filter(
    (p) => p.bbox.east >= bounds.west && p.bbox.west <= bounds.east && p.bbox.north >= bounds.south && p.bbox.south <= bounds.north,
  );
  if (!local.length) return 0;
  const n = 7;
  let hits = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p: LonLat = [
        bounds.west + ((i + 0.5) / n) * (bounds.east - bounds.west),
        bounds.south + ((j + 0.5) / n) * (bounds.north - bounds.south),
      ];
      if (local.some((g) => bboxContains(g.bbox, p) && pointInPolygon(p, g.polygon))) hits++;
    }
  }
  return hits / (n * n);
}

/**
 * Traffic from real road networks: class-weighted road length per km² in a
 * slightly expanded cell, saturated to 0-90. Roads are sampled every ~100 m.
 * Returns per-cell, per-road contributions.
 */
function roadDensityTraffic(cells: { id: string; bounds: BBox }[], roads: Road[]): Map<string, Record<string, number>> {
  const STEP_KM = 0.1;
  const D0 = 2.2; // weighted km / km² at which traffic reaches ~63 % of max
  const perCell = new Map<string, Record<string, number>>(cells.map((c) => [c.id, {}]));
  const expanded = cells.map((c) => {
    const dx = (c.bounds.east - c.bounds.west) * 0.15;
    const dy = (c.bounds.north - c.bounds.south) * 0.15;
    return { id: c.id, b: { west: c.bounds.west - dx, east: c.bounds.east + dx, south: c.bounds.south - dy, north: c.bounds.north + dy } };
  });
  for (const road of roads) {
    const w = road.volume / 100;
    for (const path of road.paths) {
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        const segKm = haversineKm(a, b);
        const n = Math.max(1, Math.round(segKm / STEP_KM));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const p: LonLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          // Expanded bounds overlap neighbours, so a sample can count for up to 4 cells.
          for (const e of expanded) {
            if (!bboxContains(e.b, p)) continue;
            const rec = perCell.get(e.id)!;
            rec[road.id] = (rec[road.id] ?? 0) + (w * segKm) / n;
          }
        }
      }
    }
  }
  // Convert weighted length → traffic index, apportioned to roads.
  for (const c of cells) {
    const rec = perCell.get(c.id)!;
    const ex = expanded.find((e) => e.id === c.id)!.b;
    const area = cellAreaKm2(ex);
    const total = Object.values(rec).reduce((s, v) => s + v, 0);
    const traffic = 90 * (1 - Math.exp(-total / area / D0));
    for (const k of Object.keys(rec)) {
      rec[k] = total > 0 ? (traffic * rec[k]) / total : 0;
      if (rec[k] < 0.3) delete rec[k];
    }
  }
  return perCell;
}

export function cellIdFor(index: number, total: number): string {
  const digits = String(total).length;
  return `A-${String(index + 1).padStart(Math.max(2, digits), '0')}`;
}

function cellBounds(gridSize: number, row: number, col: number): BBox {
  const { bbox } = PUNE;
  const dLon = (bbox.east - bbox.west) / gridSize;
  const dLat = (bbox.north - bbox.south) / gridSize;
  return {
    west: bbox.west + col * dLon,
    east: bbox.west + (col + 1) * dLon,
    north: bbox.north - row * dLat,
    south: bbox.north - (row + 1) * dLat,
  };
}

export function buildGrid(gridSize: number, geo: CityGeometry = DEMO_GEOMETRY): GridCell[] {
  const total = gridSize * gridSize;
  const cells: GridCell[] = [];
  const greenIdx = indexPolygons(geo.greenAreas);
  const industrialIdx = indexPolygons(geo.industrialAreas);
  const skeleton = Array.from({ length: total }, (_, index) => ({
    id: cellIdFor(index, total),
    bounds: cellBounds(gridSize, Math.floor(index / gridSize), index % gridSize),
  }));
  const osmTraffic = geo.source === 'osm' ? roadDensityTraffic(skeleton, geo.roads) : null;
  const roadBoxes = geo.roads.map((r) => bboxOf(r.paths));

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const index = row * gridSize + col;
      const { id, bounds } = skeleton[index];
      const rng = mulberry32(hashSeed(`cell-${gridSize}-${index}`));
      const center: LonLat = [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2];

      // Traffic — OSM: road-length density; demo: decay with distance from each corridor.
      let trafficByRoad: Record<string, number> = {};
      let corridorSum = 0;
      if (osmTraffic) {
        trafficByRoad = osmTraffic.get(id)!;
        corridorSum = Object.values(trafficByRoad).reduce((s, v) => s + v, 0);
      } else {
        geo.roads.forEach((road, ri) => {
          if (distanceToBBoxKm(center, roadBoxes[ri]) > 5) return;
          const d = Math.min(...road.paths.map((p) => distanceToPathKm(center, p)));
          const v = road.volume * 0.72 * Math.exp(-d / 0.85);
          if (v > 0.5) {
            trafficByRoad[road.id] = v;
            corridorSum += v;
          }
        });
      }
      const u = urbanness(center);
      const localTraffic = 6 + 24 * u + rng() * 4;
      const maxCorridor = 100 - localTraffic;
      if (corridorSum > maxCorridor) {
        const k = maxCorridor / corridorSum;
        for (const key of Object.keys(trafficByRoad)) trafficByRoad[key] *= k;
      }

      const gf = coverFraction(bounds, greenIdx);
      const indFrac = industrialIdx.length ? coverFraction(bounds, industrialIdx) : 0;
      const greenCover = clamp(gf * 85 + (1 - u) * 22 + rng() * 6 + 4, 3, 92);
      const buildingDensity = clamp(0.08 + 0.8 * u - gf * 0.55 + (rng() - 0.5) * 0.08, 0.04, 0.95);
      const avgBuildingHeight = clamp(7 + 32 * u + (rng() - 0.5) * 8, 5, 60);
      const area = cellAreaKm2(bounds);
      const population = Math.round(area * (1500 + 24000 * u) * (1 - gf * 0.85));

      const nearIndustry =
        geo.source === 'osm' ? indFrac >= 0.12 : geo.industries.some((ind) => haversineKm(center, ind.location) < 1.4);
      const landUse: GridCell['landUse'] = nearIndustry
        ? 'Industrial'
        : gf > 0.3
          ? 'Green / hills'
          : u > 0.7
            ? 'Urban core'
            : u > 0.35
              ? 'Residential'
              : 'Mixed';

      cells.push({
        id,
        index,
        row,
        col,
        bounds,
        center,
        trafficByRoad,
        localTraffic,
        greenCover,
        buildingDensity,
        avgBuildingHeight,
        population,
        landUse,
      });
    }
  }
  return cells;
}

export function getDemoBaseState(gridSize = 10, geo: CityGeometry = DEMO_GEOMETRY): BaseState {
  return {
    city: PUNE,
    gridSize,
    cells: buildGrid(gridSize, geo),
    roads: geo.roads,
    industries: geo.industries,
    greenAreas: geo.greenAreas,
    industrialAreas: geo.industrialAreas,
    geometrySource: geo.source,
    weather: { ...DEMO_WEATHER },
    status: DEMO_STATUS,
  };
}

/** Procedural building massing (DEMO) — lightweight stand-in for OSM buildings. */
export function getDemoBuildings(): DemoBuilding[] {
  const cells = buildGrid(20); // finer sampling for building placement
  const out: DemoBuilding[] = [];
  for (const cell of cells) {
    if (cell.buildingDensity < 0.3) continue;
    const rng = mulberry32(hashSeed(`bld-${cell.id}`));
    const n = Math.round(cell.buildingDensity * 9);
    for (let i = 0; i < n; i++) {
      const p: LonLat = [
        cell.bounds.west + rng() * (cell.bounds.east - cell.bounds.west),
        cell.bounds.south + rng() * (cell.bounds.north - cell.bounds.south),
      ];
      if (DEMO_GREEN_AREAS.some((g) => pointInPolygon(p, g.polygon))) continue;
      const tall = rng() < 0.18;
      out.push({
        id: `B-${cell.id}-${i}`,
        position: p,
        width: 50 + rng() * 90,
        depth: 40 + rng() * 70,
        height: cell.avgBuildingHeight * (0.5 + rng() * 1.1) * (tall ? 2.4 : 1),
        rotation: rng() * Math.PI,
      });
    }
  }
  return out;
}

export type TimeRange = '24h' | '7d' | '30d';

/**
 * Demo time series around a reference value. Deterministic per (cell, pollutant, range).
 * Diurnal pattern: morning and evening traffic peaks, afternoon mixing-height dip.
 */
export function getDemoTimeSeries(key: string, pollutant: Pollutant, reference: number, range: TimeRange): TimePoint[] {
  const rng = mulberry32(hashSeed(`ts-${key}-${pollutant}-${range}`));
  const now = new Date('2026-09-29T12:00:00+05:30');
  const points: TimePoint[] = [];
  const diurnal = (h: number) =>
    1 + 0.28 * Math.exp(-((h - 9) ** 2) / 6) + 0.38 * Math.exp(-((h - 21) ** 2) / 8) - 0.22 * Math.exp(-((h - 15) ** 2) / 10);

  if (range === '24h') {
    for (let i = 23; i >= 0; i--) {
      const t = new Date(now.getTime() - i * 3600_000);
      const h = t.getHours();
      const v = reference * diurnal(h) * (0.92 + rng() * 0.16);
      points.push({ t: `${String(h).padStart(2, '0')}:00`, value: Math.max(0, v) });
    }
  } else {
    const days = range === '7d' ? 7 : 30;
    let drift = 0;
    for (let i = days - 1; i >= 0; i--) {
      const t = new Date(now.getTime() - i * 86400_000);
      drift = drift * 0.7 + (rng() - 0.5) * 0.25;
      const weekly = t.getDay() === 0 ? 0.86 : 1;
      const v = reference * weekly * (1 + drift);
      points.push({ t: `${t.getDate()}/${t.getMonth() + 1}`, value: Math.max(0, v) });
    }
  }
  return points;
}
