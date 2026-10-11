// Mounts the single AeroSage assistant in the AeroMatrix map stage.
//
// - Context: built only from verified app state (selection, pollutant, section, active
//   scenario). Nothing is guessed; map_location is sent only for an actual selection.
// - Actions: the module's allowlisted parser + existingTwinAdapter, wired to the real
//   store. Every outcome is checked against the store afterwards, so AeroSage never
//   reports a change the application didn't make.
// - Layout: launcher bottom-right, beside any open right-hand panel; the open panel docks
//   in the right column on wide screens (map controls step aside) and becomes a bottom
//   sheet on narrow ones. See .aerosage-host in aerosage-host.css.

import { useEffect, useMemo, useRef } from 'react';
import { KOTHRUD_ID, useTwin } from '../store/useTwinStore';
import { AeroSageChat } from './components/AeroSageChat';
import { existingTwinAdapter } from './services/existingTwinAdapter';
import type { Action, ActionAdapter, Outcome } from './services/aeromatrixActions';
import type { AppContext } from './types';
import { PUNE_LOCALITIES } from '../data/geojson/puneLocalities';
import { VERIFIED_PLACES, stationPlace } from '../data/geojson/verifiedPlaces';
import { zonePlaceNames } from '../utils/zones';
import { paramsKey } from '../scenarios/liveScenario';
import { defaultParams } from '../services/scenarioService';
import { POLLUTANT_LABEL } from '../utils/colors';
import type { LonLat } from '../types';
import { SECTION_LABEL } from '../components/OrbitNav';
import './styles/aerosage-host.css';

/** Chatbot service origin. Only a URL: provider keys stay in backend/chatbot/.env. */
export const CHATBOT_API_URL = ((import.meta.env.VITE_CHATBOT_API_URL as string | undefined)?.trim() || 'http://127.0.0.1:8010').replace(/\/$/, '');

/** Wide enough to dock the panel beside the map; narrower screens get a bottom sheet. */
const DOCK_MIN_WIDTH = 1024;
/** Map width that must stay visible beside a docked panel before the section panel is folded away. */
const MIN_MAP_WIDTH = 320;

// ---------------------------------------------------------------- context

type S = ReturnType<typeof useTwin.getState>;

const round = (v: number) => Math.round(v * 1e5) / 1e5;
const loc = (l: LonLat) => ({ longitude: round(l[0]), latitude: round(l[1]) });

export function buildContext(s: S): AppContext {
  const ctx: AppContext = { selected_pollutant: s.pollutant, active_section: SECTION_LABEL[s.section] ?? s.section };
  if (s.selectedStationId === KOTHRUD_ID) {
    ctx.selected_region = 'Kothrud';
    ctx.map_location = loc(VERIFIED_PLACES.kothrud.location);
  } else if (s.selectedStationId) {
    const st = s.stations.find((x) => x.station === s.selectedStationId);
    if (st) {
      ctx.selected_station = st.name;
      ctx.selected_region = st.name;
      const p = stationPlace(st.station);
      if (p) ctx.map_location = loc(p.location);
    }
  } else if (s.highlightedPlace) {
    const l = PUNE_LOCALITIES.find((x) => x.id === s.highlightedPlace);
    if (l) {
      ctx.selected_region = l.name;
      ctx.map_location = loc((VERIFIED_PLACES[l.id] ?? l).location);
    }
  } else if (s.selectedCellId && s.base) {
    const c = s.base.cells.find((x) => x.id === s.selectedCellId);
    if (c) {
      ctx.selected_region = zonePlaceNames(s.base.cells).get(c.id) ?? `Zone ${c.id}`;
      ctx.map_location = loc(c.center);
    }
  }
  if (s.selectedIndustryId && s.base) {
    const i = s.base.industries.find((x) => x.id === s.selectedIndustryId);
    if (i) ctx.selected_factory = `${i.name} (${i.id}, illustrative prototype source)`;
  }
  const r = s.activeResult;
  if (r) {
    if (/^[a-zA-Z0-9_-]{1,80}$/.test(r.id)) ctx.scenario_id = r.id;
    ctx.scenario_description =
      `${r.params.name}. Prototype rule-based What-If estimate (hypothetical, uncalibrated): mean ${POLLUTANT_LABEL.pm25} across the grid ` +
      `${r.summary.meanBaseline.toFixed(1)} → ${r.summary.meanScenario.toFixed(1)} µg/m³; ${r.affectedZones.length} zones changed by at least 0.5 µg/m³.`;
  }
  return ctx;
}

