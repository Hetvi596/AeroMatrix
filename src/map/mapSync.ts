// Subscribes the imperative TwinMap to the zustand store. Only the slices that
// changed are pushed to Cesium — the viewer itself is never recreated.

import { isScenarioMode, useTwin } from '../store/useTwinStore';
import { currentFieldCached } from '../services/liveData';
import type { Industry } from '../types';
import type { IndustryDisplayState, TwinMap } from './TwinMap';

type S = ReturnType<typeof useTwin.getState>;

function industriesFor(s: S): { industry: Industry; state: IndustryDisplayState }[] {
  if (!s.base) return [];
  const r = s.previewResult ?? (isScenarioMode(s.displayMode) ? s.activeResult : null);
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

    if (s.base && changed('base', 'baseline', 'activeResult', 'previewResult', 'displayMode', 'pollutant', 'observedField', 'forecastLayer', 'live')) {
      // A Plan-It preview is drawn instead of the active scenario, without replacing it.
      const shown = s.previewResult ?? (isScenarioMode(s.displayMode) ? s.activeResult : null);
      const shownMode = s.previewResult ? (s.displayMode === 'delta' ? 'delta' : 'scenario') : s.displayMode;
      const observed =
        s.displayMode === 'observed' && s.observedField
          ? s.observedField
          : s.displayMode === 'forecast' && s.forecastLayer && s.forecastLayer.pollutant === s.pollutant
            ? s.forecastLayer.field
            : s.displayMode === 'current'
              ? currentFieldCached(s, s.pollutant)
              : null;
      map.renderCells({
        base: s.base,
        states: shown ? shown.scenario : s.baseline,
        pollutant: s.pollutant,
        mode: shown ? shownMode : 'baseline',
        result: shown,
        closedRoads: shown ? shown.params.roadClosures.map((c) => c.roadId) : [],
        overrideValues: observed && !s.previewResult ? s.base.cells.map((c) => observed.values[c.id]) : null,
      });
    }

    const key = [s.base, s.activeResult, s.previewResult, s.displayMode, s.draft?.addedIndustries, s.selectedIndustryId];
    if (key.some((k, i) => k !== industriesKey[i])) {
      industriesKey = key;
      map.setIndustries(industriesFor(s), s.selectedIndustryId);
    }

    if (changed('selectedCellId', 'base')) {
      map.setSelectedCell(s.base?.cells.find((c) => c.id === s.selectedCellId) ?? null);
    }

    if (!prev || s.draft?.targetCells !== prev.draft?.targetCells || s.base !== prev.base || s.previewResult !== prev.previewResult) {
      const ids = new Set((s.previewResult ? s.previewResult.params.targetCells : s.draft?.targetCells) ?? []);
      map.setAreaCells(s.base?.cells.filter((c) => ids.has(c.id)) ?? []);
    }

    if (changed('pendingIndustry', 'candidates', 'section')) {
      map.setMarkers(s.pendingIndustry.location, s.section === 'locations' ? s.candidates : []);
    }

    if (changed('industry') && s.industry) {
      map.setIndustrialGeography(
        s.industry.areas.map((a) => ({ code: a.code, name: a.name, polygons: a.geometry.coordinates, centroid: a.centroid })),
        s.industry.sites.map((x) => ({ id: x.id, name: x.name, location: x.location })),
      );
    }
    if (changed('selectedIndustrialArea', 'selectedIndustrySite', 'industry')) {
      map.setIndustrialSelection(s.selectedIndustrialArea, s.selectedIndustrySite);
    }

    if (s.base && changed('compareOn', 'activeResult', 'pollutant', 'baseline', 'base')) {
      const on = s.compareOn && !!s.activeResult;
      map.setCompare(on, s.comparePos, on ? { base: s.base, states: s.baseline, pollutant: s.pollutant } : null);
    } else if (changed('comparePos')) {
      map.setSplitPosition(s.comparePos);
    }

    if (s.flyTo && (!prev || s.flyTo !== prev.flyTo)) map.flyTo(s.flyTo.lonlat, s.flyTo.range);
  };

  apply(useTwin.getState());
  return useTwin.subscribe(apply);
}
