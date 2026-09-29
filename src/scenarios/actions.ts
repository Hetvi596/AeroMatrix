// Pollution-reduction actions (ENR01: compare ≥3 actions).
// Each action is just a ScenarioParams builder → evaluated by the same ScenarioService.

import type { BaseState, ScenarioParams, ScenarioResult } from '../types';
import { defaultParams, makeScenarioIndustry, scenarioService } from '../services/scenarioService';

export interface ReductionAction {
  id: string;
  name: string;
  core: boolean; // one of the three required ENR01 actions
  implementation: string;
  build(base: BaseState): ScenarioParams;
}

const coreCells = (base: BaseState) =>
  base.cells.filter((c) => c.landUse === 'Urban core' || c.landUse === 'Residential').map((c) => c.id);

export const REDUCTION_ACTIONS: ReductionAction[] = [
  {
    id: 'traffic-restriction',
    name: 'Traffic restriction',
    core: true,
    implementation: '−30% vehicle-km in urban-core & residential zones (LEZ / odd-even)',
    build: (base) => ({
      ...defaultParams(base),
      name: 'Action: Traffic restriction',
      targetCells: coreCells(base),
      areaTrafficMultiplier: 0.7,
    }),
  },
  {
    id: 'industrial-control',
    name: 'Industrial emission control',
    core: true,
    implementation: '+40% additional control efficiency on all units (ESP / scrubbers)',
    build: (base) => ({ ...defaultParams(base), name: 'Action: Industrial emission control', industrialControl: 0.4 }),
  },
  {
    id: 'green-expansion',
    name: 'Green-cover expansion',
    core: true,
    implementation: '+12 pts green cover in urban-core & residential zones',
    build: (base) => ({
      ...defaultParams(base),
      name: 'Action: Green-cover expansion',
      targetCells: coreCells(base),
      greenCoverDelta: 12,
    }),
  },
  {
    id: 'road-diversion',
    name: 'Road traffic diversion',
    core: false,
    implementation: 'Close Pune–Nagar Road corridor; divert 70% to Hadapsar–Kharadi bypass',
    build: (base) => ({
      ...defaultParams(base),
      name: 'Action: Road diversion',
      roadClosures: [{ roadId: 'R-NAGAR', divertToRoadId: 'R-HADAPSAR-KHARADI', diversionShare: 0.7 }],
    }),
  },
  {
    id: 'industrial-relocation',
    name: 'Industrial relocation',
    core: false,
    implementation: 'Relocate highest-intensity unit (IND-02) to south-east periphery',
    build: (base) => {
      const src = base.industries.find((i) => i.id === 'IND-02') ?? base.industries[0];
      return {
        ...defaultParams(base),
        name: 'Action: Industrial relocation',
        removedIndustryIds: [src.id],
        addedIndustries: [
          makeScenarioIndustry([73.972, 18.448], src.category, src.emissionIntensity, src.controlEfficiency, `${src.name} (relocated)`),
        ],
      };
    },
  },
  {
    id: 'public-transport',
    name: 'Public transport improvement',
    core: false,
    implementation: '15% mode shift to transit + 10% cleaner fleet (e-buses)',
    build: (base) => ({
      ...defaultParams(base),
      name: 'Action: Public transport',
      publicTransportShift: 0.15,
      vehicleEmissionControl: 0.1,
    }),
  },
];

export function evaluateActions(base: BaseState): { action: ReductionAction; result: ScenarioResult }[] {
  return REDUCTION_ACTIONS.map((action) => ({ action, result: scenarioService.run(base, action.build(base)) }));
}