// ---------------------------------------------------------------- actions

/** Names the map can fly to: OSM-verified places, station names, then the app's locality centres. */
export function regionCentres(s: Pick<S, 'stations'>): Record<string, LonLat> {
  const out: Record<string, LonLat> = {};
  for (const l of PUNE_LOCALITIES) {
    out[l.name] = l.location;
    for (const a of l.aliases ?? []) out[a] = l.location;
  }
  for (const p of Object.values(VERIFIED_PLACES)) out[p.name] = p.location;
  for (const st of s.stations) {
    const p = stationPlace(st.station);
    if (p) out[st.name] = p.location;
  }
  return out;
}

/** The module's adapter on the real store, with sections that also open the section panel. */
function storeView() {
  const s = useTwin.getState();
  return {
    ...s,
    setSection: (section: Parameters<S['setSection']>[0]) => {
      s.setSection(section);
      s.setLeftOpen(true);
    },
    requestFlyTo: (lonlat: LonLat, range?: number) => {
      // A known locality: fly there and highlight it (shows its current value); otherwise just fly.
      const l = PUNE_LOCALITIES.find((x) => x.location[0] === lonlat[0] && x.location[1] === lonlat[1]);
      if (l) s.goToPlace(l.id);
      else s.requestFlyTo(lonlat, range ?? 5000, -32);
    },
  };
}

/** Post-condition for each action, read from the store after the handler ran. */
function verify(a: Action, before: S, after: S): string | null {
  switch (a.type) {
    case 'navigate_to_section':
      return after.section === (a.section === 'map' ? 'overview' : a.section === 'sites' ? 'locations' : a.section) ? null : 'the section did not change';
    case 'open_scenario':
      return after.section === 'simulator' ? null : 'the What-If simulator did not open';
    case 'show_industries':
      return after.section === 'industries' ? null : 'the industries panel did not open';
    case 'set_pollutant':
      return after.pollutant === a.pollutant ? null : 'the pollutant did not change';
    case 'show_heatmap':
      return after.layers.heatmap ? null : 'the heatmap layer is still off';
    case 'update_scenario_parameter':
      return after.draft && Math.abs(after.draft.trafficMultiplier - (1 - a.value / 100)) < 1e-9 ? null : 'the traffic setting did not change';
    case 'run_scenario':
      return after.activeResult && after.draft && paramsKey(after.activeResult.params) === paramsKey(after.draft) ? null : 'no scenario result was produced';
    case 'reset_scenario':
      return after.base && after.draft && paramsKey(after.draft) === paramsKey(defaultParams(after.base)) ? null : 'the draft is not back at the baseline';
    case 'show_scenario':
      return after.displayMode === a.mode ? null : 'the map view did not change';
    case 'focus_map_location':
      return after.flyTo && after.flyTo !== before.flyTo ? null : 'the map did not move';
    default:
      return null;
  }
}

