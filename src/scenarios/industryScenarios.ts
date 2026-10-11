// Industrial What-If scenarios anchored on real geography.
//
// A user picks a real MIDC estate or a mapped industry site; that geography decides
// which of the scenario engine's modeled sources are affected. The scenario itself is
// expressed with the engine's existing parameters (intensity overrides, removals,
// added sources), so ScenarioService computes it exactly like every other What-If.
//
// The modeled sources carry ASSUMED intensities: the dataset has no facility-level
// emissions, so every result is a hypothetical, prototype-model scenario.

import type { BaseState, LonLat, ScenarioParams, ScenarioResult } from '../types';
import { cellAt, defaultParams, makeScenarioIndustry } from '../services/scenarioService';
import { AREA_BUFFER_KM, distanceToAreaKm, type AffectedSource, type IndustrialArea, type IndustrialTarget } from '../services/industryData';
import { haversineKm } from '../utils/geo';

export function targetLabel(t: IndustrialTarget): string {
  return t.kind === 'area' ? t.area.name : `${t.site.name ?? 'mapped site'} cluster`;
}

/** Reduce the assumed emission intensity of the covered sources by `pct` percent. */
export function reductionScenario(base: BaseState, target: IndustrialTarget, sources: AffectedSource[], pct: number): ScenarioParams | null {
  if (!sources.length || !(pct > 0)) return null;
  const overrides: Record<string, number> = {};
  for (const { industry } of sources) overrides[industry.id] = Math.round(industry.emissionIntensity * (1 - pct / 100) * 10) / 10;
  return { ...defaultParams(base), name: `Industrial reduction: ${targetLabel(target)} −${pct}%`, industryIntensityOverrides: overrides };
}

/** Remove the covered sources from the scenario (shutdown). */
export function shutdownScenario(base: BaseState, target: IndustrialTarget, sources: AffectedSource[]): ScenarioParams | null {
  if (!sources.length) return null;
  return { ...defaultParams(base), name: `Industrial shutdown: ${targetLabel(target)}`, removedIndustryIds: sources.map((s) => s.industry.id) };
}

/**
 * Move the covered sources to another estate. Emissions are moved, not removed:
 * each source keeps its category, assumed intensity, control and pollutant mix.
 */
export function relocationScenario(
  base: BaseState,
  target: IndustrialTarget,
  sources: AffectedSource[],
  destination: IndustrialArea,
): ScenarioParams | null {
  if (!sources.length) return null;
  const added = sources.map(({ industry }) => ({
    ...makeScenarioIndustry(destination.centroid, industry.category, industry.emissionIntensity, industry.controlEfficiency, `${industry.name} (relocated to ${destination.name})`),
    mainPollutants: industry.mainPollutants,
  }));
  return {
    ...defaultParams(base),
    name: `Industrial relocation: ${targetLabel(target)} → ${destination.name}`,
    removedIndustryIds: sources.map((s) => s.industry.id),
    addedIndustries: added,
  };
}

/**
 * Grid cells covering the target: cells whose centre lies in the footprint (estate + buffer,
 * or site radius), plus the cell containing the site / estate centre. Grid cells are ~2.5 km
 * wide, so a 1 km footprint can otherwise miss every cell centre.
 */
export function cellsInTarget(base: BaseState, target: IndustrialTarget): string[] {
  const ids = new Set(
    base.cells
      .filter((c) =>
        target.kind === 'area'
          ? distanceToAreaKm(c.center, target.area) <= AREA_BUFFER_KM
          : haversineKm(c.center, target.site.location) <= target.radiusKm,
      )
      .map((c) => c.id),
  );
  const anchor = cellAt(base, target.kind === 'area' ? target.area.centroid : target.site.location);
  if (anchor) ids.add(anchor.id);
  return base.cells.filter((c) => ids.has(c.id)).map((c) => c.id);
}

export interface LocalImpact {
  cells: number;
  baseline: number;
  scenario: number;
  delta: number;
  deltaPct: number;
}

/** Mean PM2.5 change over the given cells (null when none are inside the modeled grid). */
export function localImpact(result: ScenarioResult, cellIds: string[]): LocalImpact | null {
  if (!cellIds.length) return null;
  const set = new Set(cellIds);
  const b = result.baseline.filter((s) => set.has(s.cellId));
  const s = result.scenario.filter((x) => set.has(x.cellId));
  if (!b.length) return null;
  const mean = (xs: { pm25: number }[]) => xs.reduce((a, x) => a + x.pm25, 0) / xs.length;
  const baseline = mean(b);
  const scenario = mean(s);
  return { cells: b.length, baseline, scenario, delta: scenario - baseline, deltaPct: ((scenario - baseline) / baseline) * 100 };
}

/** True when a point lies inside the twin's modeled grid. */
export function inModeledGrid(base: BaseState, p: LonLat): boolean {
  const b = base.city.bbox;
  return p[0] >= b.west && p[0] <= b.east && p[1] >= b.south && p[1] <= b.north;
}
