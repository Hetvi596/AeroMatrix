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

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(performance.now() * 1000).toString(36).slice(-4)}`;
}
