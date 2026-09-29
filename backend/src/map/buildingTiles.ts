// Real 3D buildings streamed from OpenFreeMap vector tiles (OpenMapTiles schema,
// © OpenStreetMap contributors). Footprints are extruded to OSM `render_height`
// and seated on the DEM. Tiles (z14, ≈2.3 km) load around the camera when it is
// close enough for buildings to matter, and are evicted LRU-style.

import { VectorTile, classifyRings } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Math as CMath,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  Primitive,
  PrimitiveCollection,
  ShadowMode,
  type Viewer,
} from 'cesium';
import type { LonLat } from '../types';

const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const Z = 14;
const MAX_TILES_IN_VIEW = 20;
const MAX_CACHED = 48;
const MAX_ALTITUDE_M = 16000; // above ground; higher → buildings hidden
const CONCURRENCY = 4;

export interface BuildingFootprint {
  ring: LonLat[];
  height: number;
  minHeight: number;
}

interface TileEntry {
  key: string;
  primitive: Primitive | null;
  state: 'loading' | 'ready' | 'empty' | 'error';
  lastUsed: number;
  count: number;
}

function tileToLonLat(x: number, y: number, z: number, px: number, py: number, extent: number): LonLat {
  const n = 2 ** z;
  const fx = (x + px / extent) / n;
  const fy = (y + py / extent) / n;
  const lon = fx * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * fy))) * 180) / Math.PI;
  return [lon, lat];
}

export function lonLatToTile(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [x, y];
}

/** Decode the `building` layer of an MVT tile into footprints (outer rings, heights in metres). */
export function decodeBuildings(data: ArrayBuffer, x: number, y: number, z: number): BuildingFootprint[] {
  const tile = new VectorTile(new PbfReader(new Uint8Array(data)));
  const layer = tile.layers.building;
  if (!layer) return [];
  const out: BuildingFootprint[] = [];
  const ext = layer.extent;
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.type !== 3) continue;
    const props = f.properties;
    if (props.hide_3d === true) continue;
    const h = Number(props.render_height);
    const mh = Number(props.render_min_height);
    const height = Number.isFinite(h) && h > 0 ? h : 6;
    const minHeight = Number.isFinite(mh) && mh > 0 ? mh : 0;
    for (const polygon of classifyRings(f.loadGeometry())) {
      const outer = polygon[0];
      if (!outer || outer.length < 4) continue;
      // Assign each (clipped) building part to the tile containing its centroid → no duplicates.
      let cx = 0;
      let cy = 0;
      for (const p of outer) {
        cx += p.x;
        cy += p.y;
      }
      cx /= outer.length;
      cy /= outer.length;
      if (cx < 0 || cy < 0 || cx >= ext || cy >= ext) continue;
      const ring = outer.map((p) => tileToLonLat(x, y, z, p.x, p.y, ext));
      if (ring.length > 3 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
      if (ring.length >= 3) out.push({ ring, height, minHeight });
    }
  }
  return out;
}

function buildingColor(h: number): Color {
  // Warm stone for low-rise, cool white for high-rise.
  const t = Math.min(1, h / 60);
  return new Color(0.86 - 0.06 * t, 0.83 - 0.02 * t, 0.78 + 0.1 * t, 1);
}

export class BuildingTileManager {
  private viewer: Viewer;
  private collection = new PrimitiveCollection();
  private tiles = new Map<string, TileEntry>();
  private template: string | null = null;
  private templatePromise: Promise<string | null> | null = null;
  private queue: { key: string; x: number; y: number }[] = [];
  private active = 0;
  private visible = true;
  private shadows = false;
  private generation = 0;
  private debounce: number | null = null;
  private removeListeners: (() => void)[] = [];
  onStats: (s: { tiles: number; buildings: number; failed: boolean }) => void = () => {};

  constructor(
    viewer: Viewer,
    private heights: (points: LonLat[]) => Promise<number[]>,
    private heightScale: () => number,
    private requestRender: () => void,
  ) {
    this.viewer = viewer;
    viewer.scene.primitives.add(this.collection);
    const cam = viewer.camera;
    cam.percentageChanged = 0.15;
    const schedule = () => this.schedule();
    this.removeListeners.push(cam.changed.addEventListener(schedule), cam.moveEnd.addEventListener(schedule));
    this.schedule();
  }

