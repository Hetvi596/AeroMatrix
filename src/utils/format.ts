export function fmt(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

export function fmtSigned(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '—';
  const s = v.toFixed(digits);
  return v > 0 ? `+${s}` : s;
}

export function fmtInt(v: number): string {
  return Math.round(v).toLocaleString('en-IN');
}

export function pct(part: number, total: number): number {
  return total === 0 ? 0 : (part / total) * 100;
}

let uidCounter = 0;
/** Unique id. The counter keeps ids distinct when several are made within one timer tick
 *  (browsers coarsen performance.now(), so time alone can repeat). */
export function uid(prefix: string): string {
  uidCounter = (uidCounter + 1) % 1679616; // 36^4
  return `${prefix}-${Date.now().toString(36)}-${uidCounter.toString(36).padStart(4, '0')}`;
}
