// Minimal RFC-4180-style CSV parser (quotes, escaped quotes, CRLF). Auto-detects
// ',' ';' or tab delimiters from the first non-empty lines.

export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 15).join('\n');
  const counts = [',', ';', '\t'].map((d) => ({ d, n: sample.split(d).length }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 1 ? counts[0].d : ',';
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Drop blank rows and '#' comment rows (used in the downloadable templates).
  return rows.filter((r) => r.some((c) => c.trim() !== '') && !r[0]?.trimStart().startsWith('#'));
}

/** Header normalisation: lower-case, drop "(units)", keep only [a-z0-9]. "PM2.5 (ug/m3)" → "pm25". */
export function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Parses common Indian / ISO timestamp formats into 'YYYY-MM-DDTHH:mm' (local time, no TZ shift).
 * Supports: 2024-01-31 13:00, 2024-01-31T13:00:00, 31-01-2024 13:00, 31/01/2024, 31-Jan-2024 - 13:00.
 */
export function parseTimestamp(raw: string): string | null {
  const t = raw.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return build(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s*-?\s*(\d{1,2}):(\d{2}))?/);
  if (m) return build(+m[3], +m[2], +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  m = t.match(/^(\d{1,2})[- ]([A-Za-z]{3})[A-Za-z]*[- ](\d{4})(?:\s*-?\s*(\d{1,2}):(\d{2}))?/);
  if (m && MONTHS[m[2].toLowerCase()]) return build(+m[3], MONTHS[m[2].toLowerCase()], +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  return null;
}

function build(y: number, mo: number, d: number, h: number, mi: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 24 || mi > 59) return null;
  if (h === 24) h = 23; // some exports use 24:00 for end-of-day
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;
}

/** Parses a numeric cell; returns null for blanks and CPCB/NA placeholders. */
export function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const t = raw.trim();
  if (!t || /^(none|na|n\/a|nan|null|-+)$/i.test(t)) return null;
  const v = Number(t.replace(/,/g, ''));
  return Number.isFinite(v) ? v : null;
}

/** Shift a 'YYYY-MM-DDTHH:mm' string by hours (UTC arithmetic on a naive local time). */
export function shiftHours(ts: string, hours: number): string {
  const d = new Date(`${ts}:00Z`);
  d.setUTCHours(d.getUTCHours() + hours);
  return d.toISOString().slice(0, 16);
}
