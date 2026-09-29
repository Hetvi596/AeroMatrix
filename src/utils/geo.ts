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

export function cellAreaKm2(b: BBox): number {
  const w = haversineKm([b.west, (b.south + b.north) / 2], [b.east, (b.south + b.north) / 2]);
  const h = haversineKm([b.west, b.south], [b.west, b.north]);
  return w * h;
}
