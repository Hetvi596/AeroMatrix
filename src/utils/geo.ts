import type { BBox, LonLat } from '../types';

const R = 6371; // km

/** Great-circle distance in km. */
export function haversineKm(a: LonLat, b: LonLat): number {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Local equirectangular offset (km east, km north) of b relative to a. */
export function offsetKm(a: LonLat, b: LonLat): [number, number] {
  const kx = 111.32 * Math.cos((a[1] * Math.PI) / 180);
  return [(b[0] - a[0]) * kx, (b[1] - a[1]) * 110.57];
}

/** Distance (km) from point p to polyline path. */
export function distanceToPathKm(p: LonLat, path: LonLat[]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = offsetKm(p, path[i]);
    const [bx, by] = offsetKm(p, path[i + 1]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    best = Math.min(best, Math.hypot(cx, cy));
  }
  return best;
}

export function pointInPolygon(p: LonLat, poly: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function bboxContains(b: BBox, p: LonLat): boolean {
  return p[0] >= b.west && p[0] <= b.east && p[1] >= b.south && p[1] <= b.north;
}

export function bboxRing(b: BBox): LonLat[] {
  return [
    [b.west, b.south],
    [b.east, b.south],
    [b.east, b.north],
    [b.west, b.north],
    [b.west, b.south],
  ];
}

export function shrinkBBox(b: BBox, factor: number): BBox {
  const cx = (b.west + b.east) / 2;
  const cy = (b.south + b.north) / 2;
  const hw = ((b.east - b.west) / 2) * factor;
  const hh = ((b.north - b.south) / 2) * factor;
  return { west: cx - hw, east: cx + hw, south: cy - hh, north: cy + hh };
}

/** Bounding box of one or more coordinate lists. */
export function bboxOf(parts: LonLat[][]): BBox {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const part of parts)
    for (const [x, y] of part) {
      if (x < west) west = x;
      if (x > east) east = x;
      if (y < south) south = y;
      if (y > north) north = y;
    }
  return { west, south, east, north };
}

/** Approximate distance (km) from a point to a bbox (0 if inside). */
export function distanceToBBoxKm(p: LonLat, b: BBox): number {
  const cx = Math.max(b.west, Math.min(b.east, p[0]));
  const cy = Math.max(b.south, Math.min(b.north, p[1]));
  const [dx, dy] = offsetKm(p, [cx, cy]);
  return Math.hypot(dx, dy);
}

export function pathLengthKm(path: LonLat[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += haversineKm(path[i - 1], path[i]);
  return len;
}

/** Polygon area in km² (equirectangular, fine at city scale). */
export function polygonAreaKm2(poly: LonLat[]): number {
  if (poly.length < 3) return 0;
  const o = poly[0];
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = offsetKm(o, poly[i]);
    const [x2, y2] = offsetKm(o, poly[(i + 1) % poly.length]);
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** Douglas–Peucker simplification with tolerance in metres. */
export function simplifyPath(path: LonLat[], toleranceM: number): LonLat[] {
  if (path.length <= 2) return path;
  const tolKm = toleranceM / 1000;
  const keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distanceToPathKm(path[i], [path[s], path[e]]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > tolKm) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return path.filter((_, i) => keep[i]);
}

export function polygonCentroid(poly: LonLat[]): LonLat {
  let x = 0, y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}

export function cellAreaKm2(b: BBox): number {
  const w = haversineKm([b.west, (b.south + b.north) / 2], [b.east, (b.south + b.north) / 2]);
  const h = haversineKm([b.west, b.south], [b.west, b.north]);
  return w * h;
}
