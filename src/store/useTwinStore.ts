import { create } from 'zustand';
import type {
  AggregationWindow,
  BaseState,
  CandidateLocation,
  CityGeometry,
  CellState,
  DisplayMode,
  ForecastLayer,
  IndustryCategory,
  InteractionMode,
  LayerId,
  LonLat,
  ModelCalibration,
  ObservationDataset,
  ObservedField,
  Pollutant,
  ScenarioParams,
  ScenarioResult,
  Section,
  StationSummary,
  Weather,
  WeatherObservation,
} from '../types';
import { dataProvider } from '../services/dataProvider';
import { defaultParams, scenarioService, validateParams } from '../services/scenarioService';
import { fitCalibration, interpolateField, summariseStations } from '../services/observations';
import { mergeObservations, parseObservationCsv } from '../data/import/cpcbImport';
import { parseWeatherCsv } from '../data/import/weatherImport';
import { DEMO_WEATHER } from '../data/demo/demoDataProvider';
import { DEMO_GEOMETRY } from '../data/geojson/puneDemoGeometry';
import { fetchOsmGeometry, loadOsmSnapshot } from '../services/osmGeometry';

export interface UploadedFile {
  name: string;
  text: string;
}

const SAVED_KEY = 'enr01.savedScenarios.v1';

export interface MapStatus {
  viewer: 'loading' | 'ready' | 'error';
  terrain: string;
  imagery: string;
  buildings: string;
  error?: string;
}

export interface PendingIndustry {
  location: LonLat | null;
  category: IndustryCategory;
  intensity: number;
}

export interface FlyToRequest {
  lonlat: LonLat;
  range: number;
  nonce: number;
}

interface TwinState {
  base: BaseState | null;
  baseline: CellState[];
  loading: boolean;
  error: string | null;
  gridSize: number;

  draft: ScenarioParams | null;
  draftErrors: string[];
  activeResult: ScenarioResult | null;
  saved: ScenarioResult[];
  compareIds: string[];

  displayMode: DisplayMode;
  pollutant: Pollutant;
  layers: Record<LayerId, boolean>;
  terrainExaggeration: number;

  selectedCellId: string | null;
  selectedIndustryId: string | null;
  interaction: InteractionMode;
  pendingIndustry: PendingIndustry;
  candidates: CandidateLocation[];
  section: Section;
  mapStatus: MapStatus;
  flyTo: FlyToRequest | null;
  rightOpen: boolean;
  bottomOpen: boolean;

  // Observed data (uploaded files)
  observations: ObservationDataset | null;
  aggWindow: AggregationWindow;
  stationSummaries: StationSummary[];
  observedField: ObservedField | null;
  weatherObs: WeatherObservation | null;
  importMessages: { level: 'info' | 'warn' | 'error'; text: string }[];

  // City geometry (demo or real OpenStreetMap)
  geometry: CityGeometry;
  osmStatus: { state: 'idle' | 'loading' | 'error'; message?: string };

  init(gridSize?: number): Promise<void>;
  loadOsmGeometry(mode?: 'snapshot' | 'live'): Promise<void>;
  calibration: ModelCalibration | null;
  calibrateModel(): void;
  clearCalibration(): void;
  forecastLayer: ForecastLayer | null;
  setForecastLayer(f: ForecastLayer | null): void;
  useDemoGeometry(): Promise<void>;
  importObservationFiles(files: UploadedFile[]): void;
  setStationLocation(stationId: string, location: LonLat | null): void;
  setAggWindow(w: AggregationWindow): void;
  clearObservations(): void;
  importWeatherFile(file: UploadedFile): void;
  clearWeatherObservation(): void;
  setGridSize(n: number): Promise<void>;
  updateDraft(p: Partial<ScenarioParams>): void;
  updateWeather(p: Partial<Weather>): void;
  resetDraft(): void;
  runDraft(): boolean;
  applyResult(r: ScenarioResult): void;
  clearResult(): void;
  saveActive(name?: string): void;
  deleteSaved(id: string): void;
  loadSaved(id: string): void;
  toggleCompare(id: string): void;
  setDisplayMode(m: DisplayMode): void;
  setPollutant(p: Pollutant): void;
  toggleLayer(id: LayerId): void;
  setTerrainExaggeration(v: number): void;
  selectCell(id: string | null): void;
  selectIndustry(id: string | null): void;
  setInteraction(m: InteractionMode): void;
  setPendingIndustry(p: Partial<PendingIndustry>): void;
  toggleAreaCell(id: string): void;
  addCandidate(p: LonLat): void;
  clearCandidates(): void;
  setSection(s: Section): void;
  setMapStatus(p: Partial<MapStatus>): void;
  requestFlyTo(lonlat: LonLat, range?: number): void;
  setRightOpen(v: boolean): void;
  setBottomOpen(v: boolean): void;
}

