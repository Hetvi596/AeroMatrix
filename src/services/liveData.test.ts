// Shared live-data service and store: one value per place across screens, stale-response
// protection, failure handling, weather and scenario isolation. Fetchers are controlled fakes.

import { beforeEach, describe, expect, it } from 'vitest';
import { hasCurrentField, useTwin } from '../store/useTwinStore';
import { VERIFIED_PLACES } from '../data/geojson/verifiedPlaces';
import { PUNE_LOCALITIES } from '../data/geojson/puneLocalities';
import {
  applyLiveWeatherIfIdle,
  currentField,
  currentFieldCached,
  fetchLocalityPoint,
  livePointRequests,
  liveTargets,
  modelPoint,
  plannedRequests,
  localityPointId,
  placePointId,
  refreshLiveData,
  startLiveDataWhenReady,
  stationRecord,
  zonePointId,
  zoneRecord,
} from './liveData';
import { WEATHER_SOURCE, type LiveAirPoint, type LivePointRequest, type LiveWeather } from './openMeteo';
import { scenarioOnCurrent } from '../scenarios/scenarioOnCurrent';
import type { ApiStation } from './aeromatrixApi';

const T = Date.now() - 10 * 60_000;
const valueFor = (id: string, bump = 0) => 30 + (id.length % 7) + bump;
const fakePoint = (r: LivePointRequest, bump = 0): LiveAirPoint => ({
  id: r.id,
  requested: r.location,
  grid: [Math.round(r.location[0] * 10) / 10, Math.round(r.location[1] * 10) / 10],
  values: {
    pm25: { value: valueFor(r.id, bump), unit: 'µg/m³', time: T },
    pm10: { value: 50, unit: 'µg/m³', time: T },
    no2: { value: 20, unit: 'µg/m³', time: T },
    so2: { value: 8, unit: 'µg/m³', time: T },
    co: { value: 0.6, unit: 'mg/m³', time: T },
    o3: { value: 40, unit: 'µg/m³', time: T },
  },
  missing: {},
  aqi: { status: 'AVAILABLE', value: 80, category: 'Satisfactory', dominant_pollutant: 'pm25', reason: null },
  hourly: {},
  retrievedAt: Date.now(),
});
const fakeAir = (bump = 0) => (async (pts: LivePointRequest[]) => pts.map((p) => fakePoint(p, bump))) as never;
const weather: LiveWeather = {
  weather: { temperature: 31, humidity: 40, windSpeed: 3.5, windDirection: 250, pressure: 1011, rainfall: 0 },
  time: T,
  grid: [73.85, 18.52],
  retrievedAt: Date.now(),
  rainHours: 24,
};
const fakeWx = (async () => weather) as never;
const st = () => useTwin.getState();

const KARVE: ApiStation = { station: 'site_292', station_name: 'Karve Road, Pune - MPCB', name: 'Karve Road', aliases: ['Karve Road'], longitude: null, latitude: null, source_files: 'x' };
const MHADA: ApiStation = { ...KARVE, station: 'site_5404', station_name: 'Mhada Colony, Pune - IITM', name: 'Mhada Colony', aliases: ['Mhada Colony'] };

beforeEach(async () => {
  await st().init(10);
  st().setLive({ status: 'idle', error: null, points: {}, zoneCells: null, updatedAt: null, weather: null, weatherError: null });
  st().clearWeatherObservation();
});

