// Pollution-reduction actions (ENR01: compare ≥3 actions).
// Each action builds ScenarioParams from the current base state (demo or OSM
// geometry) and is evaluated by the same ScenarioService.

import type { BaseState, Road, ScenarioParams, ScenarioResult } from '../types';
import { defaultParams, makeScenarioIndustry, scenarioService } from '../services/scenarioService';
import { majorRoads, roadMidpoint } from '../services/traffic';
import { haversineKm } from '../utils/geo';

export interface ReductionAction {
  id: string;
  name: string;
  core: boolean; // one of the three required ENR01 actions
  build(base: BaseState): { params: ScenarioParams; implementation: string };
}

const coreCells = (base: BaseState) =>
  base.cells.filter((c) => c.landUse === 'Urban core' || c.landUse === 'Residential').map((c) => c.id);

const roadLoad = (base: BaseState, r: Road) => base.cells.reduce((s, c) => s + (c.trafficByRoad[r.id] ?? 0), 0);

/** Busiest major road, diverted to the nearest other major road of similar or higher class. */
function diversionPair(base: BaseState): [Road, Road] | null {
  const roads = majorRoads(base, 40);
  if (roads.length < 2) return null;
  const busiest = [...roads].sort((a, b) => roadLoad(base, b) - roadLoad(base, a))[0];
  const mid = roadMidpoint(busiest);
  const alt = roads
    .filter((r) => r.id !== busiest.id && r.volume >= busiest.volume * 0.6)
    .sort((a, b) => haversineKm(roadMidpoint(a), mid) - haversineKm(roadMidpoint(b), mid))[0];
  return alt ? [busiest, alt] : null;
}

export const REDUCTION_ACTIONS: ReductionAction[] = [
  {
    id: 'traffic-restriction',
    name: 'Traffic restriction',
    core: true,
    build: (base) => ({
      params: { ...defaultParams(base), name: 'Action: Traffic restriction', targetCells: coreCells(base), areaTrafficMultiplier: 0.7 },
      implementation: '−30% vehicle-km in urban-core & residential zones (LEZ / odd-even)',
    }),
  },
  {
    id: 'industrial-control',
    name: 'Industrial emission control',
    core: true,
    build: (base) => ({
      params: { ...defaultParams(base), name: 'Action: Industrial emission control', industrialControl: 0.4 },
      implementation: '+40% additional control efficiency on all units (ESP / scrubbers)',
    }),
  },
  {
    id: 'green-expansion',
    name: 'Green-cover expansion',
    core: true,
    build: (base) => ({
      params: { ...defaultParams(base), name: 'Action: Green-cover expansion', targetCells: coreCells(base), greenCoverDelta: 12 },
      implementation: '+12 pts green cover in urban-core & residential zones',
    }),
  },
  {
    id: 'road-diversion',
    name: 'Road traffic diversion',
    core: false,
    build: (base) => {
      const pair = diversionPair(base);
      if (!pair) return { params: { ...defaultParams(base), name: 'Action: Road diversion' }, implementation: 'No suitable road pair found' };
      const [from, to] = pair;
      return {
        params: {
          ...defaultParams(base),
          name: 'Action: Road diversion',
          roadClosures: [{ roadId: from.id, divertToRoadId: to.id, diversionShare: 0.7 }],
        },
        implementation: `Close ${from.name}; divert 70% to ${to.name}`,
      };
    },
  },
  {
    id: 'industrial-relocation',
    name: 'Industrial relocation',
    core: false,
    build: (base) => {
      const src = [...base.industries].sort((a, b) => b.emissionIntensity - a.emissionIntensity)[0];
      return {
        params: {
          ...defaultParams(base),
          name: 'Action: Industrial relocation',
          removedIndustryIds: [src.id],
          addedIndustries: [makeScenarioIndustry([73.972, 18.448], src.category, src.emissionIntensity, src.controlEfficiency, `${src.name} (relocated)`)],
        },
        implementation: `Relocate highest-intensity source (${src.id}) to the south-east periphery`,
      };
    },
  },
  {
    id: 'public-transport',
    name: 'Public transport improvement',
    core: false,
    build: (base) => ({
      params: { ...defaultParams(base), name: 'Action: Public transport', publicTransportShift: 0.15, vehicleEmissionControl: 0.1 },
      implementation: '15% mode shift to transit + 10% cleaner fleet (e-buses)',
    }),
  },
];

export function evaluateActions(base: BaseState): { action: ReductionAction; implementation: string; result: ScenarioResult }[] {
  return REDUCTION_ACTIONS.map((action) => {
    const { params, implementation } = action.build(base);
    return { action, implementation, result: scenarioService.run(base, params) };
  });
}
