import { create } from 'zustand';
import type {
  BaseState,
  CandidateLocation,
  CellState,
  DisplayMode,
  IndustryCategory,
  InteractionMode,
  LayerId,
  LonLat,
  Pollutant,
  ScenarioParams,
  ScenarioResult,
  Section,
  Weather,
} from '../types';
import { dataProvider } from '../services/dataProvider';
import { defaultParams, scenarioService, validateParams } from '../services/scenarioService';

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

  init(gridSize?: number): Promise<void>;
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

  async init(gridSize = 10) {
    set({ loading: true, error: null });
    try {
      const base = await dataProvider.getBaseState(gridSize);
      const baseline = scenarioService.baseline(base);
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
      });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
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
    set({ pollutant: p });
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

/** States currently shown on the map (baseline or active scenario). */
export function useDisplayedStates(): CellState[] {
  return useTwin((s) => (s.displayMode !== 'baseline' && s.activeResult ? s.activeResult.scenario : s.baseline));
}