describe('live data service', () => {
  it('requests each distinct 0.1° model point once, covering every zone and verified place', () => {
    const targets = liveTargets(st());
    const { requests, byTarget } = plannedRequests(targets);
    const base = st().base!;
    expect(targets).toHaveLength(base.cells.length + Object.keys(VERIFIED_PLACES).length);
    expect(requests.length).toBeLessThan(targets.length / 3); // far fewer API calls than targets
    expect(new Set(requests.map((r) => r.id)).size).toBe(requests.length);
    for (const t of targets) {
      const r = requests.find((x) => x.id === byTarget[t.id])!;
      expect(Math.abs(r.location[0] - t.location[0])).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(Math.abs(r.location[1] - t.location[1])).toBeLessThanOrEqual(0.05 + 1e-9);
    }
    expect(requests.some((r) => r.id.startsWith('loc:'))).toBe(false);
    expect(livePointRequests(st())).toEqual(requests);
  });

  it('gives one value per zone to the map, tables and zone details', async () => {
    await refreshLiveData({ fetchAir: fakeAir(), fetchWx: fakeWx });
    const s = st();
    expect(s.live.status).toBe('ready');
    expect(hasCurrentField(s, 'pm25')).toBe(true);
    const field = currentField(s, 'pm25')!;
    const mapField = currentFieldCached(s, 'pm25')!;
    for (const c of s.base!.cells) {
      const r = zoneRecord(s, c.id, 'pm25');
      expect(r.value).toBe(field.values[c.id]);
      expect(mapField.values[c.id]).toBe(r.value);
      expect(r.kind).toBe('model_data');
      expect(r.time).toBe(T);
    }
    expect(s.displayMode).toBe('current');
  });

  it('station values come from the station’s verified place; historical readings are not current', async () => {
    await refreshLiveData({ fetchAir: fakeAir(), fetchWx: fakeWx });
    const s = st();
    const withOldReading = {
      ...s,
      stationMeasured: {
        site_292: {
          status: 'MEASURED',
          pollutants: { pm25: { status: 'MEASURED', value: 100, unit: 'ug/m3', time: '2025-05-24T02:00:00+05:30', historical: true, source: 'x', window: { start: '', end: '2025-05-24T03:00:00+05:30', statistic: 'hourly_mean' } } },
        },
      },
    } as never;
    const r = stationRecord(withOldReading, KARVE, 'pm25');
    expect(r.kind).toBe('model_data');
    expect(r.value).toBe(s.live.points[placePointId('karve-road')].values.pm25!.value);
    expect(r.place.location).toEqual(VERIFIED_PLACES['karve-road'].location);
    expect(stationRecord(s, MHADA, 'pm25').value).toBeNull();
  });

  it('drops zone values from a response that started before the grid changed', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = (async (pts: LivePointRequest[]) => {
      await gate;
      return pts.map((p) => fakePoint(p, 100));
    }) as never;
    const first = refreshLiveData({ fetchAir: slow, fetchWx: fakeWx });
    await st().setGridSize(5);
    release();
    await first;
    expect(currentField(st(), 'pm25')).toBeNull(); // old 10×10 values never shown on the 5×5 grid
    await refreshLiveData({ fetchAir: fakeAir(), fetchWx: fakeWx });
    expect(Object.keys(currentField(st(), 'pm25')!.values)).toHaveLength(25);
  });

  it('a newer refresh wins over an older one that finishes later', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = (async (pts: LivePointRequest[]) => {
      await gate;
      return pts.map((p) => fakePoint(p, 100));
    }) as never;
    const older = refreshLiveData({ fetchAir: slow, fetchWx: fakeWx });
    await refreshLiveData({ fetchAir: fakeAir(1), fetchWx: fakeWx });
    release();
    await older;
    const c = st().base!.cells[0].id;
    const g = plannedRequests(liveTargets(st())).byTarget[zonePointId(c)];
    expect(zoneRecord(st(), c, 'pm25').value).toBe(valueFor(g, 1));
  });

  it('keeps the last values, with their times, when a refresh fails', async () => {
    await refreshLiveData({ fetchAir: fakeAir(), fetchWx: fakeWx });
    const before = st().live.points;
    const failing = (async () => {
      throw new Error('HTTP 503');
    }) as never;
    await refreshLiveData({ fetchAir: failing, fetchWx: failing });
    expect(st().live.status).toBe('error');
    expect(st().live.error).toBe('HTTP 503');
    expect(st().live.points).toBe(before);
    expect(hasCurrentField(st(), 'pm25')).toBe(true);
  });

  it('uses live weather as the engine’s baseline weather only when no scenario is active', async () => {
    await refreshLiveData({ fetchAir: fakeAir(), fetchWx: fakeWx });
    expect(st().weatherObs?.fileName).toBe(WEATHER_SOURCE);
    expect(st().base!.weather).toEqual(weather.weather);

    st().updateDraft({ trafficMultiplier: 0.7 });
    st().runDraft();
    const active = st().activeResult;
    st().setLive({ weather: { ...weather, time: T + 3600_000, weather: { ...weather.weather, windSpeed: 1 } } });
    expect(applyLiveWeatherIfIdle()).toBe(false);
    expect(st().activeResult).toBe(active);
  });

  it('a scenario never overwrites current values; its estimate is computed beside them', async () => {
    await refreshLiveData({ fetchAir: fakeAir(), fetchWx: fakeWx });
    const c = st().base!.cells[0].id;
    const before = zoneRecord(st(), c, 'pm25').value!;
    st().updateDraft({ trafficMultiplier: 0.5 });
    st().runDraft();
    const s = st();
    expect(zoneRecord(s, c, 'pm25').value).toBe(before);
    const b = s.baseline.find((x) => x.cellId === c)!.pm25;
    const sc = s.activeResult!.scenario.find((x) => x.cellId === c)!.pm25;
    expect(scenarioOnCurrent(b, sc)).toBeCloseTo(sc / b, 12);
    expect(scenarioOnCurrent(0, sc)).toBeNull();
  });
  it('fetches a searched locality at its model point and keeps it through later refreshes', async () => {
    const baner = PUNE_LOCALITIES.find((l) => l.name === 'Baner')!;
    let asked: LivePointRequest[] = [];
    await fetchLocalityPoint(baner.id, (async (pts: LivePointRequest[]) => ((asked = pts), pts.map((p) => fakePoint(p)))) as never);
    expect(asked).toHaveLength(1);
    expect(asked[0].location).toEqual(modelPoint(baner.location));
    expect(st().live.points[localityPointId(baner.id)]?.id).toBe(localityPointId(baner.id));
    await refreshLiveData({ fetchAir: fakeAir(), fetchWx: fakeWx });
    expect(st().live.points[localityPointId(baner.id)]).toBeDefined();
  });

  it('reuses a model point already loaded instead of requesting it again', async () => {
    await refreshLiveData({ fetchAir: fakeAir(), fetchWx: fakeWx });
    const loaded = new Set(Object.values(st().live.points).map((p) => p.requested.join(',')));
    const loc = PUNE_LOCALITIES.find((l) => !VERIFIED_PLACES[l.id] && loaded.has(modelPoint(l.location).join(',')))!;
    let asked = 0;
    await fetchLocalityPoint(loc.id, (async (pts: LivePointRequest[]) => ((asked += pts.length), pts.map((p) => fakePoint(p)))) as never);
    expect(asked).toBe(0);
    expect(st().live.points[localityPointId(loc.id)]).toBeDefined();
  });

  it('starts the service exactly once even though starting updates the store', () => {
    let starts = 0;
    const stop = startLiveDataWhenReady(() => {
      starts++;
      // Like the real service: a synchronous store update while starting.
      st().setLive({ status: 'loading' });
      st().setLive({ status: 'idle' });
      return () => {};
    });
    st().setLive({ status: 'idle' });
    expect(starts).toBe(1);
    stop();
  });
});
