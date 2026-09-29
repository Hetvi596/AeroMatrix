import type { RGB } from '../../utils/colors';

/**
 * Renders a smooth (bilinear-interpolated) raster from grid-cell values.
 * values[row * n + col], row 0 = north. Returns a canvas to drape as imagery.
 */
export function renderFieldCanvas(
  values: number[],
  n: number,
  colorFn: (v: number) => RGB,
  alpha: number,
): HTMLCanvasElement {
  const size = Math.min(512, Math.max(192, n * 26));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const a = Math.round(alpha * 255);
  const edge = size * 0.012;

  for (let py = 0; py < size; py++) {
    const gy = Math.max(0, Math.min(n - 1, ((py + 0.5) / size) * n - 0.5));
    const y0 = Math.floor(gy);
    const y1 = Math.min(n - 1, y0 + 1);
    const fy = gy - y0;
    for (let px = 0; px < size; px++) {
      const gx = Math.max(0, Math.min(n - 1, ((px + 0.5) / size) * n - 0.5));
      const x0 = Math.floor(gx);
      const x1 = Math.min(n - 1, x0 + 1);
      const fx = gx - x0;
      const v =
        (values[y0 * n + x0] * (1 - fx) + values[y0 * n + x1] * fx) * (1 - fy) +
        (values[y1 * n + x0] * (1 - fx) + values[y1 * n + x1] * fx) * fy;
      const [r, g, b] = colorFn(v);
      // Soft fade at the analysis-area boundary.
      const dEdge = Math.min(px, py, size - 1 - px, size - 1 - py);
      const fade = Math.min(1, dEdge / edge);
      const i = (py * size + px) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = a * fade;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Elevation ramp (for DEM tint): semi-transparent hypsometric colours. */
export function elevationRampCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 1;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(14, 116, 144, 0.55)');
  g.addColorStop(0.25, 'rgba(34, 197, 94, 0.55)');
  g.addColorStop(0.5, 'rgba(234, 179, 8, 0.6)');
  g.addColorStop(0.75, 'rgba(180, 83, 9, 0.65)');
  g.addColorStop(1, 'rgba(250, 250, 250, 0.7)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 1);
  return c;
}
