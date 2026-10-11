// Builds public/data/industry/industry_data.json from the AeroMatrix industry
// scenario dataset (MIDC areas, OSM industry points, TERI/ARAI emission factors,
// 2021 district inventory, ERA5 hourly weather).
//
// Usage:  node scripts/build-industry-data.mjs [rawDir]
//   rawDir defaults to data/industry_scenario (git-ignored raw copy of
//   AeroMatrix_Scenario_Data). The output is small and committed.
//
// Nothing is invented: records keep their source fields and provenance, missing
// values stay null, and no emissions are assigned to estates or sites.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(process.argv[2] ?? resolve(ROOT, 'data/industry_scenario'));
const OUT = resolve(ROOT, 'public/data/industry/industry_data.json');

const read = (p) => readFileSync(resolve(RAW, p), 'utf8').replace(/^﻿/, '');
const json = (p) => JSON.parse(read(p));

/** Minimal RFC-4180 CSV parser (quoted fields, commas). */
function csv(p) {
  const text = read(p);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(field), (field = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) row.push(field), rows.push(row);
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

// --- Analysis area: read from the app's city config so the two never drift ---
const geoSrc = readFileSync(resolve(ROOT, 'src/data/geojson/puneDemoGeometry.ts'), 'utf8');
const m = geoSrc.match(/bbox:\s*\{\s*west:\s*([\d.]+),\s*south:\s*([\d.]+),\s*east:\s*([\d.]+),\s*north:\s*([\d.]+)/);
if (!m) throw new Error('Could not read PUNE.bbox from puneDemoGeometry.ts');
const BBOX = { west: +m[1], south: +m[2], east: +m[3], north: +m[4] };
// Plausibility window for Pune district coordinates (rejects swapped / projected values).
const PUNE_DISTRICT = { west: 73.3, south: 17.9, east: 75.2, north: 19.4 };
const inBox = ([x, y], b) => x >= b.west && x <= b.east && y >= b.south && y <= b.north;

// --- Geometry helpers ---
const toKm = (lat) => [111.32 * Math.cos((lat * Math.PI) / 180), 110.57];
function polygons(g) {
  return g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
}
function inRing([x, y], ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function inPolygons(p, polys) {
  return polys.some((poly) => inRing(p, poly[0]) && !poly.slice(1).some((h) => inRing(p, h)));
}
function ringAreaHa(r) {
  const [kx, ky] = toKm(r.reduce((s, q) => s + q[1], 0) / r.length);
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * kx * (r[i][1] * ky) - r[i][0] * kx * (r[j][1] * ky);
  return (Math.abs(s) / 2) * 100; // km² → ha
}
function areaHa(polys) {
  return polys.reduce((a, poly) => a + ringAreaHa(poly[0]) - poly.slice(1).reduce((h, r) => h + ringAreaHa(r), 0), 0);
}
function bboxOf(polys) {
  const b = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
  for (const poly of polys) for (const [x, y] of poly[0]) {
    b.west = Math.min(b.west, x); b.east = Math.max(b.east, x);
    b.south = Math.min(b.south, y); b.north = Math.max(b.north, y);
  }
  return b;
}
/** Area-weighted centroid of the outer rings; falls back to the largest ring's vertex if it lands outside. */
function centroid(polys) {
  let ax = 0, ay = 0, aw = 0;
  for (const poly of polys) {
    const r = poly[0];
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
      a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f;
    }
    if (Math.abs(a) < 1e-14) continue;
    ax += cx / 3; ay += cy / 3; aw += a;
  }
  const c = [ax / aw, ay / aw];
  if (inPolygons(c, polys)) return c;
  // Representative point: interior sample nearest the centroid.
  const b = bboxOf(polys);
  let best = polys[0][0][0];
  let bd = Infinity;
  for (let i = 1; i < 30; i++) for (let k = 1; k < 30; k++) {
    const q = [b.west + ((b.east - b.west) * i) / 30, b.south + ((b.north - b.south) * k) / 30];
    if (!inPolygons(q, polys)) continue;
    const d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2;
    if (d < bd) (bd = d), (best = q);
  }
  return best;
}
/** Douglas–Peucker in local metres; keeps rings closed and ≥ 4 points. */
function simplifyRing(ring, tolM) {
  const [kx, ky] = toKm(ring[0][1]);
  const P = ring.map(([x, y]) => [x * kx * 1000, y * ky * 1000]);
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let idx = -1, dmax = 0;
    const [ax, ay] = P[a], [bx, by] = P[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * P[i][0] - dx * P[i][1] + bx * ay - by * ax) / L;
      if (d > dmax) (dmax = d), (idx = i);
    }
    if (dmax > tolM && idx > 0) (keep[idx] = 1), stack.push([a, idx], [idx, b]);
  }
  const out = ring.filter((_, i) => keep[i]).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
  return out.length >= 4 ? out : ring.map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
}
function overlapStatus(b, polys) {
  const intersects = b.west <= BBOX.east && b.east >= BBOX.west && b.south <= BBOX.north && b.north >= BBOX.south;
  if (!intersects) return 'outside';
  const allIn = polys.every((poly) => poly[0].every((q) => inBox(q, BBOX)));
  return allIn ? 'inside' : 'partial';
}

