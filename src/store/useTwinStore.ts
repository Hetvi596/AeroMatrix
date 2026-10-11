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
import { PUNE_LOCALITIES } from '../data/geojson/puneLocalities';
import { fetchOsmGeometry, loadOsmSnapshot } from '../services/osmGeometry';
import { loadIndustryData, type IndustryData } from '../services/industryData';
import type { PlanOutcome, OperationalLimits, Objective } from '../plan/planEngine';
import type { LiveAirPoint, LiveWeather } from '../services/openMeteo';
import { modelApi, modelQuality, type ModelQuality, type ApiAqiHistory, type ApiForecast, type ApiHealth, type ApiMeasured, type ApiStation, type ApiUnavailable } from '../services/aeromatrixApi';

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

/** Inputs for the candidate-site comparison (Sites screen and its details drawer). */
export interface SiteProject {
  category: IndustryCategory;
  intensity: number;
  greenBuffer: boolean;
}

/** Plan-It form and results; kept in the store so closing the panel keeps the work. */
export interface PlanItState {
  budget: number;
  targetId: string | null;
  limits: OperationalLimits;
  objective: Objective;
  view: 'form' | 'results';
  outcome: PlanOutcome | null;
  /** Base state the outcome was computed for; a grid or data change makes it stale. */
  outcomeBase: BaseState | null;
  selected: 'A' | 'B' | 'C';
}

/** Region id for Kothrud: source-reported AQI history only, no concentration station. */
export const KOTHRUD_ID = 'kothrud';

export interface ModelServiceState {
  status: 'idle' | 'checking' | 'online' | 'offline';
  health: ApiHealth | null;
  error?: string;
}

/** Forecast for one station in one mode (current / historical), cached by forecastKey(). */
export interface StationForecastState {
  stationId: string;
  allowHistorical: boolean;
  loading: boolean;
  data: ApiForecast | ApiUnavailable | null;
  error?: string;
}

/** Cache key: results are stored per station and mode, so a late response can only land on its own entry. */
export function forecastKey(stationId: string, allowHistorical: boolean): string {
  return `${stationId}|${allowHistorical ? 'historical' : 'current'}`;
}

/** Open-Meteo air-quality model data and weather (see services/liveData.ts). */
export interface LiveDataState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  /** Points by id: zone:<cellId>, place:<verified place id>, loc:<locality id>. */
  points: Record<string, LiveAirPoint>;
  /** Grid cells the zone points were requested for; zone points from another grid are never shown. */
  zoneCells: BaseState['cells'] | null;
  updatedAt: number | null;
  weather: LiveWeather | null;
  weatherError: string | null;
}

export interface FlyToRequest {
  lonlat: LonLat;
  range: number;
  pitch?: number;
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
  selectedCandidateId: string | null;
  siteProject: SiteProject;

  // Trained model backend (monitoring stations)
  modelService: ModelServiceState;
  stations: ApiStation[];
  stationMeasured: Record<string, ApiMeasured | ApiUnavailable>;
  stationAqiHistory: Record<string, ApiAqiHistory | ApiUnavailable>;
  selectedStationId: string | null;
  /** Station forecasts by forecastKey(). */
  forecasts: Record<string, StationForecastState>;
  /** Region (monitoring station) chosen in the What-If simulator. */
  whatIfRegionId: string | null;
  setWhatIfRegion(id: string | null): void;
  /** Re-run the scenario automatically while What-If parameters change. */
  liveScenario: boolean;
  setLiveScenario(v: boolean): void;
  /** Which point of the forecast chart is inspected. */
  forecastTime: 'reference' | 'forecast';
  setForecastTime(t: 'reference' | 'forecast'): void;
  /** Each trained model's test-period result against the persistence baseline. */
  modelQuality: Record<string, ModelQuality>;
  /** Trained PM2.5 model's empirical interval (validation residual P90), µg/m³. */
  pm25Interval: { radius: number; testCoverage: number; method: string } | null;
  allowHistoricalForecast: boolean;
  connectModelService(): Promise<void>;
  selectStation(id: string | null): void;
  setAllowHistoricalForecast(v: boolean): void;

