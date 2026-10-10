// Real city geometry from OpenStreetMap (Overpass API):
//   • major roads (trunk / primary / secondary; motorway if present)
//   • green areas (parks, gardens, forests, grass, woods, scrub)
//   • industrial land-use zones
// Geometry is REAL (© OpenStreetMap contributors, ODbL). Traffic volumes are a
// DEMO proxy from road class, and emission sources placed on the largest
// industrial zones carry DEMO intensities — only their locations are real.

import type { BBox, CityGeometry, GreenArea, Industry, IndustryCategory, LonLat, Pollutant, Road } from '../types';
import { pathLengthKm, polygonAreaKm2, polygonCentroid, simplifyPath } from '../utils/geo';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/** Bundled snapshot (scripts/fetch-osm-snapshot.mjs) — works offline / when Overpass is busy. */
export const OSM_SNAPSHOT_URL = '/data/pune-osm-snapshot.json';

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)';

/** DEMO traffic-volume proxy by OSM road class (0-100). */
const CLASS_VOLUME: Record<string, number> = { motorway: 95, trunk: 88, primary: 70, secondary: 45 };
const CLASS_RANK: Record<string, number> = { motorway: 0, trunk: 1, primary: 2, secondary: 3 };
const MIN_GREEN_KM2 = 0.005; // 0.5 ha
const MIN_INDUSTRIAL_KM2 = 0.02;
const MAX_SOURCES = 12;

export function buildOverpassQuery(b: BBox): string {
  const bb = `(${b.south},${b.west},${b.north},${b.east})`;
  return `[out:json][timeout:90];
(
  way["highway"~"^(motorway|trunk|primary|secondary)$"]${bb};
  way["leisure"~"^(park|garden|nature_reserve)$"]${bb};
  way["landuse"~"^(forest|grass|meadow|recreation_ground)$"]${bb};
  way["natural"~"^(wood|scrub|grassland)$"]${bb};
  way["landuse"="industrial"]${bb};
);
out tags geom;`;
}

interface OverpassWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

export async function fetchOverpass(query: string, signal?: AbortSignal): Promise<{ elements: OverpassWay[] }> {
  const errors: string[] = [];
  for (const url of ENDPOINTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 75_000);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 429 || r.status === 504 ? ' (server busy)' : ''}`);
      return await r.json();
    } catch (e) {
      if (signal?.aborted) throw e;
      errors.push(`${new URL(url).host}: ${ctrl.signal.aborted ? 'timed out' : e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw new Error(`${errors.join('; ')}. Overpass servers are shared and sometimes busy — try again in a minute.`);
}

const key = (p: LonLat) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

