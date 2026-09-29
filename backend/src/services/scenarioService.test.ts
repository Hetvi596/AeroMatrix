import { describe, expect, it } from 'vitest';
import { getDemoBaseState } from '../data/demo/demoDataProvider';
import { defaultParams, makeScenarioIndustry, runScenario } from './scenarioService';
import { haversineKm } from '../utils/geo';

const base = getDemoBaseState(10);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('runScenario', () => {
  it('returns zero delta and no affected zones for baseline parameters', () => {
    const r = runScenario(base, defaultParams(base));
    expect(r.affectedZones).toHaveLength(0);
    expect(r.summary.meanDelta).toBeCloseTo(0, 10);
    expect(r.metadata.status).toBe('MODELED_SCENARIO');
  });

  it('is deterministic', () => {
    const p = { ...defaultParams(base), trafficMultiplier: 1.3 };
    const a = runScenario(base, p);
    const b = runScenario(base, p);
    expect(a.scenario.map((s) => s.pm25)).toEqual(b.scenario.map((s) => s.pm25));
  });

  it('source contributions sum to PM2.5 in every cell', () => {
    const r = runScenario(base, defaultParams(base));
    for (const s of r.baseline) {
      const c = s.contributionAbs;
      expect(c.traffic + c.industry + c.background + c.other).toBeCloseTo(s.pm25, 6);
    }
  });

  it('more traffic raises and traffic restriction lowers mean PM2.5', () => {
    const up = runScenario(base, { ...defaultParams(base), trafficMultiplier: 1.3 });
    const down = runScenario(base, { ...defaultParams(base), trafficMultiplier: 0.8 });
    expect(up.summary.meanDelta).toBeGreaterThan(0);
    expect(down.summary.meanDelta).toBeLessThan(0);
  });

  it('industrial control and green cover reduce PM2.5 everywhere', () => {
    for (const p of [{ industrialControl: 0.4 }, { greenCoverDelta: 10 }]) {
      const r = runScenario(base, { ...defaultParams(base), ...p });
      for (const s of r.scenario) expect(r.delta[s.cellId].pm25).toBeLessThanOrEqual(1e-9);
    }
  });

  it('a new industry affects nearby zones more than distant ones, and a green buffer mitigates it', () => {
    const site: [number, number] = [73.835, 18.585];
    const ind = makeScenarioIndustry(site, 'Chemical', 80);
    const r = runScenario(base, { ...defaultParams(base), addedIndustries: [ind] });
    const withBuffer = runScenario(base, { ...defaultParams(base), addedIndustries: [ind], greenBuffer: true });
    const near = base.cells.filter((c) => haversineKm(c.center, site) < 3).map((c) => r.delta[c.id].pm25);
    const far = base.cells.filter((c) => haversineKm(c.center, site) > 15).map((c) => r.delta[c.id].pm25);
    expect(mean(near)).toBeGreaterThan(mean(far));
    expect(r.summary.meanDelta).toBeGreaterThan(0);
    expect(withBuffer.summary.meanDelta).toBeLessThan(r.summary.meanDelta);
  });

  it('rain and wind improve dispersion', () => {
    const r = runScenario(base, {
      ...defaultParams(base),
      weather: { ...base.weather, rainfall: 20, windSpeed: 6 },
    });
    expect(r.summary.meanDelta).toBeLessThan(0);
  });
});