  // Open-Meteo model data and live weather
  live: LiveDataState;
  setLive(p: Partial<LiveDataState>): void;
  /** Use a weather record as the scenario engine's baseline weather. */
  applyWeatherObservation(obs: WeatherObservation, message?: string): void;

  // Plan-It (budget-constrained intervention planning)
  planItOpen: boolean;
  setPlanItOpen(v: boolean): void;
  planIt: PlanItState;
  setPlanIt(p: Partial<PlanItState>): void;
  /** Temporary map preview of a scenario; never changes the active scenario. */
  previewResult: ScenarioResult | null;
  setPreviewResult(r: ScenarioResult | null): void;
  /** Make a fully computed scenario the active one (draft + result together). Returns an error message or null. */
  applyScenario(r: ScenarioResult): string | null;

  // Industrial geography (MIDC estates, mapped OSM sites, emission factors)
  industry: IndustryData | null;
  industryStatus: 'idle' | 'loading' | 'ready' | 'error';
  selectedIndustrialArea: number | null;
  selectedIndustrySite: string | null;
  loadIndustry(): Promise<void>;
  selectIndustrialArea(code: number | null): void;
  selectIndustrySite(id: string | null): void;
  section: Section;
  mapStatus: MapStatus;
  flyTo: FlyToRequest | null;
  rightOpen: boolean;
  bottomOpen: boolean;
  /** Left section panel expanded (the rail is always visible). */
  leftOpen: boolean;
  /** First-visit guide overlay. */
  introOpen: boolean;
  /** Map swipe comparison: baseline (left) vs active scenario (right). */
  compareOn: boolean;
  /** Divider position for the swipe comparison, 0..1 of map width. */
  comparePos: number;

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
  removeCandidate(id: string): void;
  selectCandidate(id: string | null): void;
  setSiteProject(p: Partial<SiteProject>): void;
  setSection(s: Section): void;
  setMapStatus(p: Partial<MapStatus>): void;
  requestFlyTo(lonlat: LonLat, range?: number, pitch?: number): void;
  highlightedPlace: string | null;
  goToPlace(id: string | null): void;
  setRightOpen(v: boolean): void;
  setBottomOpen(v: boolean): void;
  setLeftOpen(v: boolean): void;
  setIntroOpen(v: boolean): void;
  setCompare(on: boolean): void;
  setComparePos(p: number): void;
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
    buildings: true, // procedural demo massing, as in the committed map
    terrain: true,
    satellite: true,
    risk: false,
    labels: true,
    elevationTint: false,
    stations: true,
    shadows: true,
    photoreal: true, // only takes effect when a token / key is configured
    places: true,
    midcAreas: false, // off by default so the base map matches the Sep 29 view; Industries turns them on
    industrySites: false,
  },
  terrainExaggeration: 1.5,

  selectedCellId: null,
  selectedIndustryId: null,
  interaction: 'select',
  pendingIndustry: { location: null, category: 'Manufacturing', intensity: 70 },
  candidates: [],
  selectedCandidateId: null,
  siteProject: { category: 'Manufacturing', intensity: 70, greenBuffer: false },

  modelService: { status: 'idle', health: null },
  stations: [],
  stationMeasured: {},
  stationAqiHistory: {},
  selectedStationId: null,
  forecasts: {},
  whatIfRegionId: null,
  liveScenario: true,
  forecastTime: 'forecast',
  setWhatIfRegion(id) {
    set({ whatIfRegionId: id });
    if (id) ensureForecast(id);
  },
  setLiveScenario(v) {
    set({ liveScenario: v });
  },
  setForecastTime(t) {
    set({ forecastTime: t });
  },
  pm25Interval: null,
  modelQuality: {},
  allowHistoricalForecast: false,

  live: { status: 'idle', error: null, points: {}, zoneCells: null, updatedAt: null, weather: null, weatherError: null },
  setLive(p) {
    set({ live: { ...get().live, ...p } });
  },
  applyWeatherObservation(obs, message) {
    const { base, draft, saved, displayMode } = get();
    if (!base) return;
    const nextBase = { ...base, weather: { ...obs.weather } };
    set({
      weatherObs: obs,
      base: nextBase,
      baseline: scenarioService.baseline(nextBase),
      draft: draft ? { ...draft, weather: { ...obs.weather } } : draft,
      activeResult: null,
      displayMode: displayMode === 'observed' || displayMode === 'current' ? displayMode : 'baseline',
      saved: saved.map((s) => scenarioService.run(nextBase, s.params)),
      ...(message ? { importMessages: [{ level: 'info' as const, text: message }] } : {}),
    });
  },

  planItOpen: false,
  setPlanItOpen(v) {
    // Closing Plan-It always ends a map preview.
    set(v ? { planItOpen: true } : { planItOpen: false, previewResult: null });
  },
  planIt: {
    budget: 2500000,
    targetId: null,
    limits: { maxInterventions: null, unavailable: [], plantingCapacity: null },
    objective: 'pm25',
    view: 'form',
    outcome: null,
    outcomeBase: null,
    selected: 'A',
  },
  setPlanIt(p) {
    set({ planIt: { ...get().planIt, ...p } });
  },
  previewResult: null,
  setPreviewResult(r) {
    set({ previewResult: r });
  },
  applyScenario(r) {
    const { base } = get();
    if (!base) return 'The city data isn’t loaded.';
    const errors = validateParams(r.params);
    if (errors.length) return errors.join(' ');
    if (r.baseline.length !== base.cells.length || r.baseline.some((s, i) => s.cellId !== base.cells[i].id))
      return 'This plan was made for a different grid. Generate it again.';
    // One atomic update: draft, active scenario and view change together, or not at all.
    set({
      draft: { ...r.params },
      activeResult: r,
      displayMode: get().displayMode === 'delta' ? 'delta' : 'scenario',
      previewResult: null,
      draftErrors: [],
    });
    return null;
  },

  industry: null,
  industryStatus: 'idle',
  selectedIndustrialArea: null,
  selectedIndustrySite: null,
  async loadIndustry() {
    if (get().industryStatus === 'loading' || get().industryStatus === 'ready') return;
    set({ industryStatus: 'loading' });
    try {
      set({ industry: await loadIndustryData(), industryStatus: 'ready' });
    } catch {
      set({ industryStatus: 'error' });
    }
  },
  selectIndustrialArea(code) {
    set({
      selectedIndustrialArea: code,
      ...(code !== null ? { ...NO_SELECTION, selectedIndustrialArea: code, rightOpen: true } : {}),
    });
  },
  selectIndustrySite(id) {
    set({
      selectedIndustrySite: id,
      ...(id !== null ? { ...NO_SELECTION, selectedIndustrySite: id, rightOpen: true } : {}),
    });
  },

  async connectModelService() {
    if (get().modelService.status === 'checking') return;
    set({ modelService: { status: 'checking', health: get().modelService.health } });
    try {
      const health = await modelApi.health();
      const regions = await modelApi.regions();
      const stations = regions.station_locations;
      // Measured snapshots are small static files on the backend; fetch them all for the station list.
      const measured = await Promise.all(stations.map((st) => modelApi.pollution(st.station).catch(() => null)));
      const stationMeasured: Record<string, ApiMeasured | ApiUnavailable> = {};
      stations.forEach((st, i) => {
        if (measured[i]) stationMeasured[st.station] = measured[i]!;
      });
      const metrics = await modelApi.metrics('pm25').catch(() => null);
      const iv = metrics?.pm25?.interval;
      const all = await modelApi.allMetrics().catch(() => null);
      set({
        modelService: { status: 'online', health },
        stations,
        stationMeasured,
        pm25Interval: iv ? { radius: iv.radius, testCoverage: iv.test_coverage, method: iv.method } : null,
        modelQuality: all ? modelQuality(all) : {},
      });
      const sel = get().selectedStationId;
      if (sel) loadStationDetails(sel);
      const region = get().whatIfRegionId;
      if (region) ensureForecast(region);
    } catch (e) {
      set({ modelService: { status: 'offline', health: null, error: e instanceof Error ? e.message : String(e) } });
    }
  },
  selectStation(id) {
    set({
      selectedStationId: id,
      selectedCellId: id ? null : get().selectedCellId,
      selectedIndustryId: id ? null : get().selectedIndustryId,
      selectedCandidateId: id ? null : get().selectedCandidateId,
      ...(id ? { selectedIndustrialArea: null, selectedIndustrySite: null } : {}),
      rightOpen: id ? true : get().rightOpen,
    });
    if (id) loadStationDetails(id);
  },
  setAllowHistoricalForecast(v) {
    set({ allowHistoricalForecast: v });
    const sel = get().selectedStationId;
    if (sel && sel !== KOTHRUD_ID) ensureForecast(sel);
    const region = get().whatIfRegionId;
    if (region) ensureForecast(region);
  },
  section: 'overview',
  mapStatus: { viewer: 'loading', terrain: '—', imagery: '—', buildings: '—' },
  flyTo: null,
  rightOpen: true,
  bottomOpen: false,
  leftOpen: true,
  introOpen: (() => {
    try {
      return localStorage.getItem('enr01.introSeen') !== '1';
    } catch {
      return true;
    }
  })(),
  compareOn: false,
  comparePos: 0.5,

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
    if (!get().base) return;
    try {
      const { obs, warnings } = parseWeatherCsv(file.text, file.name);
      get().applyWeatherObservation(obs);
      set({
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
      displayMode: get().displayMode === 'observed' || get().displayMode === 'current' ? get().displayMode : 'baseline',
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
    set({ activeResult: result, displayMode: get().displayMode === 'delta' ? 'delta' : 'scenario', draftErrors: [] });
    return true;
  },

  applyResult(r) {
    set({ activeResult: r, displayMode: 'scenario' });
  },
  clearResult() {
    // Back to the current model data when it is loaded, otherwise the baseline.
    set({ activeResult: null, displayMode: hasCurrentField(get(), get().pollutant) ? 'current' : 'baseline', compareOn: false });
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
      displayMode:
        (get().displayMode === 'observed' && !derived.observedField) || (get().displayMode === 'current' && !hasCurrentField(get(), p))
          ? 'baseline'
          : get().displayMode,
    });
  },
  toggleLayer(id) {
    set({ layers: { ...get().layers, [id]: !get().layers[id] } });
  },
  setTerrainExaggeration(v) {
    set({ terrainExaggeration: v });
  },
  selectCell(id) {
    set({
      selectedCellId: id,
      selectedIndustryId: null,
      selectedCandidateId: id ? null : get().selectedCandidateId,
      selectedStationId: id ? null : get().selectedStationId,
      ...(id ? { selectedIndustrialArea: null, selectedIndustrySite: null } : {}),
      rightOpen: id ? true : get().rightOpen,
    });
  },
  selectIndustry(id) {
    set({
      selectedIndustryId: id,
      selectedCandidateId: id ? null : get().selectedCandidateId,
      selectedStationId: id ? null : get().selectedStationId,
      ...(id ? { selectedIndustrialArea: null, selectedIndustrySite: null } : {}),
      rightOpen: id ? true : get().rightOpen,
    });
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
    // At most five sites; the oldest rolls off. Sites keep their letter, a new one takes the first free letter.
    const kept = get().candidates.length >= 5 ? get().candidates.slice(1) : get().candidates;
    const id = [...'ABCDE'].find((l) => !kept.some((x) => x.id === l))!;
    const sel = get().selectedCandidateId;
    set({ candidates: [...kept, { id, location: p }], selectedCandidateId: sel && kept.some((x) => x.id === sel) ? sel : null });
  },
  removeCandidate(id) {
    const s = get();
    set({ candidates: s.candidates.filter((c) => c.id !== id), selectedCandidateId: s.selectedCandidateId === id ? null : s.selectedCandidateId });
  },
  clearCandidates() {
    set({ candidates: [], selectedCandidateId: null });
  },
  selectCandidate(id) {
    set({
      selectedCandidateId: id,
      selectedCellId: id ? null : get().selectedCellId,
      selectedIndustryId: id ? null : get().selectedIndustryId,
      selectedStationId: id ? null : get().selectedStationId,
      ...(id ? { selectedIndustrialArea: null, selectedIndustrySite: null } : {}),
      rightOpen: id ? true : get().rightOpen,
    });
  },
  setSiteProject(p) {
    set({ siteProject: { ...get().siteProject, ...p } });
  },
  setSection(s) {
    const interaction = s === 'locations' ? 'pick-candidate' : get().interaction === 'pick-candidate' ? 'select' : get().interaction;
    set({ section: s, interaction });
  },
  setMapStatus(p) {
    set({ mapStatus: { ...get().mapStatus, ...p } });
  },
  requestFlyTo(lonlat, range = 6000, pitch) {
    set({ flyTo: { lonlat, range, pitch, nonce: Date.now() } });
  },
  highlightedPlace: null,
  goToPlace(id) {
    const place = id ? PUNE_LOCALITIES.find((p) => p.id === id) : undefined;
    set({ highlightedPlace: place ? place.id : null });
    // Oblique close-up: ~2 km away, 32° down — buildings and the area label both readable.
    if (place) get().requestFlyTo(place.location, 2200, -32);
  },
  setRightOpen(v) {
    set({ rightOpen: v });
  },
  setBottomOpen(v) {
    set({ bottomOpen: v });
  },
  setLeftOpen(v) {
    set({ leftOpen: v });
  },
  setIntroOpen(v) {
    if (!v) {
      try {
        localStorage.setItem('enr01.introSeen', '1');
      } catch {
        /* storage blocked — the guide will simply show again next visit */
      }
    }
    set({ introOpen: v });
  },
  setCompare(on) {
    // Comparison needs a scenario; it shows baseline vs scenario side by side.
    const ok = on && !!get().activeResult;
    set({ compareOn: ok, displayMode: ok ? 'scenario' : get().displayMode });
  },
  setComparePos(p) {
    set({ comparePos: Math.max(0.04, Math.min(0.96, p)) });
  },
}));

