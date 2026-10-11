// Does the recommended action change under plausible baselines?
//
// The trained PM2.5 model reports an empirical interval (90th-percentile validation
// residual). Its width relative to the measured station mean sets how far the baseline
// may plausibly move. We then re-rank the reduction actions on baselines where traffic
// and industrial source strengths shift by that fraction — together and in opposite
// directions (uncertain source attribution). A stable ranking is not evidence that an
// action causes the reduction; it only shows the recommendation is not fragile to this
// baseline uncertainty in the prototype engine.

import type { BaseState } from '../types';
import { evaluateActions } from './actions';

export interface StabilityCase {
  label: string;
  traffic: number;
  industry: number;
  order: string[]; // action ids, best first
}

export interface StabilityResult {
  relative: number;
  cases: StabilityCase[];
  topStable: boolean;
  orderStable: boolean;
}

/** Copy of the base with traffic and industrial source strength scaled. */
export function scaleSources(base: BaseState, traffic: number, industry: number): BaseState {
  return {
    ...base,
    industries: base.industries.map((i) => ({ ...i, emissionIntensity: Math.min(100, Math.max(0, i.emissionIntensity * industry)) })),
    cells: base.cells.map((c) => ({
      ...c,
      localTraffic: c.localTraffic * traffic,
      trafficByRoad: Object.fromEntries(Object.entries(c.trafficByRoad).map(([k, v]) => [k, v * traffic])),
    })),
  };
}

function ranking(base: BaseState): string[] {
  return evaluateActions(base)
    .sort((a, b) => a.result.summary.meanDelta - b.result.summary.meanDelta)
    .map((r) => r.action.id);
}

export function stabilityCheck(base: BaseState, relative: number): StabilityResult {
  const r = Math.max(0, Math.min(0.9, relative));
  const variants: [string, number, number][] = [
    ['Central estimate', 1, 1],
    ['Lower baseline', 1 - r, 1 - r],
    ['Upper baseline', 1 + r, 1 + r],
    ['More traffic, less industry', 1 + r, 1 - r],
    ['Less traffic, more industry', 1 - r, 1 + r],
  ];
  const cases = variants.map(([label, t, i]) => ({ label, traffic: t, industry: i, order: ranking(scaleSources(base, t, i)) }));
  const top = cases[0].order[0];
  return {
    relative: r,
    cases,
    topStable: cases.every((c) => c.order[0] === top),
    orderStable: cases.every((c) => c.order.join() === cases[0].order.join()),
  };
}
