import { describe, expect, it } from 'vitest';
import { getDemoBaseState } from '../data/demo/demoDataProvider';
import { scaleSources, stabilityCheck } from './actionStability';

const base = getDemoBaseState(10);

describe('action ranking stability', () => {
  it('leaves the base untouched when scaling by 1', () => {
    const same = scaleSources(base, 1, 1);
    expect(same.industries.map((i) => i.emissionIntensity)).toEqual(base.industries.map((i) => i.emissionIntensity));
    expect(same.cells[0].localTraffic).toBe(base.cells[0].localTraffic);
  });

  it('scales traffic and industry independently, capping intensity at 100', () => {
    const v = scaleSources(base, 1.5, 2);
    expect(v.cells[0].localTraffic).toBeCloseTo(base.cells[0].localTraffic * 1.5, 10);
    expect(Math.max(...v.industries.map((i) => i.emissionIntensity))).toBeLessThanOrEqual(100);
  });

  it('is trivially stable with zero uncertainty and reports five cases', () => {
    const r = stabilityCheck(base, 0);
    expect(r.cases).toHaveLength(5);
    expect(r.topStable).toBe(true);
    expect(r.orderStable).toBe(true);
  });

  it('is deterministic for a given interval', () => {
    expect(stabilityCheck(base, 0.21)).toEqual(stabilityCheck(base, 0.21));
  });
});
