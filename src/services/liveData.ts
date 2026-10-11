// Shared live-data service: fetches Open-Meteo air-quality model data for every zone
// centre, verified place and locality in one batched refresh, plus current weather, and
// publishes them to the store. Components read from the store through the selectors
// below; none of them call the API themselves.

import { useMemo } from 'react';
import { forecastKey, useTwin } from '../store/useTwinStore';
import type { CellState, LonLat, ObservedField, Pollutant } from '../types';
import { PUNE_LOCALITIES } from '../data/geojson/puneLocalities';
import { VERIFIED_PLACES, stationPlace } from '../data/geojson/verifiedPlaces';
import { WEATHER_SOURCE, fetchAirQuality, fetchWeather, type LiveAirPoint, type LivePointRequest } from './openMeteo';
import { isMeasured, isPredicted, type ApiStation } from './aeromatrixApi';
import { resolveCurrent, type PlaceRef, type PollutantRecord } from './pollutantData';
import { fmtIst } from './pollutantData';

type S = ReturnType<typeof useTwin.getState>;

/** Minutes between refreshes (Open-Meteo updates its air-quality data hourly). */
export const LIVE_REFRESH_MINUTES = Math.max(5, Number(import.meta.env.VITE_LIVE_REFRESH_MINUTES ?? 60) || 60);

/**
 * Model points are requested on a 0.1° lattice. The CAMS global model behind Open-Meteo
 * resolves about 0.4°, so this loses no detail, while Open-Meteo counts every coordinate as
 * an API call: ~30 distinct points instead of ~113 per refresh keeps the free quota safe.
 */
export const MODEL_POINT_STEP = 0.1;
const snapCoord = (v: number) => Math.round(v / MODEL_POINT_STEP) * MODEL_POINT_STEP;
export function modelPoint(location: LonLat): LonLat {
  return [Math.round(snapCoord(location[0]) * 1e4) / 1e4, Math.round(snapCoord(location[1]) * 1e4) / 1e4];
}
const gridId = (l: LonLat) => `grid:${l[0].toFixed(1)},${l[1].toFixed(1)}`;

export const zonePointId = (cellId: string) => `zone:${cellId}`;
export const placePointId = (placeId: string) => `place:${placeId}`;
export const localityPointId = (localityId: string) => `loc:${localityId}`;

/** Zone centres and verified places that one refresh covers (other localities: fetchLocalityPoint). */
export function liveTargets(s: Pick<S, 'base'>): LivePointRequest[] {
  const zones = (s.base?.cells ?? []).map((c) => ({ id: zonePointId(c.id), location: c.center }));
  const places = Object.values(VERIFIED_PLACES).map((p) => ({ id: placePointId(p.id), location: p.location }));
  return [...zones, ...places];
}

/** The distinct model points to request for these targets, and which target uses which point. */
export function plannedRequests(targets: LivePointRequest[]): { requests: LivePointRequest[]; byTarget: Record<string, string> } {
  const requests = new Map<string, LivePointRequest>();
  const byTarget: Record<string, string> = {};
  for (const t of targets) {
    const loc = modelPoint(t.location);
    const id = gridId(loc);
    if (!requests.has(id)) requests.set(id, { id, location: loc });
    byTarget[t.id] = id;
  }
  return { requests: [...requests.values()], byTarget };
}

/** Distinct coordinates requested in one refresh. */
export function livePointRequests(s: Pick<S, 'base'>): LivePointRequest[] {
  return plannedRequests(liveTargets(s)).requests;
}

/** Each target gets its model point's data under its own id. */
function expand(points: LiveAirPoint[], byTarget: Record<string, string>): LiveAirPoint[] {
  const byId = new Map(points.map((p) => [p.id, p]));
  return Object.entries(byTarget).flatMap(([target, g]) => {
    const p = byId.get(g);
    return p ? [{ ...p, id: target }] : [];
  });
}