export function verifiedTwinAdapter(): ActionAdapter {
  const inner = existingTwinAdapter(storeView as never, regionCentres(useTwin.getState()));
  return {
    supports: (a) => inner.supports(a),
    async execute(a): Promise<Outcome> {
      const before = useTwin.getState();
      const out = await inner.execute(a);
      if (out.status !== 'executed') return out;
      const after = useTwin.getState();
      const problem = verify(a, before, after);
      if (problem) return { status: 'error', message: `The application did not confirm this change: ${problem}.` };
      if (a.type === 'run_scenario' && after.activeResult) {
        const r = after.activeResult;
        return {
          ...out,
          message: `Scenario calculated by the prototype What-If engine: mean PM2.5 across the grid ${r.summary.meanBaseline.toFixed(1)} → ${r.summary.meanScenario.toFixed(1)} µg/m³ (hypothetical, uncalibrated).`,
        };
      }
      if (a.type === 'focus_map_location') return { ...out, message: `Moved the map to ${a.region.replace(/\b\w/g, (c) => c.toUpperCase())}.` };
      if (a.type === 'set_pollutant') return { ...out, message: `Switched the map and panels to ${POLLUTANT_LABEL[a.pollutant]}.` };
      if (a.type === 'show_heatmap') return { ...out, message: 'The pollution heatmap layer is on.' };
      if (a.type === 'navigate_to_section' || a.type === 'open_scenario') return { ...out, message: `Opened ${SECTION_LABEL[after.section] ?? after.section}.` };
      if (a.type === 'show_scenario') return { ...out, message: a.mode === 'delta' ? 'The map now shows the scenario change.' : 'The map now shows the model baseline.' };
      return out;
    },
  };
}

// ---------------------------------------------------------------- host

export function AeroSageHost({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const section = useTwin((s) => s.section);
  const pollutant = useTwin((s) => s.pollutant);
  const station = useTwin((s) => s.selectedStationId);
  const stations = useTwin((s) => s.stations);
  const place = useTwin((s) => s.highlightedPlace);
  const cell = useTwin((s) => s.selectedCellId);
  const industry = useTwin((s) => s.selectedIndustryId);
  const result = useTwin((s) => s.activeResult);
  const base = useTwin((s) => s.base);
  const context = useMemo(
    () => buildContext(useTwin.getState()),
    // Rebuilt when any selection that feeds the context changes.
    [section, pollutant, station, stations, place, cell, industry, result, base],
  );
  const actions = useMemo(() => verifiedTwinAdapter(), [stations]);

  // Keep a strip of map visible beside the docked panel: fold the section panel away on
  // narrower screens while AeroSage is open, and restore it when AeroSage closes.
  const folded = useRef(false);
  useEffect(() => {
    const fit = () => {
      const s = useTwin.getState();
      if (!open || window.innerWidth < DOCK_MIN_WIDTH) return;
      const stage = document.querySelector<HTMLElement>('.map-stage');
      const panel = stage?.querySelector<HTMLElement>('.aerosage-host[data-open="1"]');
      if (!stage || !panel) return;
      // Where the panel will settle (its offset animates): left of any right-hand panel
      // (details drawer, Plan-It), measured from the elements rather than CSS variables.
      const sr = stage.getBoundingClientRect();
      const sheets = [...stage.querySelectorAll<HTMLElement>(':scope > aside')].map((a) => a.getBoundingClientRect()).filter((r) => r.width > 0);
      const left = sheets.find((r) => r.left - sr.left < 40);
      const rightEdge = Math.min(sr.right, ...sheets.filter((r) => sr.right - r.right < 40).map((r) => r.left));
      const panelLeft = rightEdge - 12 - panel.getBoundingClientRect().width;
      const free = panelLeft - (left ? left.right : sr.left) - 24;
      if (s.leftOpen && free < MIN_MAP_WIDTH) {
        folded.current = true;
        s.setLeftOpen(false);
      }
    };
    fit();
    window.addEventListener('resize', fit);
    // Space shrinks when a right-hand panel opens (details drawer, Plan-It). A section panel
    // the user (or a command) opens afterwards is left alone.
    const stage = document.querySelector('.map-stage');
    const watch = new MutationObserver(() => setTimeout(fit, 30));
    if (stage) watch.observe(stage, { attributes: true, attributeFilter: ['data-right', 'data-plan'] });
    if (!open && folded.current) {
      folded.current = false;
      if (!useTwin.getState().leftOpen) useTwin.getState().setLeftOpen(true);
    }
    return () => {
      window.removeEventListener('resize', fit);
      watch.disconnect();
    };
  }, [open]);

  return (
    <div className="aerosage-host" data-open={open ? '1' : '0'}>
      <AeroSageChat apiUrl={CHATBOT_API_URL} initiallyOpen={false} context={context} actions={actions} onOpenChange={onOpenChange} />
    </div>
  );
}