const warnings = [];

// --- 1. MIDC industrial areas (polygons) + plot summary ---
const midc = json('industrial_areas/midc_pune_district_28_areas.geojson');
const plots = csv('industrial_areas/midc_pune_zone_plot_summary.csv');
const plotsByCode = new Map();
for (const r of plots) {
  const code = Number(r.IA_Code);
  if (!plotsByCode.has(code)) plotsByCode.set(code, []);
  plotsByCode.get(code).push(r);
}
const areas = [];
const seenCodes = new Set();
for (const f of midc.features) {
  const p = f.properties;
  const code = Number(p.IA_CODE);
  if (seenCodes.has(code)) { warnings.push(`Duplicate MIDC polygon IA_CODE ${code} skipped`); continue; }
  const polys = polygons(f.geometry);
  if (!polys.length) { warnings.push(`MIDC ${code}: no polygon geometry`); continue; }
  const b = bboxOf(polys);
  if (!inBox([b.west, b.south], PUNE_DISTRICT) || !inBox([b.east, b.north], PUNE_DISTRICT)) {
    warnings.push(`MIDC ${code}: coordinates outside Pune district window; skipped`);
    continue;
  }
  seenCodes.add(code);
  const rows = plotsByCode.get(code) ?? [];
  // IA_Code 3012 has an extra boundary-less PAP subarea row; use the row whose name matches the polygon.
  const row = rows.find((r) => r.IA_Name.trim().toLowerCase() === String(p.IA_NAME).trim().toLowerCase()) ?? rows[0];
  if (rows.length > 1) warnings.push(`MIDC ${code}: ${rows.length} plot-summary rows; used "${row.IA_Name}", others share the code without a separate boundary`);
  const simplified = polys.map((poly) => poly.map((ring) => simplifyRing(ring, 6)));
  areas.push({
    code,
    name: String(p.IA_NAME).trim(),
    category: p.IA_CATEGORY_NAME || null, // "Establish" or null as published
    fieldType: row?.MIDC_Status || null, // Brown Field / Green Field
    district: p.administrative_district || null,
    areaHa: num(p.MIDC_AREA), // matches mapped polygon area in hectares (checked below)
    mappedAreaHa: +areaHa(polys).toFixed(1),
    plots: row
      ? {
          total: num(row.Total_Plots),
          industrial: num(row.Total_Industrial_Plots),
          residential: num(row.Total_Residencial_Plots),
          commercial: num(row.Total_Commercial_Plots),
          allotted: num(row.No_of_Alloted_Plots),
          vacant: num(row.No_Of_Vacant_Plots),
          encroached: num(row.No_Of_Encroachment_Plots),
        }
      : null,
    centroid: centroid(polys).map((v) => +v.toFixed(5)),
    bbox: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, +v.toFixed(5)])),
    analysisArea: overlapStatus(b, polys),
    era5: false,
    geometry: { type: 'MultiPolygon', coordinates: simplified },
  });
}
for (const a of areas) {
  if (a.areaHa && Math.abs(a.mappedAreaHa - a.areaHa) / a.areaHa > 0.08)
    warnings.push(`MIDC ${a.code} ${a.name}: published area ${a.areaHa} differs from mapped ${a.mappedAreaHa} ha by >8%`);
}