const localityInFlight = new Set<string>();
/** Model data for one searched locality (its approximate centre), merged into the shared points. */
export async function fetchLocalityPoint(localityId: string, fetchAir: typeof fetchAirQuality = fetchAirQuality): Promise<void> {
  const l = PUNE_LOCALITIES.find((x) => x.id === localityId);
  const id = localityPointId(localityId);
  if (!l || VERIFIED_PLACES[localityId] || localityInFlight.has(id)) return;
  const have = useTwin.getState().live.points[id];
  if (have && Date.now() - have.retrievedAt < LIVE_REFRESH_MINUTES * 60_000) return;
  localityInFlight.add(id);
  try {
    // Reuse a model point already fetched for a zone or place; otherwise one request.
    const loc = modelPoint(l.location);
    const known = Object.values(useTwin.getState().live.points).find((x) => x.requested[0] === loc[0] && x.requested[1] === loc[1]);
    const p = known ?? (await fetchAir([{ id: gridId(loc), location: loc }]))[0];
    const s = useTwin.getState();
    if (p) s.setLive({ points: { ...s.live.points, [id]: { ...p, id } } });
  } catch {
    /* the place chip shows the value as unavailable */
  } finally {
    localityInFlight.delete(id);
  }
}

let token = 0;
let inFlight: AbortController | null = null;

/**
 * Fetch model data and weather. A newer refresh cancels an older one, and a response
 * is dropped if the grid changed while it was in flight. On failure the previous
 * values stay, with their own timestamps.
 */
export async function refreshLiveData(opts: { fetchAir?: typeof fetchAirQuality; fetchWx?: typeof fetchWeather } = {}): Promise<void> {
  const { fetchAir = fetchAirQuality, fetchWx = fetchWeather } = opts;
  const s = useTwin.getState();
  if (!s.base) return;
  const my = ++token;
  inFlight?.abort();
  const ctrl = new AbortController();
  inFlight = ctrl;
  const cells = s.base.cells;
  const centre: LonLat = s.base.city.center;
  s.setLive({ status: s.live.updatedAt ? s.live.status : 'loading' });

  const plan = plannedRequests(liveTargets(s));
  const [air, wx] = await Promise.allSettled([
    fetchAir(plan.requests, { signal: ctrl.signal }).then((pts) => expand(pts, plan.byTarget)),
    fetchWx(centre, { signal: ctrl.signal }),
  ]);
  if (my !== token) return; // superseded
  const now = useTwin.getState();

  if (air.status === 'fulfilled') {
    const sameGrid = now.base?.cells === cells;
    // Keep separately fetched localities; replace zones (same grid only) and places.
    const points: Record<string, LiveAirPoint> = Object.fromEntries(
      Object.entries(now.live.points).filter(([k]) => k.startsWith('loc:') || (!sameGrid && !k.startsWith('zone:') && !k.startsWith('place:'))),
    );
    for (const p of air.value) if (sameGrid || !p.id.startsWith('zone:')) points[p.id] = p;
    now.setLive({ status: 'ready', error: null, points, zoneCells: sameGrid ? cells : now.live.zoneCells, updatedAt: Date.now() });
  } else if ((air.reason as Error)?.name !== 'AbortError') {
    now.setLive({ status: 'error', error: air.reason instanceof Error ? air.reason.message : String(air.reason) });
  }

  if (wx.status === 'fulfilled') {
    now.setLive({ weather: wx.value, weatherError: null });
    applyLiveWeatherIfIdle();
  } else if ((wx.reason as Error)?.name !== 'AbortError') {
    now.setLive({ weatherError: wx.reason instanceof Error ? wx.reason.message : String(wx.reason) });
  }

  // First successful load: show the current model data on the map unless the user is elsewhere.
  const after = useTwin.getState();
  if (air.status === 'fulfilled' && after.displayMode === 'baseline' && !after.activeResult && !shownCurrentOnce) {
    shownCurrentOnce = true;
    after.setDisplayMode('current');
  }
}
let shownCurrentOnce = false;

export function liveWeatherObservation(s: Pick<S, 'live'>) {
  const w = s.live.weather;
  if (!w) return null;
  return {
    weather: w.weather,
    fileName: WEATHER_SOURCE,
    period: `current hour, ${fmtIst(w.time)} IST; rain = past ${w.rainHours} h`,
    records: 1,
  };
}

