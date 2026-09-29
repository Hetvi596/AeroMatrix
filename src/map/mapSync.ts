// Subscribes the imperative TwinMap to the zustand store. Only the slices that
// changed are pushed to Cesium — the viewer itself is never recreated.

import { useTwin } from '../store/useTwinStore';
import type { Industry } from '../types';
import type { IndustryDisplayState, TwinMap } from './TwinMap';

type S = ReturnType<typeof useTwin.getState>;

function industriesFor(s: S): { industry: Industry; state: IndustryDisplayState }[] {
  if (!s.base) return [];
  const r = s.displayMode !== 'baseline' ? s.activeResult : null;
  const removed = new Set(r?.params.removedIndustryIds ?? []);
  const overrides = r?.params.industryIntensityOverrides ?? {};
  const list: { industry: Industry; state: IndustryDisplayState }[] = s.base.industries.map((i) => ({
    industry: overrides[i.id] !== undefined ? { ...i, emissionIntensity: overrides[i.id] } : i,
    state: removed.has(i.id) ? 'removed' : 'active',
  }));
  const shown = new Set<string>();
  for (const i of r?.params.addedIndustries ?? []) {
    list.push({ industry: i, state: 'added' });
    shown.add(i.id);
  }
  for (const i of s.draft?.addedIndustries ?? []) {
    if (!shown.has(i.id)) list.push({ industry: i, state: 'pending' });
  }
  return list;
}

export function bindMapToStore(map: TwinMap): () => void {
  let industriesKey: unknown[] = [];

  const apply = (s: S, prev?: S) => {
    const changed = <K extends keyof S>(...keys: K[]) => !prev || keys.some((k) => s[k] !== prev[k]);

    if (changed('base') && s.base) map.setBase(s.base);
    if (changed('layers')) map.setLayers(s.layers);
    if (changed('terrainExaggeration')) map.setExaggeration(s.terrainExaggeration);

    if (s.base && changed('base', 'baseline', 'activeResult', 'displayMode', 'pollutant')) {
      const showScenario = s.displayMode !== 'baseline' && s.activeResult;
      map.renderCells({
        base: s.base,
        states: showScenario ? s.activeResult!.scenario : s.baseline,
        pollutant: s.pollutant,
        mode: showScenario ? s.displayMode : 'baseline',
        result: showScenario ? s.activeResult : null,
        closedRoads: showScenario ? s.activeResult!.params.roadClosures.map((c) => c.roadId) : [],
      });
    }

    const key = [s.base, s.activeResult, s.displayMode, s.draft?.addedIndustries, s.selectedIndustryId];
    if (key.some((k, i) => k !== industriesKey[i])) {
      industriesKey = key;
      map.setIndustries(industriesFor(s), s.selectedIndustryId);
    }

    if (changed('selectedCellId', 'base')) {
      map.setSelectedCell(s.base?.cells.find((c) => c.id === s.selectedCellId) ?? null);
    }

    if (!prev || s.draft?.targetCells !== prev.draft?.targetCells || s.base !== prev.base) {
      const ids = new Set(s.draft?.targetCells ?? []);
      map.setAreaCells(s.base?.cells.filter((c) => ids.has(c.id)) ?? []);
    }

    if (changed('pendingIndustry', 'candidates', 'section')) {
      map.setMarkers(s.pendingIndustry.location, s.section === 'locations' ? s.candidates : []);
    }

    if (s.flyTo && (!prev || s.flyTo !== prev.flyTo)) map.flyTo(s.flyTo.lonlat, s.flyTo.range);
  };

  apply(useTwin.getState());
  return useTwin.subscribe(apply);
}
