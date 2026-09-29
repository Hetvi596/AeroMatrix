import { describe, expect, it } from 'vitest';
import { parseCsv, parseNumber, parseTimestamp } from './csv';
import { mergeObservations, parseObservationCsv } from './cpcbImport';
import { parseWeatherCsv } from './weatherImport';
import { getDemoBaseState } from '../demo/demoDataProvider';
import { interpolateField, summariseStations, validateModel } from '../../services/observations';
import { scenarioService } from '../../services/scenarioService';

// NOTE: values below are synthetic test fixtures for parser behaviour — not real observations.

describe('csv', () => {
  it('handles quotes, escaped quotes, CRLF and comment rows', () => {
    const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n# comment\r\n1,2\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
      ['1', '2'],
    ]);
  });

  it('parses Indian and ISO timestamps', () => {
    expect(parseTimestamp('2024-01-31 13:00')).toBe('2024-01-31T13:00');
    expect(parseTimestamp('31-01-2024 13:00')).toBe('2024-01-31T13:00');
    expect(parseTimestamp('31/01/2024')).toBe('2024-01-31T00:00');
    expect(parseTimestamp('31-Jan-2024 - 13:00')).toBe('2024-01-31T13:00');
    expect(parseTimestamp('not a date')).toBeNull();
  });

  it('treats CPCB placeholders as missing', () => {
    expect(parseNumber('None')).toBeNull();
    expect(parseNumber('NA')).toBeNull();
    expect(parseNumber(' 42.5 ')).toBe(42.5);
  });
});

describe('observation import', () => {
  it('reads a CPCB-style export with a metadata preamble', () => {
    const text = [
      'Central Control Room for Air Quality Management',
      'Station,Test Station A',
      '',
      'From Date,To Date,PM2.5 (ug/m3),PM10 (ug/m3),NO2 (ug/m3),Ozone (ug/m3)',
      '01-01-2024 00:00,01-01-2024 01:00,50,90,20,None',
      '01-01-2024 01:00,01-01-2024 02:00,60,100,None,30',
      '01-01-2024 02:00,01-01-2024 03:00,None,None,None,None',
    ].join('\n');
    const p = parseObservationCsv(text, 'site.csv');
    expect(p.stations).toHaveLength(1);
    expect(p.stations[0].name).toBe('Test Station A');
    expect(p.stations[0].location).toBeNull();
    expect(p.records).toHaveLength(2);
    expect(p.pollutants).toEqual(['pm25', 'pm10', 'no2', 'o3']);
    expect(p.records[1].values).toEqual({ pm25: 60, pm10: 100, o3: 30 });
  });

  it('reads a long table with coordinates and grids it with IDW', () => {
    const text = [
      'station,latitude,longitude,datetime,PM2.5',
      'North,18.60,73.85,2024-01-01 00:00,80',
      'North,18.60,73.85,2024-01-01 01:00,100',
      'South,18.46,73.85,2024-01-01 00:00,40',
      'South,18.46,73.85,2024-01-01 01:00,40',
    ].join('\n');
    const ds = mergeObservations(null, parseObservationCsv(text, 'long.csv'), 'long.csv');
    const base = getDemoBaseState(10);
    const summaries = summariseStations(ds, 'period', base);
    expect(summaries.find((s) => s.station.name === 'North')!.values.pm25).toBe(90);
    const field = interpolateField(summaries, 'pm25', base)!;
    expect(field.stationCount).toBe(2);
    const vals = Object.values(field.values);
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(40);
    expect(Math.max(...vals)).toBeLessThanOrEqual(90);
    const v = validateModel(summaries, scenarioService.baseline(base), 'pm25')!;
    expect(v.n).toBe(2);
    expect(v.rmse).toBeGreaterThanOrEqual(v.mae);
  });

  it('rejects files without a usable header', () => {
    expect(() => parseObservationCsv('foo,bar\n1,2', 'bad.csv')).toThrow(/no header row/);
  });
});

describe('weather import', () => {
  it('converts ERA5 units (K, Pa, m, u10/v10)', () => {
    const text = [
      'valid_time,t2m,u10,v10,sp,tp',
      '2024-01-01 00:00,300.15,3,0,100900,0.001',
      '2024-01-01 01:00,300.15,3,0,100900,0.001',
    ].join('\n');
    const { obs } = parseWeatherCsv(text, 'era5.csv');
    expect(obs.weather.temperature).toBeCloseTo(27, 1);
    expect(obs.weather.windSpeed).toBeCloseTo(3, 2);
    expect(obs.weather.windDirection).toBe(270); // u>0 = wind blowing towards east = from west
    expect(obs.weather.pressure).toBe(1009);
    expect(obs.weather.rainfall).toBeCloseTo(2, 5); // 2 × 1 mm
  });
});