/**
 * Use live weather as the scenario engine's baseline weather, but never while a
 * scenario is active or when the user imported a weather file.
 */
export function applyLiveWeatherIfIdle(): boolean {
  const s = useTwin.getState();
  const obs = liveWeatherObservation(s);
  if (!obs || s.activeResult) return false;
  if (s.weatherObs && s.weatherObs.fileName !== WEATHER_SOURCE) return false;
  if (s.weatherObs && s.weatherObs.period === obs.period) return false;
  s.applyWeatherObservation(obs);
  return true;
}

export function startLiveData(): () => void {
  void refreshLiveData();
  const timer = setInterval(() => void refreshLiveData(), LIVE_REFRESH_MINUTES * 60_000);
  // New grid (resolution or geometry): the zone points must be fetched again.
  // A searched locality without a verified point: fetch just that one.
  const unsub = useTwin.subscribe((s, prev) => {
    if (s.base && s.base.cells !== prev.base?.cells) void refreshLiveData();
    if (s.highlightedPlace && s.highlightedPlace !== prev.highlightedPlace) void fetchLocalityPoint(s.highlightedPlace);
  });
  return () => {
    clearInterval(timer);
    unsub();
    inFlight?.abort();
  };
}

/**
 * Start the live-data service once the city grid exists. Uses a store subscription, so
 * background-tab timer throttling can't delay it. The start is claimed before calling
 * `start`, because starting updates the store synchronously and re-enters the listener;
 * without the claim that recursion never ends.
 */
export function startLiveDataWhenReady(start: () => () => void = startLiveData): () => void {
  let stop: (() => void) | null = null;
  let unsub = () => {};
  const tryStart = () => {
    if (stop || !useTwin.getState().base) return;
    stop = () => {};
    unsub();
    stop = start();
  };
  unsub = useTwin.subscribe(tryStart);
  tryStart();
  return () => {
    unsub();
    stop?.();
  };
}

// ------------------------------------------------------------------ selectors

export function zonePlace(s: Pick<S, 'base'>, cellId: string): PlaceRef {
  const c = s.base?.cells.find((x) => x.id === cellId);
  return { name: `Zone ${cellId}`, location: c?.center ?? null, reference: 'zone centre, nearest 0.1° model point' };
}

export function zoneRecord(s: Pick<S, 'base' | 'live'>, cellId: string, pollutant: Pollutant, now = Date.now()): PollutantRecord {
  const sameGrid = s.live.zoneCells === s.base?.cells;
  return resolveCurrent({ pollutant, place: zonePlace(s, cellId), now, model: sameGrid ? s.live.points[zonePointId(cellId)] : null });
}

export function stationPlaceRef(station: ApiStation): PlaceRef {
  const p = stationPlace(station.station);
  return p
    ? { name: p.name, location: p.location, reference: `OSM ${p.osm}, ${p.precision}, nearest 0.1° model point; station position unknown` }
    : { name: station.name, location: null, reference: 'no matching OpenStreetMap place' };
}

/** Station: recent reading → model data at the station's area → current forecast → unavailable. */
export function stationRecord(s: Pick<S, 'stationMeasured' | 'forecasts' | 'live'>, station: ApiStation, pollutant: Pollutant, now = Date.now()): PollutantRecord {
  const place = stationPlaceRef(station);
  const placeId = stationPlace(station.station)?.id;
  const m = s.stationMeasured[station.station];
  const mv = m && m.status === 'MEASURED' ? m.pollutants[pollutant] : undefined;
  const observation = isMeasured(mv) ? { value: mv.value, unit: mv.unit, time: Date.parse(mv.window?.end ?? mv.time), source: `${station.station_name} (station file)` } : null;
  const fc = s.forecasts[forecastKey(station.station, false)]?.data;
  const fv = fc && 'pollutants' in fc ? fc.pollutants[pollutant] : undefined;
  const prediction = isPredicted(fv)
    ? { value: fv.value, unit: fv.unit, validAt: Date.parse(fv.valid_at), historical: fv.historical, lower: fv.lower, upper: fv.upper, source: `Trained ${fv.model.algorithm} model` }
    : null;
  return resolveCurrent({ pollutant, place, now, observation, model: placeId ? s.live.points[placePointId(placeId)] : null, prediction });
}