/** Clears every map / list selection (used when a new kind of item is selected). */
const NO_SELECTION = {
  selectedCellId: null,
  selectedIndustryId: null,
  selectedCandidateId: null,
  selectedStationId: null,
  selectedIndustrialArea: null,
  selectedIndustrySite: null,
} as const;

// Station forecast / AQI history loading, outside the store so a newer selection can
// cancel an older request before its result lands on the wrong station.
function loadStationDetails(id: string) {
  const s = useTwin.getState();
  if (s.modelService.status !== 'online') return;
  if (!s.stationAqiHistory[id]) {
    modelApi
      .aqiHistory(id === KOTHRUD_ID ? 'Kothrud' : id)
      .then((h) => useTwin.setState({ stationAqiHistory: { ...useTwin.getState().stationAqiHistory, [id]: h } }))
      .catch(() => undefined);
  }
  if (id !== KOTHRUD_ID) ensureForecast(id);
}

/**
 * Fetches a station forecast once per (station, mode). Results are written to their own
 * cache entry, so switching stations quickly can never show one station's numbers on another.
 */
function ensureForecast(id: string) {
  const s = useTwin.getState();
  if (s.modelService.status !== 'online') return;
  const allowHistorical = s.allowHistoricalForecast;
  const key = forecastKey(id, allowHistorical);
  const existing = s.forecasts[key];
  if (existing && (existing.loading || !existing.error)) return;
  const put = (entry: StationForecastState) => useTwin.setState({ forecasts: { ...useTwin.getState().forecasts, [key]: entry } });
  put({ stationId: id, allowHistorical, loading: true, data: null });
  modelApi
    .forecast(id, allowHistorical)
    .then((data) => put({ stationId: id, allowHistorical, loading: false, data }))
    .catch((e) => put({ stationId: id, allowHistorical, loading: false, data: null, error: e instanceof Error ? e.message : String(e) }));
}

/** True when Open-Meteo model data covers every zone of the current grid for this pollutant. */
export function hasCurrentField(s: Pick<TwinState, 'live' | 'base'>, p: Pollutant): boolean {
  const cells = s.base?.cells;
  if (!cells || s.live.zoneCells !== cells) return false;
  return cells.every((c) => s.live.points[`zone:${c.id}`]?.values[p] != null);
}

export function isScenarioMode(m: DisplayMode): boolean {
  return m === 'scenario' || m === 'delta';
}

/** Modeled states currently shown (baseline, or the active scenario in scenario / Δ mode). */
export function useDisplayedStates(): CellState[] {
  return useTwin((s) => (isScenarioMode(s.displayMode) && s.activeResult ? s.activeResult.scenario : s.baseline));
}
