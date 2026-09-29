// Open DEM terrain without credentials: AWS "Terrarium" elevation tiles
// (Mapzen/Tilezen, derived from SRTM & other open DEMs) decoded into a Cesium
// CustomHeightmapTerrainProvider. With a Cesium ion token, Cesium World Terrain
// is used instead (see TwinMap).

import { Credit, CustomHeightmapTerrainProvider, WebMercatorTilingScheme } from 'cesium';
import type { LonLat } from '../types';

const TILE_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const MAX_Z = 14;
const SAMPLES = 65;
const TILE_PX = 256;

const cache = new Map<string, Promise<Float32Array | null>>();
let canvas: HTMLCanvasElement | null = null;

function decode(img: ImageBitmap): Float32Array {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = TILE_PX;
    canvas.height = TILE_PX;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.clearRect(0, 0, TILE_PX, TILE_PX);
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, TILE_PX, TILE_PX);
  const out = new Float32Array(TILE_PX * TILE_PX);
  for (let i = 0; i < out.length; i++) {
    out[i] = data[i * 4] * 256 + data[i * 4 + 1] + data[i * 4 + 2] / 256 - 32768;
  }
  return out;
}

export function loadTerrariumTile(z: number, x: number, y: number): Promise<Float32Array | null> {
  const key = `${z}/${x}/${y}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // LRU bump
    return hit;
  }
  const p = fetch(TILE_URL(z, x, y))
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.blob();
    })
    .then((b) => createImageBitmap(b))
    .then((img) => decode(img))
    .catch(() => null);
  cache.set(key, p);
  if (cache.size > 400) cache.delete(cache.keys().next().value!);
  return p;
}

function sample(tile: Float32Array, u: number, v: number): number {
  const x = Math.max(0, Math.min(TILE_PX - 1.001, u));
  const y = Math.max(0, Math.min(TILE_PX - 1.001, v));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * TILE_PX + x0;
  const a = tile[i];
  const b = tile[i + 1];
  const c = tile[i + TILE_PX];
  const d = tile[i + TILE_PX + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

export function createTerrariumTerrainProvider(): CustomHeightmapTerrainProvider {
  return new CustomHeightmapTerrainProvider({
    width: SAMPLES,
    height: SAMPLES,
    tilingScheme: new WebMercatorTilingScheme(),
    credit: new Credit('Terrain: AWS Terrain Tiles (Tilezen/Mapzen, SRTM & open DEMs)'),
    callback: async (x, y, level) => {
      let z = level;
      let tx = x;
      let ty = y;
      let sub = 1;
      let ox = 0;
      let oy = 0;
      if (level > MAX_Z) {
        const d = level - MAX_Z;
        sub = 2 ** d;
        tx = x >> d;
        ty = y >> d;
        ox = x - tx * sub;
        oy = y - ty * sub;
        z = MAX_Z;
      }
      const out = new Float32Array(SAMPLES * SAMPLES);
      const tile = await loadTerrariumTile(z, tx, ty);
      if (!tile) return out;
      for (let j = 0; j < SAMPLES; j++) {
        const v = ((oy + j / (SAMPLES - 1)) / sub) * TILE_PX;
        for (let i = 0; i < SAMPLES; i++) {
          const u = ((ox + i / (SAMPLES - 1)) / sub) * TILE_PX;
          out[j * SAMPLES + i] = Math.max(0, sample(tile, u, v));
        }
      }
      return out;
    },
  });
}

/** Elevation (m) at points, using zoom-12 Terrarium tiles (≈30 m). Used to seat 3D objects on terrain. */
export async function sampleElevations(points: LonLat[], z = 12): Promise<number[]> {
  const n = 2 ** z;
  return Promise.all(
    points.map(async ([lon, lat]) => {
      const xf = ((lon + 180) / 360) * n;
      const latR = (lat * Math.PI) / 180;
      const yf = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
      const tx = Math.floor(xf);
      const ty = Math.floor(yf);
      const tile = await loadTerrariumTile(z, tx, ty);
      if (!tile) return 0;
      return Math.max(0, sample(tile, (xf - tx) * TILE_PX, (yf - ty) * TILE_PX));
    }),
  );
}
