// Plan-It: cost reconciliation, budget and limit enforcement, ranking, scenario
// consistency, preview/apply isolation and the PDF report.

import { describe, expect, it } from 'vitest';
import { getDemoBaseState } from '../data/demo/demoDataProvider';
import { runScenario } from '../services/scenarioService';
import { useTwin } from '../store/useTwinStore';
import { DEFAULT_ASSUMPTIONS, PRICES, type InterventionOption, type PlanAssumptions } from './costModel';
import { NO_LIMITS, generatePlans, type PlanInput, type PlanOutcome } from './planEngine';
import { MAX_PAGES, buildPlanPdf, pdfText, planPdfName } from './planPdf';

const base = getDemoBaseState(10);
const ZONE = 'A-005';
const run = (over: Partial<PlanInput> = {}) =>
  generatePlans({ base, budget: 2500000, targetId: ZONE, limits: NO_LIMITS, objective: 'pm25', ...over });
const ok = run();
const allOptions = (o: PlanOutcome) => o.plans.flatMap((p) => p.options);

function reconciles(o: InterventionOption) {
  for (const l of o.lines) expect(l.total).toBe(Math.round(l.quantity * l.unitPrice));
  const one = o.lines.filter((l) => !l.recurring).reduce((s, l) => s + l.total, 0);
  const rec = o.lines.filter((l) => l.recurring).reduce((s, l) => s + l.total, 0);
  expect(o.oneTime).toBe(one);
  expect(o.recurring).toBe(rec);
  expect(o.total).toBe(one + rec);
}

describe('Plan-It cost model', () => {
  it('labels every price as sourced (with link and access date) or estimated (with a basis)', () => {
    for (const p of Object.values(PRICES)) {
      expect(p.unitPrice).toBeGreaterThan(0);
      if (p.kind === 'sourced') {
        expect(p.source?.url).toMatch(/^https:\/\//);
        expect(p.source?.accessed).toBeTruthy();
      } else expect(p.basis).toBeTruthy();
    }
  });

  it('itemises every measure as quantity × unit price and reconciles all totals exactly', () => {
    expect(ok.status).toBe('OK');
    for (const plan of ok.plans) {
      plan.options.forEach(reconciles);
      expect(plan.oneTime).toBe(plan.options.reduce((s, o) => s + o.oneTime, 0));
      expect(plan.recurring).toBe(plan.options.reduce((s, o) => s + o.recurring, 0));
      expect(plan.total).toBe(plan.oneTime + plan.recurring);
      expect(plan.remaining).toBe(ok.budget - plan.total);
    }
  });

  it('offers at least three intervention types', () => {
    expect(new Set(allOptions(ok).map((o) => o.type)).size).toBeGreaterThanOrEqual(3);
  });
});

describe('Plan-It engine', () => {
  it('returns Plan A plus distinct alternatives, all within budget', () => {
    expect(ok.plans.map((p) => p.id)).toEqual(['A', 'B', 'C']);
    const keys = ok.plans.map((p) => p.options.map((o) => o.key).join('|'));
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of ok.plans) expect(p.total).toBeLessThanOrEqual(ok.budget);
    expect(ok.feasible).toBeGreaterThanOrEqual(3);
  });

  it('ranks Plan A first for the objective', () => {
    const [a, ...rest] = ok.plans;
    for (const p of rest) expect(a.impact.abs).toBeLessThanOrEqual(p.impact.abs);
    const eff = run({ objective: 'efficiency' });
    const per = (p: (typeof eff.plans)[number]) => -p.impact.abs / p.total;
    for (const p of eff.plans.slice(1)) expect(per(eff.plans[0])).toBeGreaterThanOrEqual(per(p));
  });

  it('is deterministic', () => {
    const again = run();
    expect(again.plans.map((p) => [p.total, p.impact.abs])).toEqual(ok.plans.map((p) => [p.total, p.impact.abs]));
  });

  it('takes the PM2.5 effect from the existing scenario engine', () => {
    for (const p of ok.plans) {
      const r = runScenario(base, p.params);
      const cell = r.scenario.find((s) => s.cellId === ZONE)!;
      expect(cell.pm25).toBeCloseTo(p.impact.predicted, 9);
      expect(p.result.params.targetCells).toEqual([ZONE]);
      expect(p.impact.abs).toBeLessThan(0);
    }
  });

  it('enforces operational limits', () => {
    const one = run({ limits: { ...NO_LIMITS, maxInterventions: 1 } });
    expect(one.plans.every((p) => p.options.length === 1)).toBe(true);
    expect(one.rejected.tooMany).toBeGreaterThan(0);

    const noIndustry = run({ limits: { ...NO_LIMITS, unavailable: ['industry'] } });
    expect(allOptions(noIndustry).some((o) => o.type === 'industry')).toBe(false);
    expect(noIndustry.notes.join(' ')).toMatch(/unavailable/);

    const cap = run({ limits: { ...NO_LIMITS, plantingCapacity: 500 } });
    for (const o of allOptions(cap)) if (o.type === 'trees') expect(o.quantity).toBeLessThanOrEqual(500);
  });

  it('reports infeasibility instead of relaxing the budget', () => {
    const tight = run({ budget: 50000 });
    expect(tight.status).toBe('INFEASIBLE');
    expect(tight.plans).toEqual([]);
    expect(tight.messages[0]).toMatch(/cheapest measure/);
  });

  it('rejects invalid inputs', () => {
    expect(run({ budget: 0 }).status).toBe('INVALID');
    expect(run({ budget: Number.NaN }).status).toBe('INVALID');
    expect(run({ targetId: 'Z-999' }).status).toBe('INVALID');
  });

  it('explains what a city-wide target leaves out', () => {
    const city = run({ targetId: 'city' });
    expect(city.status).toBe('OK');
    expect(allOptions(city).some((o) => o.type === 'traffic')).toBe(false);
    expect(city.notes.join(' ')).toMatch(/Traffic enforcement left out/);
  });

  it('leaves out a measure whose price is missing, with a note', () => {
    const { bagFilter: _drop, ...prices } = PRICES;
    const o = run({ prices });
    expect(allOptions(o).some((x) => x.type === 'industry')).toBe(false);
    expect(o.notes.join(' ')).toMatch(/no price for/);
  });

  it('applies sensitivity changes without touching the source prices', () => {
    const before = PRICES.bagFilter.unitPrice;
    const a: PlanAssumptions = { ...DEFAULT_ASSUMPTIONS, costMultiplier: { trees: 1, industry: 1.5, traffic: 1 } };
    const o = run({ assumptions: a });
    const filter = allOptions(o).find((x) => x.type === 'industry')!;
    const line = filter.lines.find((l) => l.priceId === 'bagFilter')!;
    expect(line.unitPrice).toBe(before * 1.5);
    expect(line.adjusted).toBe(true);
    reconciles(filter);
    expect(PRICES.bagFilter.unitPrice).toBe(before);
  });
});

