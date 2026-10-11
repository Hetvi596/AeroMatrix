// Shared What-If pipeline: trained-model baseline (real API response examples) ×
// scenario-engine effect, and the live draft → scenario synchronisation.

import { describe, expect, it } from 'vitest';
import examples from '../../backend/trained_model/RESPONSE_EXAMPLES.json';
import { getDemoBaseState } from '../data/demo/demoDataProvider';
import { defaultParams, runScenario } from '../services/scenarioService';
import type { ApiForecast, ApiMeasured } from '../services/aeromatrixApi';
import { evaluateRegionScenario, pctChange, regionLocality } from './regionScenario';
import { paramsKey, syncScenarioToDraft } from './liveScenario';
import { useTwin } from '../store/useTwinStore';

const base = getDemoBaseState(10);
const hadapsarFc = examples.Hadapsar as unknown as ApiForecast;
const hadapsarMeasured = examples.measured_Hadapsar as unknown as ApiMeasured;
const alandiFc = examples.Alandi as unknown as ApiForecast;
const ready = (data: ApiForecast) => ({ loading: false, data });

function evalHadapsar(result: ReturnType<typeof runScenario> | null) {
  return evaluateRegionScenario({
    station: hadapsarFc.region,
    measured: hadapsarMeasured,
    forecast: ready(hadapsarFc),
    serviceOnline: true,
    base,
    result,
  });
}
const row = (sc: ReturnType<typeof evalHadapsar>, p: string) => sc.rows.find((r) => r.pollutant === p)!;

describe('region scenario: baseline from the trained model', () => {
  it('uses the model forecast and the measured value of the same reference hour', () => {
    const sc = evalHadapsar(null);
    expect(sc.status).toBe('READY');
    const pm = row(sc, 'pm25');
    expect(pm.baseline!.value).toBeCloseTo(96.68304484723336, 10); // API value, unchanged
    expect(pm.current!.value).toBe(99.955); // measured hour ending at the forecast's issue time
    expect(pm.issuedAt).toBe('2026-01-01T05:00:00+05:30');
    expect(sc.historical).toBe(true);
  });

  it('keeps per-pollutant forecast times', () => {
    expect(row(evalHadapsar(null), 'benzene').issuedAt).toBe('2026-01-01T03:00:00+05:30');
  });
});

describe('Test 12: no-op consistency', () => {
  it('with no active scenario, After equals Before and the change is zero', () => {
    const pm = row(evalHadapsar(null), 'pm25');
    expect(pm.ratio).toBe(1);
    expect(pm.scenario!.value).toBe(pm.baseline!.value);
    expect(pm.absChange).toBe(0);
    expect(pm.pctChange).toBe(0);
  });

  it('a scenario with default parameters also gives zero change', () => {
    const pm = row(evalHadapsar(runScenario(base, defaultParams(base))), 'pm25');
    expect(pm.absChange).toBeCloseTo(0, 10);
  });
});

describe('Test 2 / 13: intervention applied to the fixed baseline', () => {
  const result = runScenario(base, { ...defaultParams(base), trafficMultiplier: 0.6 });
  const sc = evalHadapsar(result);

  it('lowers the forecast by the engine’s relative change in the Hadapsar zone', () => {
    const pm = row(sc, 'pm25');
    const cell = sc.cellId!;
    const b = result.baseline.find((s) => s.cellId === cell)!.pm25;
    const s = result.scenario.find((x) => x.cellId === cell)!.pm25;
    expect(pm.ratio).toBeCloseTo(s / b, 12);
    expect(pm.scenario!.value).toBeCloseTo(pm.baseline!.value * (s / b), 10);
    expect(pm.scenario!.value).toBeLessThan(pm.baseline!.value);
  });

  it('computes absolute and percentage change with the stated formulas', () => {
    const pm = row(sc, 'pm25');
    expect(pm.absChange).toBeCloseTo(pm.scenario!.value - pm.baseline!.value, 12);
    expect(pm.pctChange).toBeCloseTo(((pm.scenario!.value - pm.baseline!.value) / pm.baseline!.value) * 100, 12);
  });

  it('never changes the baseline itself', () => {
    expect(row(sc, 'pm25').baseline).toEqual(row(evalHadapsar(null), 'pm25').baseline);
  });

  it('is pollutant-specific', () => {
    expect(row(sc, 'pm25').ratio).not.toBe(row(sc, 'o3').ratio);
  });
});

describe('Test 10: unsupported data is not fabricated', () => {
  it('pollutants the engine doesn’t model get a baseline but no scenario', () => {
    const nox = row(evalHadapsar(runScenario(base, { ...defaultParams(base), trafficMultiplier: 0.6 })), 'nox');
    expect(nox.baseline).not.toBeNull();
    expect(nox.scenario).toBeNull();
    expect(nox.reason).toMatch(/no model/);
  });

  it('pollutants the trained model can’t forecast stay unavailable', () => {
    const so2 = row(evalHadapsar(null), 'so2');
    expect(so2.baseline).toBeNull();
    expect(so2.reason).toMatch(/not represented/);
  });

  it('a station without a mapped area gets no scenario effect', () => {
    expect(regionLocality(alandiFc.region)).toBeNull();
    const sc = evaluateRegionScenario({ station: alandiFc.region, measured: undefined, forecast: ready(alandiFc), serviceOnline: true, base, result: null });
    expect(sc.scenarioLimitation).toMatch(/No mapped area/);
    expect(sc.rows.every((r) => r.scenario === null)).toBe(true);
  });

  it('reports an offline service instead of values', () => {
    const sc = evaluateRegionScenario({ station: hadapsarFc.region, measured: undefined, forecast: undefined, serviceOnline: false, base, result: null });
    expect(sc.status).toBe('SERVICE_OFFLINE');
    expect(sc.rows).toHaveLength(0);
  });

  it('percentage change is null for a zero baseline', () => {
    expect(pctChange(0, 5)).toBeNull();
    expect(pctChange(70, 61)).toBeCloseTo(-12.857142857, 6);
  });
});

describe('Tests 6–7: live updates and reset', () => {
  it('runs the draft, follows the latest values, and returns to baseline on reset', async () => {
    await useTwin.getState().init(10);
    const st = () => useTwin.getState();
    const baseline0 = st().baseline;
    st().updateDraft({ trafficMultiplier: 0.8 });
    syncScenarioToDraft();
    const first = st().activeResult!;
    expect(first.params.trafficMultiplier).toBe(0.8);
    st().updateDraft({ trafficMultiplier: 0.5 });
    syncScenarioToDraft();
    expect(st().activeResult!.params.trafficMultiplier).toBe(0.5);
    expect(st().activeResult!.summary.meanDelta).toBeLessThan(first.summary.meanDelta); // stronger cut, larger decrease
    expect(st().baseline).toBe(baseline0); // the baseline field is never replaced by a scenario
    const sameAgain = st().activeResult;
    syncScenarioToDraft(); // no change → no re-run
    expect(st().activeResult).toBe(sameAgain);
    st().resetDraft();
    syncScenarioToDraft();
    expect(st().activeResult).toBeNull();
    expect(st().displayMode).toBe('baseline');
  });

  it('compares parameters without the display name', () => {
    const p = defaultParams(base);
    expect(paramsKey({ ...p, name: 'A' })).toBe(paramsKey({ ...p, name: 'B' }));
  });
});
