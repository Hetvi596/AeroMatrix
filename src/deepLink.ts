// Deep links from the AeroMatrix landing page into the app.
//
//   ?interventions=traffic,industry,green   → What-If pre-filled with those measures and run
//   ?scenario=traffic,industry,green        → same (the landing page's "Model in AeroMatrix" link)
//   &compare=1                              → open the baseline-vs-scenario swipe on the map
//   ?section=simulator|actions|analytics|…  → open a specific screen
//   ?place=koregaon-park                    → fly to an area (id or name)
//   ?station=Hadapsar                       → open a monitoring station (id, name or alias)
//   ?intro=0                                → skip the first-visit guide
//
// Example for the landing page's "Model in AeroMatrix →" button:
//   https://<app>/?interventions=traffic,green&compare=1

import { useTwin } from './store/useTwinStore';
import { defaultParams } from './services/scenarioService';
import { PUNE_LOCALITIES } from './data/geojson/puneLocalities';
import type { ScenarioParams, Section } from './types';

const SECTIONS: Section[] = ['overview', 'air', 'zones', 'traffic', 'industries', 'green', 'simulator', 'scenarios', 'actions', 'locations', 'sensors', 'analytics', 'data'];

/** The three interventions offered on the landing page's What-If overlay. */
const INTERVENTIONS: Record<string, { label: string; apply: (p: ScenarioParams) => Partial<ScenarioParams> }> = {
  traffic: { label: 'Reduce traffic emissions', apply: () => ({ trafficMultiplier: 0.85, vehicleEmissionControl: 0.25 }) },
  industry: { label: 'Modify industrial emissions', apply: () => ({ industrialControl: 0.35 }) },
  green: { label: 'Increase green buffers', apply: () => ({ greenCoverDelta: 10, greenBuffer: true }) },
};

export function applyDeepLink(search = window.location.search): boolean {
  const q = new URLSearchParams(search);
  if (![...q.keys()].length) return false;
  const s = useTwin.getState();
  let handled = false;

  const section = q.get('section') as Section | null;
  if (section && SECTIONS.includes(section)) {
    s.setSection(section);
    s.setLeftOpen(true);
    handled = true;
  }

  const wanted = (q.get('interventions') ?? q.get('scenario') ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x in INTERVENTIONS);
  if (wanted.length && s.base) {
    let params: ScenarioParams = { ...defaultParams(s.base), name: wanted.map((w) => INTERVENTIONS[w].label).join(' + ') };
    for (const w of wanted) params = { ...params, ...INTERVENTIONS[w].apply(params) };
    s.setSection('simulator');
    s.setLeftOpen(true);
    s.updateDraft(params);
    if (useTwin.getState().runDraft() && q.get('compare') === '1') useTwin.getState().setCompare(true);
    handled = true;
  }

  const place = q.get('place');
  if (place) {
    const p = PUNE_LOCALITIES.find((l) => l.id === place.toLowerCase() || l.name.toLowerCase() === place.toLowerCase());
    if (p) {
      s.goToPlace(p.id);
      handled = true;
    }
  }

  const station = q.get('station');
  if (station) {
    const key = station.toLowerCase().replace(/[-_]/g, ' ').trim();
    const st = useTwin
      .getState()
      .stations.find((x) => [x.station, x.name, x.station_name, ...x.aliases].some((n) => n.toLowerCase().replace(/[-_]/g, ' ') === key));
    if (st || key === 'kothrud') {
      s.setSection('air');
      s.setLeftOpen(true);
      s.selectStation(st ? st.station : 'kothrud');
      handled = true;
    }
  }

  if (handled || q.get('intro') === '0') s.setIntroOpen(false);
  // Don't re-apply on reload.
  if (handled) window.history.replaceState(null, '', window.location.pathname);
  return handled;
}