function loadSavedParams(): ScenarioParams[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as ScenarioParams[]) : [];
  } catch {
    return [];
  }
}

const OSM_CACHE_KEY = 'enr01.osmGeometry.v2';

function loadCachedGeometry(): CityGeometry | null {
  try {
    localStorage.removeItem('enr01.osmGeometry.v1'); // v1 could contain duplicate road ids
    const raw = localStorage.getItem(OSM_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CityGeometry) : null;
  } catch {
    return null;
  }
}

function cacheGeometry(geo: CityGeometry | null) {
  try {
    if (geo) localStorage.setItem(OSM_CACHE_KEY, JSON.stringify(geo));
    else localStorage.removeItem(OSM_CACHE_KEY);
  } catch {
    /* quota exceeded or storage blocked — geometry stays in memory for this session */
  }
}

/** Derived observed-data state for the current base / pollutant / window. */
function deriveObserved(
  base: BaseState | null,
  ds: ObservationDataset | null,
  window: AggregationWindow,
  pollutant: Pollutant,
): { stationSummaries: StationSummary[]; observedField: ObservedField | null } {
  if (!base || !ds) return { stationSummaries: [], observedField: null };
  const stationSummaries = summariseStations(ds, window, base);
  return { stationSummaries, observedField: interpolateField(stationSummaries, pollutant, base) };
}

function persistSaved(saved: ScenarioResult[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved.map((s) => s.params)));
  } catch {
    /* storage unavailable — scenarios stay in memory */
  }
}