// --- 2. OSM industry points (partial snapshot) ---
const osm = json('industrial_areas/osm_industry_points_partial_551.geojson');
const osmInv = json('industrial_areas/osm_industry_points_inventory.json');
const sites = [];
const seenIds = new Set();
const seenPts = new Set();
let rejected = 0;
for (const f of osm.features) {
  const p = f.properties;
  if (f.geometry?.type !== 'Point') { rejected++; continue; }
  const [x, y] = f.geometry.coordinates;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !inBox([x, y], PUNE_DISTRICT)) { rejected++; continue; }
  const key = `${x.toFixed(6)},${y.toFixed(6)}`;
  if (seenIds.has(p.osm_id) || seenPts.has(key)) { warnings.push(`Duplicate OSM site ${p.osm_id} skipped`); continue; }
  seenIds.add(p.osm_id);
  seenPts.add(key);
  const area = areas.find((a) => inPolygons([x, y], a.geometry.coordinates));
  sites.push({
    id: p.osm_id,
    name: p.name || p['name:en'] || null,
    kind: p.industrial || p.man_made || p.building || p.landuse || null,
    operator: p.operator || null,
    location: [+x.toFixed(6), +y.toFixed(6)],
    midcCode: area ? area.code : null,
    inAnalysisArea: inBox([x, y], BBOX),
  });
}

// --- 3. Emission factors (TERI/ARAI Table 7) — units preserved, blanks stay null ---
const factorRows = csv('emissions/pune_industrial_fuel_emission_factors_teri_arai_table7.csv');
const emissionFactors = factorRows.map((r) => ({
  fuel: r.fuel_type,
  denominator: r.factor_denominator, // kg/tonnes, kg/KL, kg/m3
  kgPerUnit: { pm10: num(r.pm10_kg), pm25: num(r.pm25_kg), so2: num(r.so2_kg), nox: num(r.nox_kg), co: num(r.co_kg), nmvoc: num(r.nmvoc_kg) },
}));

// --- 4. District 2021 sector inventory (tonnes/year, district aggregate) ---
const districtEmissions = csv('emissions/pune_district_2021_sector_emissions.csv').map((r) => ({
  code: r.sector_code,
  sector: r.sector_name,
  tonnesPerYear: {
    pm10: num(r.pm10_tonnes_per_year), pm25: num(r.pm25_tonnes_per_year), so2: num(r.so2_tonnes_per_year),
    nox: num(r.nox_tonnes_per_year), co: num(r.co_tonnes_per_year), nmvoc: num(r.nmvoc_tonnes_per_year),
  },
}));