/** Join ways that share endpoints into longer polylines (OSM splits roads at every junction). */
export function chainWays(ways: LonLat[][]): LonLat[][] {
  const byEnd = new Map<string, number[]>();
  ways.forEach((w, i) => {
    for (const k of [key(w[0]), key(w[w.length - 1])]) {
      const list = byEnd.get(k) ?? [];
      list.push(i);
      byEnd.set(k, list);
    }
  });
  const used = new Uint8Array(ways.length);
  const take = (k: string): number | undefined => {
    const list = byEnd.get(k);
    const i = list?.find((j) => !used[j]);
    if (i !== undefined) used[i] = 1;
    return i;
  };
  const out: LonLat[][] = [];
  for (let i = 0; i < ways.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    let line = [...ways[i]];
    for (let guard = 0; guard < ways.length; guard++) {
      const endK = key(line[line.length - 1]);
      const j = take(endK);
      if (j === undefined) break;
      const w = key(ways[j][0]) === endK ? ways[j] : [...ways[j]].reverse();
      line = line.concat(w.slice(1));
    }
    for (let guard = 0; guard < ways.length; guard++) {
      const startK = key(line[0]);
      const j = take(startK);
      if (j === undefined) break;
      const w = key(ways[j][ways[j].length - 1]) === startK ? ways[j] : [...ways[j]].reverse();
      line = w.slice(0, -1).concat(line);
    }
    out.push(line);
  }
  return out;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function guessCategory(tags: Record<string, string>): IndustryCategory {
  const t = `${tags.name ?? ''} ${tags.industrial ?? ''} ${tags.product ?? ''}`.toLowerCase();
  if (/chem|pharma|drug|paint|fertil/.test(t)) return 'Chemical';
  if (/steel|metal|forg|foundry|iron|alumin/.test(t)) return 'Metal';
  if (/power|energy|thermal|electric/.test(t)) return 'Power';
  if (/food|agro|dairy|sugar|process|textile/.test(t)) return 'Processing';
  return 'Manufacturing';
}

const CATEGORY_POLLUTANTS: Record<IndustryCategory, Pollutant[]> = {
  Manufacturing: ['pm25', 'no2'],
  Chemical: ['so2', 'no2', 'pm25'],
  Power: ['so2', 'no2', 'pm25'],
  Metal: ['pm10', 'pm25', 'so2'],
  Processing: ['pm25', 'pm10'],
};

export function processOverpass(json: { elements: OverpassWay[] }): CityGeometry {
  const roadGroups = new Map<string, { name: string; cls: string; ways: LonLat[][] }>();
  const greenAreas: GreenArea[] = [];
  const industrial: (GreenArea & { area: number; tags: Record<string, string> })[] = [];

  for (const el of json.elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
    const tags = el.tags ?? {};
    const coords: LonLat[] = el.geometry.map((g) => [g.lon, g.lat]);
    const closed = coords.length >= 4 && key(coords[0]) === key(coords[coords.length - 1]);

    if (tags.highway && CLASS_VOLUME[tags.highway] !== undefined) {
      const name = tags.name ?? tags.ref ?? '';
      const k = name ? `${tags.highway}|${name}` : `${tags.highway}|way${el.id}`;
      const g = roadGroups.get(k) ?? { name: name || `Unnamed ${tags.highway} road`, cls: tags.highway, ways: [] };
      g.ways.push(coords);
      roadGroups.set(k, g);
      continue;
    }
    if (!closed) continue;
    const poly = simplifyPath(coords.slice(0, -1), 8);
    if (poly.length < 3) continue;
    const area = polygonAreaKm2(poly);
    if (tags.landuse === 'industrial') {
      if (area >= MIN_INDUSTRIAL_KM2) {
        industrial.push({ id: `OSM-IND-${el.id}`, name: tags.name ?? 'Industrial area', polygon: poly, area, tags });
      }
    } else if (area >= MIN_GREEN_KM2) {
      const kind = tags.leisure ?? tags.landuse ?? tags.natural ?? 'green';
      greenAreas.push({ id: `OSM-G-${el.id}`, name: tags.name ?? kind.replace(/_/g, ' '), polygon: poly });
    }
  }

  const roads: Road[] = [];
  const usedIds = new Set<string>();
  for (const [k, g] of roadGroups) {
    const paths = chainWays(g.ways).map((p) => simplifyPath(p, 12)).filter((p) => p.length >= 2);
    const lengthKm = paths.reduce((a, p) => a + pathLengthKm(p), 0);
    if (lengthKm < 0.05) continue;
    // Different names can slug to the same id ("A-B Road" vs "A B Road") — keep ids unique.
    let id = `OSM-${slug(k)}`;
    for (let n = 2; usedIds.has(id); n++) id = `OSM-${slug(k)}-${n}`;
    usedIds.add(id);
    roads.push({
      id,
      name: g.name,
      volume: CLASS_VOLUME[g.cls],
      paths,
      roadClass: g.cls,
      lengthKm,
    });
  }
  roads.sort((a, b) => CLASS_RANK[a.roadClass!] - CLASS_RANK[b.roadClass!] || b.lengthKm! - a.lengthKm!);

  // Emission point sources on the largest industrial zones (locations real, intensities DEMO).
  industrial.sort((a, b) => b.area - a.area);
  const maxArea = industrial[0]?.area ?? 1;
  const industries: Industry[] = industrial.slice(0, MAX_SOURCES).map((z, i) => {
    const category = guessCategory(z.tags);
    return {
      id: `SRC-${String(i + 1).padStart(2, '0')}`,
      name: `${z.name === 'Industrial area' ? `Industrial zone ${i + 1}` : z.name} (OSM)`,
      category,
      location: polygonCentroid(z.polygon),
      emissionIntensity: Math.round(35 + 50 * Math.sqrt(z.area / maxArea)),
      controlEfficiency: 0.4,
      mainPollutants: CATEGORY_POLLUTANTS[category],
      emissionProfile: `OSM industrial land use, ${z.area.toFixed(2)} km² — emission intensity is a DEMO estimate from zone size`,
      status: 'DEMO',
    };
  });

  return {
    source: 'osm',
    roads,
    greenAreas,
    industrialAreas: industrial.map(({ id, name, polygon }) => ({ id, name, polygon })),
    industries,
    fetchedAt: new Date().toISOString(),
    attribution: OSM_ATTRIBUTION,
  };
}

export async function fetchOsmGeometry(bbox: BBox, signal?: AbortSignal): Promise<CityGeometry> {
  const json = await fetchOverpass(buildOverpassQuery(bbox), signal);
  const geo = processOverpass(json);
  if (!geo.roads.length) throw new Error('OpenStreetMap returned no roads for this area.');
  return geo;
}

interface OsmSnapshot {
  fetchedAt: string;
  ways: [number, Record<string, string>, LonLat[]][];
}

/** Loads the bundled OSM snapshot and processes it exactly like a live Overpass response. */
export async function loadOsmSnapshot(url = OSM_SNAPSHOT_URL): Promise<CityGeometry> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`snapshot not found (${r.status}) — run: node scripts/fetch-osm-snapshot.mjs`);
  const snap = (await r.json()) as OsmSnapshot;
  const geo = processOverpass({
    elements: snap.ways.map(([id, tags, coords]) => ({
      type: 'way' as const,
      id,
      tags,
      geometry: coords.map(([lon, lat]) => ({ lon, lat })),
    })),
  });
  return { ...geo, fetchedAt: snap.fetchedAt };
}