export const useTwin = create<TwinState>((set, get) => ({
  base: null,
  baseline: [],
  loading: true,
  error: null,
  gridSize: 10,

  draft: null,
  draftErrors: [],
  activeResult: null,
  saved: [],
  compareIds: [],

  displayMode: 'baseline',
  pollutant: 'pm25',
  layers: {
    heatmap: true,
    grid: true,
    roads: true,
    traffic: true,
    industries: true,
    green: true,
    buildings: true,
    terrain: true,
    satellite: true,
    risk: false,
    labels: true,
    elevationTint: false,
    stations: true,
  },
  terrainExaggeration: 1.5,

  selectedCellId: null,
  selectedIndustryId: null,
  interaction: 'select',
  pendingIndustry: { location: null, category: 'Manufacturing', intensity: 70 },
  candidates: [],
  section: 'overview',
  mapStatus: { viewer: 'loading', terrain: '—', imagery: '—', buildings: '—' },
  flyTo: null,
  rightOpen: true,
  bottomOpen: true,

  observations: null,
  aggWindow: 'last24h',
  stationSummaries: [],
  observedField: null,
  weatherObs: null,
  importMessages: [],

  geometry: loadCachedGeometry() ?? DEMO_GEOMETRY,
  osmStatus: { state: 'idle' },
  calibration: null,
  forecastLayer: null,

  setForecastLayer(f) {
    set({ forecastLayer: f, displayMode: !f && get().displayMode === 'forecast' ? 'baseline' : get().displayMode });
  },

  calibrateModel() {
    const { base, stationSummaries, aggWindow, saved } = get();
    if (!base) return;
    const uncalibrated = scenarioService.baseline({ ...base, calibration: null });
    const cal = fitCalibration(stationSummaries, uncalibrated, aggWindow);
    if (!cal) {
      set({ importMessages: [{ level: 'error', text: 'Calibration needs stations with coordinates inside the grid and PM2.5 values.' }] });
      return;
    }
    const nextBase = { ...base, calibration: cal };
    set({
      calibration: cal,
      base: nextBase,
      baseline: scenarioService.baseline(nextBase),
      activeResult: null,
      displayMode: get().displayMode === 'observed' ? 'observed' : 'baseline',
      saved: saved.map((s) => scenarioService.run(nextBase, s.params)),
      importMessages: [
        {
          level: 'info',
          text: `Calibrated PM2.5 to ${cal.stations} station(s): background ×${cal.backgroundScale.toFixed(2)}, local sources ×${cal.localScale.toFixed(2)} — RMSE ${cal.rmseBefore.toFixed(1)} → ${cal.rmseAfter.toFixed(1)} µg/m³ (in-sample).`,
        },
      ],
    });
  },

  clearCalibration() {
    const { base, saved } = get();
    if (!base) return;
    const nextBase = { ...base, calibration: null };
    set({
      calibration: null,
      base: nextBase,
      baseline: scenarioService.baseline(nextBase),
      activeResult: null,
      displayMode: get().displayMode === 'observed' ? 'observed' : 'baseline',
      saved: saved.map((s) => scenarioService.run(nextBase, s.params)),
    });
  },

  async loadOsmGeometry(mode = 'snapshot') {
    const { base } = get();
    if (!base) return;
    set({
      osmStatus: {
        state: 'loading',
        message: mode === 'live' ? 'Downloading live from the OpenStreetMap Overpass API (can take up to a minute)…' : 'Loading bundled OpenStreetMap snapshot…',
      },
    });
    try {
      const geo = mode === 'live' ? await fetchOsmGeometry(base.city.bbox) : await loadOsmSnapshot();
      cacheGeometry(geo);
      set({ geometry: geo });
      await get().init(get().gridSize);
      set({
        osmStatus: {
          state: 'idle',
          message: `Loaded ${geo.roads.length} roads, ${geo.greenAreas.length} green areas, ${geo.industrialAreas.length} industrial zones.`,
        },
      });
    } catch (e) {
      set({
        osmStatus: {
          state: 'error',
          message: `OpenStreetMap ${mode === 'live' ? 'download' : 'snapshot'} failed: ${e instanceof Error ? e.message : String(e)}`,
        },
      });
    }
  },

  async useDemoGeometry() {
    cacheGeometry(null);
    set({ geometry: DEMO_GEOMETRY, osmStatus: { state: 'idle' } });
    await get().init(get().gridSize);
  },

  async init(gridSize = 10) {
    set({ loading: get().base === null, error: null });
    try {
      const base = await dataProvider.getBaseState(gridSize, get().geometry);
      const wObs = get().weatherObs;
      if (wObs) base.weather = { ...wObs.weather };
      // Calibration scalars carry over grid-size changes, but not geometry changes
      // (local source terms change with geometry, so the fit would be stale).
      const prevBase = get().base;
      if (get().calibration && (!prevBase || prevBase.geometrySource === base.geometrySource)) base.calibration = get().calibration;
      else set({ calibration: null });
      const baseline = scenarioService.baseline(base);
      const { observations, aggWindow, pollutant } = get();
      // Saved scenarios only store parameters; results are recomputed deterministically.
      const saved = gridSize === 10 ? loadSavedParams().map((p) => scenarioService.run(base, p)) : [];
      set({
        base,
        baseline,
        gridSize,
        draft: defaultParams(base),
        activeResult: null,
        displayMode: 'baseline',
        saved,
        compareIds: saved.slice(0, 3).map((s) => s.id),
        selectedCellId: null,
        loading: false,
        ...deriveObserved(base, observations, aggWindow, pollutant),
      });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  importObservationFiles(files) {
    const messages: TwinState['importMessages'] = [];
    let ds = get().observations;
    for (const f of files) {
      try {
        const parsed = parseObservationCsv(f.text, f.name);
        ds = mergeObservations(ds, parsed, f.name);
        messages.push({
          level: 'info',
          text: `${f.name}: ${parsed.records.length.toLocaleString()} records, ${parsed.stations.length} station(s), pollutants ${parsed.pollutants.join(', ').toUpperCase()}.`,
        });
        parsed.warnings.forEach((w) => messages.push({ level: 'warn', text: w }));
      } catch (e) {
        messages.push({ level: 'error', text: e instanceof Error ? e.message : String(e) });
      }
    }
    const { base, aggWindow, pollutant } = get();
    set({ observations: ds, importMessages: messages, ...deriveObserved(base, ds, aggWindow, pollutant) });
  },

  setStationLocation(stationId, location) {
    const ds = get().observations;
    if (!ds) return;
    const next = { ...ds, stations: ds.stations.map((s) => (s.id === stationId ? { ...s, location } : s)) };
    const { base, aggWindow, pollutant } = get();
    set({ observations: next, ...deriveObserved(base, next, aggWindow, pollutant) });
  },

  setAggWindow(w) {
    const { base, observations, pollutant } = get();
    set({ aggWindow: w, ...deriveObserved(base, observations, w, pollutant) });
  },

  clearObservations() {
    set({
      observations: null,
      stationSummaries: [],
      observedField: null,
      importMessages: [],
      displayMode: get().displayMode === 'observed' ? 'baseline' : get().displayMode,
    });
  },

  importWeatherFile(file) {
    const { base, draft, saved } = get();
    if (!base) return;
    try {
      const { obs, warnings } = parseWeatherCsv(file.text, file.name);
      const nextBase = { ...base, weather: { ...obs.weather } };
      set({
        weatherObs: obs,
        base: nextBase,
        baseline: scenarioService.baseline(nextBase),
        draft: draft ? { ...draft, weather: { ...obs.weather } } : draft,
        activeResult: null,
        displayMode: get().displayMode === 'observed' ? 'observed' : 'baseline',
        saved: saved.map((s) => scenarioService.run(nextBase, s.params)),
        importMessages: [
          { level: 'info', text: `${file.name}: weather set from ${obs.records} record(s), ${obs.period}.` },
          ...warnings.map((text) => ({ level: 'warn' as const, text })),
        ],
      });
    } catch (e) {
      set({ importMessages: [{ level: 'error', text: e instanceof Error ? e.message : String(e) }] });
    }
  },

  clearWeatherObservation() {
    const { base, draft, saved } = get();
    if (!base) return;
    const nextBase = { ...base, weather: { ...DEMO_WEATHER } };
    set({
      weatherObs: null,
      base: nextBase,
      baseline: scenarioService.baseline(nextBase),
      draft: draft ? { ...draft, weather: { ...DEMO_WEATHER } } : draft,
      activeResult: null,
      displayMode: get().displayMode === 'observed' ? 'observed' : 'baseline',
      saved: saved.map((s) => scenarioService.run(nextBase, s.params)),
    });
  },

  async setGridSize(n) {
    if (n === get().gridSize) return;
    await get().init(n);
  },

  updateDraft(p) {
    const d = get().draft;
    if (d) set({ draft: { ...d, ...p } });
  },
  updateWeather(p) {
    const d = get().draft;
    if (d) set({ draft: { ...d, weather: { ...d.weather, ...p } } });
  },
  resetDraft() {
    const base = get().base;
    if (base) set({ draft: defaultParams(base), draftErrors: [] });
  },

  runDraft() {
    const { base, draft } = get();
    if (!base || !draft) return false;
    const errors = validateParams(draft);
    if (errors.length) {
      set({ draftErrors: errors });
      return false;
    }
    const name = draft.name && draft.name !== 'Baseline' ? draft.name : `Scenario ${get().saved.length + 1}`;
    const result = scenarioService.run(base, { ...draft, name });
    set({ activeResult: result, displayMode: 'scenario', draftErrors: [] });
    return true;
  },

  applyResult(r) {
    set({ activeResult: r, displayMode: 'scenario' });
  },
  clearResult() {
    set({ activeResult: null, displayMode: 'baseline' });
  },

  saveActive(name) {
    const { activeResult, saved } = get();
    if (!activeResult) return;
    if (saved.some((s) => s.id === activeResult.id)) return;
    const r = name ? { ...activeResult, params: { ...activeResult.params, name } } : activeResult;
    const next = [...saved, r];
    persistSaved(next);
    set({ saved: next, compareIds: [...get().compareIds, r.id].slice(-4) });
  },
  deleteSaved(id) {
    const next = get().saved.filter((s) => s.id !== id);
    persistSaved(next);
    set({ saved: next, compareIds: get().compareIds.filter((c) => c !== id) });
  },
  loadSaved(id) {
    const s = get().saved.find((x) => x.id === id);
    if (s) set({ activeResult: s, draft: { ...s.params }, displayMode: 'scenario' });
  },
  toggleCompare(id) {
    const c = get().compareIds;
    set({ compareIds: c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-4) });
  },

  setDisplayMode(m) {
    set({ displayMode: m });
  },
  setPollutant(p) {
    const { base, observations, aggWindow } = get();
    const derived = deriveObserved(base, observations, aggWindow, p);
    set({
      pollutant: p,
      ...derived,
      displayMode: get().displayMode === 'observed' && !derived.observedField ? 'baseline' : get().displayMode,
    });
  },
  toggleLayer(id) {
    set({ layers: { ...get().layers, [id]: !get().layers[id] } });
  },
  setTerrainExaggeration(v) {
    set({ terrainExaggeration: v });
  },
  selectCell(id) {
    set({ selectedCellId: id, selectedIndustryId: null, rightOpen: id ? true : get().rightOpen });
  },
  selectIndustry(id) {
    set({ selectedIndustryId: id, rightOpen: id ? true : get().rightOpen });
  },
  setInteraction(m) {
    set({ interaction: m });
  },
  setPendingIndustry(p) {
    set({ pendingIndustry: { ...get().pendingIndustry, ...p } });
  },
  toggleAreaCell(id) {
    const d = get().draft;
    if (!d) return;
    const has = d.targetCells.includes(id);
    set({ draft: { ...d, targetCells: has ? d.targetCells.filter((c) => c !== id) : [...d.targetCells, id] } });
  },
  addCandidate(p) {
    const c = get().candidates;
    const letters = 'ABCDE';
    const next = c.length >= 5 ? [...c.slice(1), { id: '', location: p }] : [...c, { id: '', location: p }];
    set({ candidates: next.map((x, i) => ({ ...x, id: letters[i] })) });
  },
  clearCandidates() {
    set({ candidates: [] });
  },
  setSection(s) {
    const interaction = s === 'locations' ? 'pick-candidate' : get().interaction === 'pick-candidate' ? 'select' : get().interaction;
    set({ section: s, interaction });
  },
  setMapStatus(p) {
    set({ mapStatus: { ...get().mapStatus, ...p } });
  },
  requestFlyTo(lonlat, range = 6000) {
    set({ flyTo: { lonlat, range, nonce: Date.now() } });
  },
  setRightOpen(v) {
    set({ rightOpen: v });
  },
  setBottomOpen(v) {
    set({ bottomOpen: v });
  },
}));

export function isScenarioMode(m: DisplayMode): boolean {
  return m === 'scenario' || m === 'delta';
}

/** Modeled states currently shown (baseline, or the active scenario in scenario / Δ mode). */
export function useDisplayedStates(): CellState[] {
  return useTwin((s) => (isScenarioMode(s.displayMode) && s.activeResult ? s.activeResult.scenario : s.baseline));
}