// --- 5. ERA5 seasonal weather cases per MIDC area (IMD seasons, IST days) ---
const SEASONS = [
  { id: 'winter', label: 'Winter (Dec–Feb)', months: [12, 1, 2] },
  { id: 'premonsoon', label: 'Pre-monsoon (Mar–May)', months: [3, 4, 5] },
  { id: 'monsoon', label: 'Monsoon (Jun–Sep)', months: [6, 7, 8, 9] },
  { id: 'postmonsoon', label: 'Post-monsoon (Oct–Nov)', months: [10, 11] },
];
const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};
const era = csv('weather_era5/pune_industrial_area_era5_hourly_2024_2025.csv');
const bySite = new Map();
for (const r of era) {
  const code = Number(r.ia_code);
  if (!bySite.has(code)) bySite.set(code, { name: r.industrial_area, grid: [num(r.era5_grid_longitude), num(r.era5_grid_latitude)], rows: [] });
  const t = new Date(`${r.time_utc}Z`);
  const ist = new Date(t.getTime() + 5.5 * 3600e3);
  bySite.get(code).rows.push({
    month: ist.getUTCMonth() + 1,
    day: ist.toISOString().slice(0, 10),
    temp: num(r.temperature_2m), rh: num(r.relative_humidity_2m),
    windKmh: num(r.wind_speed_10m), dir: num(r.wind_direction_10m),
    rain: num(r.precipitation), pres: num(r.pressure_msl),
  });
}
const weatherCases = [];
for (const [code, s] of bySite) {
  const area = areas.find((a) => a.code === code);
  if (area) area.era5 = true;
  for (const season of SEASONS) {
    const rows = s.rows.filter((r) => season.months.includes(r.month));
    if (!rows.length) continue;
    const daily = new Map();
    for (const r of rows) if (Number.isFinite(r.rain)) daily.set(r.day, (daily.get(r.day) ?? 0) + r.rain);
    // Vector-mean wind direction ("from"), so 350° and 10° average to 0°, not 180°.
    let sx = 0, sy = 0;
    for (const r of rows) if (Number.isFinite(r.dir)) (sx += Math.sin((r.dir * Math.PI) / 180)), (sy += Math.cos((r.dir * Math.PI) / 180));
    const dir = ((Math.atan2(sx, sy) * 180) / Math.PI + 360) % 360;
    weatherCases.push({
      areaCode: code,
      areaName: s.name,
      era5Grid: s.grid,
      season: season.id,
      label: season.label,
      hours: rows.length,
      weather: {
        temperature: +median(rows.map((r) => r.temp)).toFixed(1),
        humidity: Math.round(median(rows.map((r) => r.rh))),
        windSpeed: +(median(rows.map((r) => r.windKmh)) / 3.6).toFixed(1), // km/h → m/s
        windDirection: Math.round(dir),
        rainfall: +median([...daily.values()]).toFixed(1), // median daily total, mm
        pressure: Math.round(median(rows.map((r) => r.pres))),
      },
    });
  }
}

// --- Output ---
const manifest = json('SCENARIO_DATA_MANIFEST.json');
const out = {
  version: 1,
  builtAt: new Date().toISOString(),
  analysisBbox: BBOX,
  provenance: {
    midc: 'MIDC Pune Zone map layer 6 + industrial-area table 22 (gis.midcindia.org). Estate boundaries and plot status; not a company or emissions registry.',
    osm: `OpenStreetMap contributors (ODbL). Partial snapshot: ${osmInv.point_or_center_features ?? osm.features.length} points from 1 of 4 tiles; ${osmInv.recovery_report?.industry_osm_failed_tiles ?? 3} tiles failed. Candidate site references, not a verified factory list.`,
    emissionFactors: 'ARAI/TERI for MPCB, Emission Inventory for Pune District (2022), Table 7 p.23. Source units preserved.',
    districtEmissions: 'ARAI/TERI Pune inventory, Table 14 p.42. District aggregate tonnes/year for 2021; not allocated to estates or sites.',
    era5: 'ERA5 reanalysis via Open-Meteo, 2024–2025 hourly, 0.25° grid. Seasonal medians; modelled, not station measurements.',
    sourceManifestDatasets: manifest.datasets?.length ?? null,
  },
  counts: {
    midcAreas: areas.length,
    midcInAnalysisArea: areas.filter((a) => a.analysisArea !== 'outside').length,
    osmSites: sites.length,
    osmSitesInAnalysisArea: sites.filter((s) => s.inAnalysisArea).length,
    osmSitesInsideMidc: sites.filter((s) => s.midcCode !== null).length,
    osmRejected: rejected,
    emissionFactors: emissionFactors.length,
    weatherCases: weatherCases.length,
  },
  warnings,
  areas,
  sites,
  emissionFactors,
  districtEmissions,
  weatherCases,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(`Wrote ${OUT}`);
console.log(out.counts);
for (const w of warnings) console.log(`  note: ${w}`);
