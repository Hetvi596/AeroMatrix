import { describe, expect, it } from 'vitest';
import { getDemoBaseState } from '../data/demo/demoDataProvider';
import { fitCalibration } from './observations';
import { runScenario, scenarioService, defaultParams } from './scenarioService';
import type { StationSummary } from '../types';

describe('fitCalibration', () => {
  const base = getDemoBaseState(10);
  const uncal = scenarioService.baseline(base);

  // Synthetic "observations" generated from known coefficients (test fixture only).
  const ALPHA = 1.5;
  const BETA = 0.8;
  const summaries: StationSummary[] = [3, 27, 45, 62, 88].map((i) => {
    const s = uncal[i];
    const c = s.contributionAbs;
    return {
      station: { id: `T${i}`, name: `T${i}`, location: base.cells[i].center },
      cellId: s.cellId,
      values: { pm25: ALPHA * c.background + BETA * (c.traffic + c.industry + c.other) },
      count: 24,
    };
  });

  it('recovers known background / local scales and reduces RMSE to ~0', () => {
    const cal = fitCalibration(summaries, uncal, 'last24h')!;
    expect(cal.backgroundScale).toBeCloseTo(ALPHA, 3);
    expect(cal.localScale).toBeCloseTo(BETA, 3);
    expect(cal.rmseAfter).toBeLessThan(1e-6);
    expect(cal.rmseBefore).toBeGreaterThan(cal.rmseAfter);
  });

  it('calibrated baseline matches the observations at station cells and flows into scenarios', () => {
    const cal = fitCalibration(summaries, uncal, 'last24h')!;
    const calBase = { ...base, calibration: cal };
    const baseline = scenarioService.baseline(calBase);
    for (const s of summaries) {
      expect(baseline.find((b) => b.cellId === s.cellId)!.pm25).toBeCloseTo(s.values.pm25!, 6);
    }
    const r = runScenario(calBase, { ...defaultParams(calBase), trafficMultiplier: 1.3 });
    expect(r.metadata.disclaimer).toMatch(/Calibrated/);
    expect(r.summary.meanDelta).toBeGreaterThan(0);
  });

  it('returns null without usable stations', () => {
    expect(fitCalibration([], uncal, 'period')).toBeNull();
  });
});
