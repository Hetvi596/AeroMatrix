// Fetches the OpenStreetMap features used by the twin (major roads, green areas,
// industrial zones) for the Pune analysis area and saves a compact snapshot to
// public/data/pune-osm-snapshot.json. The app processes it with the same code as
// a live Overpass download (src/services/osmGeometry.ts).
//
// Usage:  node scripts/fetch-osm-snapshot.mjs
// Data © OpenStreetMap contributors, available under the ODbL (openstreetmap.org/copyright).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BBOX = { south: 18.44, west: 73.74, north: 18.64, east: 73.98 }; // keep in sync with PUNE in puneDemoGeometry.ts
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const KEEP_TAGS = ['highway', 'name', 'ref', 'leisure', 'landuse', 'natural', 'industrial', 'product'];

const bb = `(${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east})`;
const query = `[out:json][timeout:120];
(
  way["highway"~"^(motorway|trunk|primary|secondary)$"]${bb};
  way["leisure"~"^(park|garden|nature_reserve)$"]${bb};
  way["landuse"~"^(forest|grass|meadow|recreation_ground)$"]${bb};
  way["natural"~"^(wood|scrub|grassland)$"]${bb};
  way["landuse"="industrial"]${bb};
);
out tags geom;`;

async function fetchOverpass() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const url of ENDPOINTS) {
      try {
        process.stdout.write(`→ ${new URL(url).host} (attempt ${attempt})… `);
        const r = await fetch(url, {
          method: 'POST',
          body: new URLSearchParams({ data: query }),
          headers: { 'User-Agent': 'ENR01-urban-digital-twin/0.1 (snapshot script)', Accept: 'application/json' },
          signal: AbortSignal.timeout(150_000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();
        console.log(`ok (${json.elements.length} elements)`);
        return json;
      } catch (e) {
        console.log(`failed: ${e.message}`);
      }
    }
    await new Promise((res) => setTimeout(res, 20_000 * attempt));
  }
  throw new Error('All Overpass endpoints failed — try again later.');
}

const json = await fetchOverpass();
// Compact form: [id, tags, [[lon,lat],…]] with coordinates rounded to ~1 m.
const ways = json.elements
  .filter((e) => e.type === 'way' && e.geometry?.length >= 2)
  .map((e) => [
    e.id,
    Object.fromEntries(Object.entries(e.tags ?? {}).filter(([k]) => KEEP_TAGS.includes(k))),
    e.geometry.map((g) => [Math.round(g.lon * 1e5) / 1e5, Math.round(g.lat * 1e5) / 1e5]),
  ]);

const out = {
  attribution: '© OpenStreetMap contributors — ODbL 1.0 (https://www.openstreetmap.org/copyright)',
  source: 'Overpass API',
  bbox: BBOX,
  fetchedAt: new Date().toISOString(),
  ways,
};
const file = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data/pune-osm-snapshot.json');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out));
console.log(`saved ${ways.length} ways → ${file} (${(JSON.stringify(out).length / 1e6).toFixed(2)} MB)`);
