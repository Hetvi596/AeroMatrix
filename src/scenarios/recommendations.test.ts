// Recommendation engine: evidence gates, target choice, ranking and honest costs.

import { describe, expect, it } from 'vitest';
import { getDemoBaseState } from '../data/demo/demoDataProvider';
import { scenarioService } from '../services/scenarioService';
import { MIN_INDUSTRY_SHARE, MIN_TRAFFIC_SHARE, hotspot, recommendActions } from './recommendations';

const base = getDemoBaseState(10);
const baseline = scenarioService.baseline(base);

describe('recommendations', () => {
  it('targets the worst hotspot by default, or the selected zone', () => {
    const worst = hotspot(baseline, 'pm25');
    expect(recommendActions(base, baseline).target.cellId).toBe(worst.cellId);
    const other = baseline.find((s) => s.cellId !== worst.cellId)!;
    expect(recommendActions(base, baseline, { targetCellId: other.cellId }).target.cellId).toBe(other.cellId);
  });

  it('ranks by modelled reduction in the target zone, all reductions, with ranges', () => {
    const set = recommendActions(base, baseline);
    expect(set.recommendations.length).toBeGreaterThan(0);
    for (const r of set.recommendations) {
      expect(r.effect.target).toBeLessThan(0);
      expect(r.effect.low).toBeLessThanOrEqual(r.effect.target);
      expect(r.effect.high).toBeGreaterThanOrEqual(r.effect.target);
      // The effect is the engine's own result for the target zone.
      expect(r.effect.target).toBeCloseTo(r.result.delta[set.target.cellId].pm25, 9);
    }
    const t = set.recommendations.map((r) => r.effect.target);
    expect([...t].sort((x, y) => x - y)).toEqual(t);
  });

  it('only recommends traffic and industrial measures where the source mix supports them', () => {
    for (const s of baseline) {
      const set = recommendActions(base, baseline, { targetCellId: s.cellId });
      const ids = set.recommendations.map((r) => r.id);
      if (set.target.shares.traffic < MIN_TRAFFIC_SHARE) expect(ids).not.toContain('traffic');
      if (set.target.shares.industry < MIN_INDUSTRY_SHARE) expect(ids).not.toContain('industry');
      // Every candidate is either recommended or excluded with a reason.
      expect(set.recommendations.length + set.excluded.length).toBeGreaterThanOrEqual(6);
      for (const e of set.excluded) expect(e.reason.length).toBeGreaterThan(5);
    }
  });

  it('associates industrial control with nearby sources and costs it from the priced items', () => {
    const zone = baseline.find((s) => recommendActions(base, baseline, { targetCellId: s.cellId }).recommendations.some((r) => r.id === 'industry'));
    expect(zone).toBeDefined();
    const ind = recommendActions(base, baseline, { targetCellId: zone!.cellId }).recommendations.find((r) => r.id === 'industry')!;
    expect(ind.cost && ind.cost.total).toBeGreaterThan(0);
    expect(ind.cost!.total).toBe(ind.cost!.oneTime + ind.cost!.recurring);
    expect(Object.keys(ind.result.params.industryIntensityOverrides).length).toBeGreaterThan(0);
  });

  it('never invents a cost for unpriced actions', () => {
    for (const r of recommendActions(base, baseline).recommendations) if (['diversion', 'relocation', 'transit'].includes(r.id)) expect(r.cost).toBeNull();
  });

  it('flags tree planting as long-term during severe pollution', () => {
    const set = recommendActions(base, baseline, { currentPm25: 140 });
    const trees = set.recommendations.find((r) => r.id === 'green');
    if (trees) {
      expect(trees.timeframe).toBe('Years');
      expect(trees.limitations.join(' ')).toMatch(/not a fix for today/);
    }
  });
});
