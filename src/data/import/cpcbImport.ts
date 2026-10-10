// Importer for air-quality observation CSVs — CPCB CCR / CAAQMS exports, the
// widely used "station_hour.csv" layout, or any tidy table with a station,
// timestamp and pollutant columns. Output is always status OBSERVED.
//
// Accepted layouts:
//  • Long table:  station, [latitude, longitude], datetime, PM2.5, PM10, NO2, SO2, CO, Ozone
//  • CPCB single-station export: metadata rows (incl. "Station,<name>") then a
//    header row "From Date,To Date,PM2.5,PM10,…". Station name falls back to the file name.

import type { ObservationDataset, ObservationRecord, Pollutant, Station } from '../../types';
import { normHeader, parseCsv, parseNumber, parseTimestamp } from './csv';

const POLLUTANT_HEADERS: Record<string, Pollutant> = {
  pm25: 'pm25',
  pm10: 'pm10',
  no2: 'no2',
  so2: 'so2',
  co: 'co',
  o3: 'o3',
  ozone: 'o3',
};
const STATION_HEADERS = ['station', 'stationname', 'stationid', 'site', 'sitename', 'location', 'locationname'];
const LAT_HEADERS = ['lat', 'latitude'];
const LON_HEADERS = ['lon', 'lng', 'long', 'longitude'];
const TIME_HEADERS = ['fromdate', 'datetime', 'timestamp', 'datetimeist', 'time', 'date'];

export interface ParsedObservations {
  stations: Station[];
  records: ObservationRecord[];
  pollutants: Pollutant[];
  warnings: string[];
  skippedRows: number;
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const h = rows[i].map(normHeader);
    const hasTime = h.some((x) => TIME_HEADERS.includes(x));
    const hasPollutant = h.some((x) => x in POLLUTANT_HEADERS);
    if (hasTime && hasPollutant) return i;
  }
  return -1;
}

function stationIdFor(name: string) {
  return `STN-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

export function parseObservationCsv(text: string, fileName: string): ParsedObservations {
  const rows = parseCsv(text);
  const warnings: string[] = [];
  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) {
    throw new Error(
      `${fileName}: no header row with a timestamp column (e.g. "From Date" / "Datetime") and a pollutant column (e.g. "PM2.5") was found.`,
    );
  }

  // CPCB preamble: look for a "Station" key/value row above the header.
  let preambleStation: string | null = null;
  for (let i = 0; i < headerIdx; i++) {
    const r = rows[i];
    const k = normHeader(r[0] ?? '');
    if (STATION_HEADERS.includes(k) && r[1]?.trim()) preambleStation = r[1].trim();
  }

  const header = rows[headerIdx].map(normHeader);
  const col = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const stationCol = col(STATION_HEADERS);
  const latCol = col(LAT_HEADERS);
  const lonCol = col(LON_HEADERS);
  const timeCol = col(TIME_HEADERS);
  const dateCol = header.indexOf('date');
  const clockCol = header.indexOf('time');
  const pollutantCols: [number, Pollutant][] = [];
  header.forEach((h, i) => {
    const p = POLLUTANT_HEADERS[h];
    if (p && !pollutantCols.some(([, q]) => q === p)) pollutantCols.push([i, p]);
  });

  const fallbackName = preambleStation ?? fileName.replace(/\.[^.]+$/, '');
  if (stationCol < 0) warnings.push(`${fileName}: no station column — using "${fallbackName}" for all rows.`);

  const stations = new Map<string, Station>();
  const records: ObservationRecord[] = [];
  let skippedRows = 0;

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const rawTime =
      dateCol >= 0 && clockCol >= 0 && dateCol !== clockCol && timeCol === dateCol
        ? `${row[dateCol] ?? ''} ${row[clockCol] ?? ''}`
        : row[timeCol] ?? '';
    const time = parseTimestamp(rawTime);
    if (!time) {
      skippedRows++;
      continue;
    }
    const name = (stationCol >= 0 ? row[stationCol]?.trim() : '') || fallbackName;
    const id = stationIdFor(name);
    if (!stations.has(id)) {
      const lat = latCol >= 0 ? parseNumber(row[latCol]) : null;
      const lon = lonCol >= 0 ? parseNumber(row[lonCol]) : null;
      stations.set(id, { id, name, location: lat !== null && lon !== null ? [lon, lat] : null });
    }
    const values: Partial<Record<Pollutant, number>> = {};
    let any = false;
    for (const [i, p] of pollutantCols) {
      const v = parseNumber(row[i]);
      if (v !== null && v >= 0) {
        values[p] = v;
        any = true;
      }
    }
    if (!any) {
      skippedRows++;
      continue;
    }
    records.push({ stationId: id, time, values });
  }

  if (!records.length) throw new Error(`${fileName}: no rows with a valid timestamp and at least one pollutant value.`);
  if (skippedRows) warnings.push(`${fileName}: skipped ${skippedRows} row(s) with no valid time or no values.`);

  return {
    stations: [...stations.values()],
    records,
    pollutants: pollutantCols.map(([, p]) => p),
    warnings,
    skippedRows,
  };
}

/** Merge newly parsed files into an (optional) existing dataset. */
export function mergeObservations(
  existing: ObservationDataset | null,
  parsed: ParsedObservations,
  fileName: string,
): ObservationDataset {
  const stations = new Map((existing?.stations ?? []).map((s) => [s.id, s]));
  for (const s of parsed.stations) {
    const prev = stations.get(s.id);
    stations.set(s.id, prev && prev.location ? prev : { ...s, location: s.location ?? prev?.location ?? null });
  }
  // De-duplicate on (station, time); later files win.
  const byKey = new Map<string, ObservationRecord>();
  for (const r of [...(existing?.records ?? []), ...parsed.records]) byKey.set(`${r.stationId}|${r.time}`, r);
  const records = [...byKey.values()].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  const pollutants = [...new Set([...(existing?.pollutants ?? []), ...parsed.pollutants])];
  return {
    fileNames: [...(existing?.fileNames ?? []), fileName],
    stations: [...stations.values()],
    records,
    pollutants,
    start: records[0].time,
    end: records[records.length - 1].time,
    loadedAt: new Date().toISOString(),
  };
}

export const OBSERVATION_TEMPLATE =
  'station,latitude,longitude,datetime,PM2.5,PM10,NO2,SO2,CO,Ozone\n' +
  '# one row per station per hour; datetime as YYYY-MM-DD HH:mm or DD-MM-YYYY HH:mm (IST); CO in mg/m3, others in ug/m3\n';