  private async tileUrl(): Promise<string | null> {
    if (this.template) return this.template;
    this.templatePromise ??= fetch(TILEJSON_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((tj) => (this.template = tj?.tiles?.[0] ?? null))
      .catch(() => null);
    return this.templatePromise;
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.collection.show = v;
    if (v) this.schedule();
    this.requestRender();
  }

  setShadows(on: boolean) {
    this.shadows = on;
    for (const t of this.tiles.values()) if (t.primitive) t.primitive.shadows = on ? ShadowMode.ENABLED : ShadowMode.DISABLED;
  }

  /** Terrain / exaggeration changed → rebuild with new base heights. */
  reset() {
    this.generation++;
    this.collection.removeAll();
    this.tiles.clear();
    this.queue = [];
    this.schedule();
  }

  private schedule() {
    if (this.debounce) window.clearTimeout(this.debounce);
    this.debounce = window.setTimeout(() => this.update(), 200);
  }

  private update() {
    const v = this.viewer;
    if (!this.visible || v.isDestroyed()) return;
    const carto = v.camera.positionCartographic;
    const groundApprox = 560 * this.heightScale();
    const altitude = carto.height - groundApprox;
    this.collection.show = altitude < MAX_ALTITUDE_M;
    if (altitude >= MAX_ALTITUDE_M) {
      this.emitStats();
      return;
    }
    // Focus = ground point at screen centre (fallback: below camera).
    const canvas = v.scene.canvas;
    const ray = v.camera.getPickRay(new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2));
    const hit = ray ? v.scene.globe.pick(ray, v.scene) : undefined;
    let focusLon = CMath.toDegrees(carto.longitude);
    let focusLat = CMath.toDegrees(carto.latitude);
    if (hit) {
      const c = v.scene.globe.ellipsoid.cartesianToCartographic(hit);
      focusLon = CMath.toDegrees(c.longitude);
      focusLat = CMath.toDegrees(c.latitude);
    }
    const radiusKm = Math.min(7, Math.max(1.5, altitude / 1000 * 1.2));
    const dLat = radiusKm / 110.57;
    const dLon = radiusKm / (111.32 * Math.cos((focusLat * Math.PI) / 180));
    const [x0, y0] = lonLatToTile(focusLon - dLon, focusLat + dLat, Z);
    const [x1, y1] = lonLatToTile(focusLon + dLon, focusLat - dLat, Z);
    const [fx, fy] = lonLatToTile(focusLon, focusLat, Z);
    const wanted: { key: string; x: number; y: number; d: number }[] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) wanted.push({ key: `${x}/${y}`, x, y, d: Math.hypot(x - fx, y - fy) });
    wanted.sort((a, b) => a.d - b.d);
    const now = performance.now();
    const keep = new Set<string>();
    for (const w of wanted.slice(0, MAX_TILES_IN_VIEW)) {
      keep.add(w.key);
      const t = this.tiles.get(w.key);
      if (t) {
        t.lastUsed = now;
        if (t.primitive) t.primitive.show = true;
      } else {
        this.tiles.set(w.key, { key: w.key, primitive: null, state: 'loading', lastUsed: now, count: 0 });
        this.queue.push(w);
      }
    }
    // Hide tiles outside the working set; evict least-recently-used beyond the cache size.
    for (const t of this.tiles.values()) if (!keep.has(t.key) && t.primitive) t.primitive.show = false;
    if (this.tiles.size > MAX_CACHED) {
      const old = [...this.tiles.values()].filter((t) => !keep.has(t.key)).sort((a, b) => a.lastUsed - b.lastUsed);
      for (const t of old.slice(0, this.tiles.size - MAX_CACHED)) {
        if (t.primitive) this.collection.remove(t.primitive);
        this.tiles.delete(t.key);
      }
    }
    this.queue = this.queue.filter((q) => keep.has(q.key));
    this.pump();
    this.requestRender();
  }

  private pump() {
    while (this.active < CONCURRENCY && this.queue.length) {
      const job = this.queue.shift()!;
      this.active++;
      this.load(job.key, job.x, job.y).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private async load(key: string, x: number, y: number) {
    const gen = this.generation;
    const entry = this.tiles.get(key);
    if (!entry) return;
    try {
      const tpl = await this.tileUrl();
      if (!tpl) throw new Error('tilejson unavailable');
      const r = await fetch(tpl.replace('{z}', String(Z)).replace('{x}', String(x)).replace('{y}', String(y)));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buildings = decodeBuildings(await r.arrayBuffer(), x, y, Z);
      if (gen !== this.generation || !this.tiles.has(key)) return;
      if (!buildings.length) {
        entry.state = 'empty';
        return;
      }
      const centroids = buildings.map((b) => {
        let lx = 0;
        let ly = 0;
        for (const p of b.ring) {
          lx += p[0];
          ly += p[1];
        }
        return [lx / b.ring.length, ly / b.ring.length] as LonLat;
      });
      const ground = await this.heights(centroids);
      if (gen !== this.generation || !this.tiles.has(key)) return;
      const scale = this.heightScale();
      const instances: GeometryInstance[] = [];
      buildings.forEach((b, i) => {
        const g = (ground[i] ?? 0) * scale;
        try {
          instances.push(
            new GeometryInstance({
              geometry: new PolygonGeometry({
                polygonHierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(b.ring.flat())),
                height: g + (b.minHeight > 0 ? b.minHeight : -4),
                extrudedHeight: g + b.height,
                vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
              }),
              attributes: { color: ColorGeometryInstanceAttribute.fromColor(buildingColor(b.height)) },
            }),
          );
        } catch {
          /* degenerate footprint — skip */
        }
      });
      const primitive = new Primitive({
        geometryInstances: instances,
        appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }),
        asynchronous: true,
        releaseGeometryInstances: true,
        shadows: this.shadows ? ShadowMode.ENABLED : ShadowMode.DISABLED,
      });
      this.collection.add(primitive);
      entry.primitive = primitive;
      entry.state = 'ready';
      entry.count = buildings.length;
      this.emitStats();
      // Keep rendering while the worker builds geometry (request-render mode).
      const t0 = performance.now();
      const tick = () => {
        this.requestRender();
        if (!primitive.ready && performance.now() - t0 < 8000 && !this.viewer.isDestroyed()) requestAnimationFrame(tick);
      };
      tick();
    } catch {
      entry.state = 'error';
      this.emitStats();
    }
  }

  private emitStats() {
    let tiles = 0;
    let buildings = 0;
    let errors = 0;
    for (const t of this.tiles.values()) {
      if (t.state === 'ready') {
        tiles++;
        buildings += t.count;
      }
      if (t.state === 'error') errors++;
    }
    this.onStats({ tiles, buildings, failed: errors > 0 && tiles === 0 });
  }

  destroy() {
    this.removeListeners.forEach((f) => f());
    if (this.debounce) window.clearTimeout(this.debounce);
    if (!this.viewer.isDestroyed()) this.viewer.scene.primitives.remove(this.collection);
  }
}