describe('Plan-It preview and apply', () => {
  it('previews without changing the active scenario, and applies atomically', async () => {
    await useTwin.getState().init(10);
    const st = () => useTwin.getState();
    const outcome = generatePlans({ base: st().base!, budget: 2500000, targetId: ZONE, limits: NO_LIMITS, objective: 'pm25' });
    const before = { draft: st().draft, active: st().activeResult };

    st().setPreviewResult(outcome.plans[1].result);
    expect(st().draft).toBe(before.draft);
    expect(st().activeResult).toBe(before.active);
    st().setPlanItOpen(false);
    expect(st().previewResult).toBeNull();

    // A result for another grid is refused and leaves everything as it was.
    const other = generatePlans({ base: getDemoBaseState(8), budget: 2500000, targetId: 'city', limits: NO_LIMITS, objective: 'pm25' });
    expect(st().applyScenario(other.plans[0].result)).toMatch(/different grid/);
    expect(st().activeResult).toBe(before.active);

    expect(st().applyScenario(outcome.plans[0].result)).toBeNull();
    expect(st().activeResult).toBe(outcome.plans[0].result);
    expect(st().draft?.areaTrafficMultiplier).toBe(outcome.plans[0].params.areaTrafficMultiplier);
    expect(st().draft?.targetCells).toEqual([ZONE]);
  });
});

describe('Plan-It PDF', () => {
  it('builds a report of at most eight pages from the plan outcome', () => {
    const doc = buildPlanPdf(ok, new Date(2026, 9, 10));
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(MAX_PAGES);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(6);
    expect(planPdfName(ok, new Date(2026, 9, 10))).toBe(`AeroMatrix-Plan-It-${ZONE}-2026-10-10.pdf`);
  });

  it('refuses to report an infeasible outcome', () => {
    expect(() => buildPlanPdf(run({ budget: 50000 }))).toThrow();
  });

  it('writes text the standard PDF fonts can draw', () => {
    expect(pdfText('₹24,44,080 → −30.07 µg/m³, 40 m²')).toBe('Rs. 24,44,080 -> -30.07 ug/m3, 40 m2');
  });
});

describe('Plan-It infeasible alternative', () => {
  it('suggests the cheapest allowed measure as a budget, and that budget is feasible', () => {
    const tight = run({ budget: 50000 });
    expect(tight.status).toBe('INFEASIBLE');
    expect(tight.suggestedBudget).toBeGreaterThan(50000);
    const retry = run({ budget: tight.suggestedBudget! });
    expect(retry.status).toBe('OK');
    expect(retry.plans[0].total).toBeLessThanOrEqual(tight.suggestedBudget!);
  });

  it('never relaxes limits to find an alternative', () => {
    const none = run({ budget: 50000, limits: { ...NO_LIMITS, unavailable: ['trees', 'industry', 'traffic'] } });
    expect(none.status).toBe('INFEASIBLE');
    expect(none.suggestedBudget).toBeUndefined();
  });
});