/** A verified place without a monitoring station (e.g. Kothrud): model data only. */
export function placeRecord(s: Pick<S, 'live'>, placeId: string, pollutant: Pollutant, now = Date.now()): PollutantRecord {
  const p = VERIFIED_PLACES[placeId];
  const place: PlaceRef = p ? { name: p.name, location: p.location, reference: `OSM ${p.osm}, ${p.precision}` } : { name: placeId, location: null, reference: 'unknown place' };
  return resolveCurrent({ pollutant, place, now, model: p ? s.live.points[placePointId(p.id)] : null });
}

/** A searchable locality: its OSM-verified point when there is one, else its approximate centre (labelled so). */
export function localityRecord(s: Pick<S, 'live'>, localityId: string, pollutant: Pollutant, now = Date.now()): PollutantRecord {
  const verified = VERIFIED_PLACES[localityId];
  if (verified) return placeRecord(s, verified.id, pollutant, now);
  const l = PUNE_LOCALITIES.find((x) => x.id === localityId);
  const place: PlaceRef = l ? { name: l.name, location: l.location, reference: 'approximate area centre (navigation grade)' } : { name: localityId, location: null, reference: 'unknown place' };
  return resolveCurrent({ pollutant, place, now, model: l ? s.live.points[localityPointId(l.id)] : null });
}

export function stationLivePoint(s: Pick<S, 'live'>, station: ApiStation): LiveAirPoint | null {
  const id = stationPlace(station.station)?.id;
  return id ? (s.live.points[placePointId(id)] ?? null) : null;
}

/** Map field of model data for the current grid, or null if any zone lacks a value. */
export function currentField(s: Pick<S, 'base' | 'live'>, pollutant: Pollutant): (ObservedField & { time: number; grids: number }) | null {
  const cells = s.base?.cells;
  if (!cells || s.live.zoneCells !== cells) return null;
  const values: Record<string, number> = {};
  let time = 0;
  const grids = new Set<string>();
  for (const c of cells) {
    const p = s.live.points[zonePointId(c.id)];
    const v = p?.values[pollutant];
    if (!v) return null;
    values[c.id] = v.value;
    time = Math.max(time, v.time);
    if (p.grid) grids.add(p.grid.join(','));
  }
  return { pollutant, values, nearestKm: {}, stationCount: 0, time, grids: grids.size };
}

const fieldCache = new WeakMap<object, Map<Pollutant, ReturnType<typeof currentField>>>();
/** currentField, memoised per points object so selectors keep a stable reference. */
export function currentFieldCached(s: Pick<S, 'base' | 'live'>, pollutant: Pollutant) {
  let m = fieldCache.get(s.live.points);
  if (!m) fieldCache.set(s.live.points, (m = new Map()));
  const hit = m.get(pollutant);
  if (hit !== undefined && (hit === null || s.live.zoneCells === s.base?.cells)) return hit;
  const f = currentField(s, pollutant);
  m.set(pollutant, f);
  return f;
}

// ------------------------------------------------------------------ hooks

export function useCurrentField(pollutant: Pollutant) {
  const base = useTwin((s) => s.base);
  const live = useTwin((s) => s.live);
  return useMemo(() => currentField({ base, live }, pollutant), [base, live, pollutant]);
}

/**
 * Zone values for tables: model data when it covers the grid, otherwise the prototype
 * model's values. `source` says which one, so the two are never mixed in one list.
 */
export function useZoneValues(states: CellState[], pollutant: Pollutant): { source: 'model_data' | 'prototype'; values: Map<string, number>; time: number | null } {
  const field = useCurrentField(pollutant);
  return useMemo(() => {
    if (field) return { source: 'model_data', values: new Map(Object.entries(field.values)), time: field.time };
    return { source: 'prototype', values: new Map(states.map((s) => [s.cellId, s[pollutant]])), time: null };
  }, [field, states, pollutant]);
}
