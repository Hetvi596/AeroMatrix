// Plan-It planning engine: deterministic, exhaustive search over intervention
// quantity levels. Every candidate package is costed from the cost model and its
// PM2.5 effect is calculated by the twin's existing scenario engine (the same one
// What-If uses), so plans, map preview and applied scenarios agree exactly.
// Hard limits (budget, operational limits) are never relaxed.

import type { BaseState, ScenarioParams, ScenarioResult } from '../types';
import { defaultParams, runScenario, validateParams } from '../services/scenarioService';
import { zonePlaceNames } from '../utils/zones';
import {
  DEFAULT_ASSUMPTIONS,
  INTERVENTION_LABEL,
  MissingPriceError,
  PRICES,
  TREE_LEVELS,
  eligibleSources,
  industryOption,
  treeOption,
  trafficOption,
  type InterventionOption,
  type InterventionType,
  type PlanAssumptions,
  type PlanTarget,
  type PriceRecord,
} from './costModel';

export type Objective = 'pm25' | 'efficiency' | 'coverage';

export const OBJECTIVE_LABEL: Record<Objective, string> = {
  pm25: 'Largest PM2.5 reduction in the target',
  efficiency: 'Most PM2.5 reduction per rupee',
  coverage: 'Most zones improved',
};

export interface OperationalLimits {
  /** Maximum number of intervention types in one plan. */
  maxInterventions: number | null;
  /** Intervention types that can't be used. */
  unavailable: InterventionType[];
  /** Maximum saplings the planting crews can handle. */
  plantingCapacity: number | null;
}

export const NO_LIMITS: OperationalLimits = { maxInterventions: null, unavailable: [], plantingCapacity: null };

export interface PlanInput {
  base: BaseState;
  budget: number;
  targetId: string; // cell id or 'city'
  limits: OperationalLimits;
  objective: Objective;
  assumptions?: PlanAssumptions;
  prices?: Record<string, PriceRecord>;
}

export interface PlanImpact {
  baseline: number; // target mean PM2.5, µg/m³ (prototype-model baseline)
  predicted: number;
  abs: number; // predicted − baseline
  pct: number | null;
  cityBaseline: number;
  cityPredicted: number;
  zonesImproved: number; // zones with ≥ 0.5 µg/m³ lower PM2.5
  affectedZones: string[];
}

export interface Plan {
  id: 'A' | 'B' | 'C';
  options: InterventionOption[];
  oneTime: number;
  recurring: number;
  total: number;
  remaining: number;
  impact: PlanImpact;
  params: ScenarioParams;
  result: ScenarioResult;
  /** Why this plan holds its rank. */
  reason: string;
  /** Short trade-off against Plan A (alternatives only). */
  tradeoff: string | null;
}

export interface PlanOutcome {
  status: 'OK' | 'INFEASIBLE' | 'INVALID';
  messages: string[];
  target: PlanTarget | null;
  plans: Plan[];
  /** Notes on intervention types that couldn't be considered, and why. */
  notes: string[];
  evaluated: number;
  feasible: number;
  rejected: { overBudget: number; tooMany: number; noReduction: number };
  budget: number;
  objective: Objective;
  assumptions: PlanAssumptions;
  /** When nothing fits the budget: the cheapest single measure allowed by the limits (a valid alternative to try). */
  suggestedBudget?: number;
}

/** Smallest predicted reduction (µg/m³) that counts as an improvement. */
export const MIN_REDUCTION = 0.01;

// ------------------------------------------------------------------ helpers

/** "a", "a and b", "a, b and c". */
export function listJoin(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function formatINR(v: number, decimals = 0): string {
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function pct(before: number, after: number): number | null {
  return before > 0 ? ((after - before) / before) * 100 : null;
}

export function resolveTarget(base: BaseState, targetId: string): PlanTarget | null {
  if (targetId === 'city') return { id: 'city', label: 'Whole analysis area', cells: base.cells, cityWide: true };
  const cell = base.cells.find((c) => c.id === targetId);
  if (!cell) return null;
  const place = zonePlaceNames(base.cells).get(cell.id);
  return { id: cell.id, label: place ? `Zone ${cell.id} (${place})` : `Zone ${cell.id}`, cells: [cell], cityWide: false };
}

/** Candidate options per intervention type, plus notes on what was left out. */
function candidates(base: BaseState, target: PlanTarget, limits: OperationalLimits, a: PlanAssumptions, prices: Record<string, PriceRecord>) {
  const notes: string[] = [];
  const byType: Record<InterventionType, InterventionOption[]> = { trees: [], industry: [], traffic: [] };
  const build = (type: InterventionType, f: () => InterventionOption[]) => {
    if (limits.unavailable.includes(type)) {
      notes.push(`${INTERVENTION_LABEL[type]} is marked unavailable.`);
      return;
    }
    try {
      byType[type] = f();
    } catch (e) {
      if (e instanceof MissingPriceError) notes.push(`${INTERVENTION_LABEL[type]} left out: no price for “${e.priceId}”.`);
      else throw e;
    }
  };
  build('trees', () => {
    const levels = TREE_LEVELS.filter((n) => limits.plantingCapacity == null || n <= limits.plantingCapacity);
    if (!levels.length) notes.push(`Tree planting left out: the planting capacity (${limits.plantingCapacity}) is below the smallest planting (${TREE_LEVELS[0]}).`);
    return levels.map((n) => treeOption(target, n, a, prices));
  });
  build('industry', () => {
    const sources = eligibleSources(base, target);
    if (!sources.length) {
      notes.push(`Industrial emission control left out: no modeled industrial source lies in or within 2 km of ${target.label}.`);
      return [];
    }
    return Array.from({ length: Math.min(3, sources.length) }, (_, i) => industryOption(sources, i + 1, a, prices));
  });
  build('traffic', () => {
    if (target.cityWide) {
      notes.push('Traffic enforcement left out: it is planned for one zone at a time. Choose a zone as the target.');
      return [];
    }
    return [trafficOption(target, 'standard', a, prices), trafficOption(target, 'intensive', a, prices)];
  });
  return { byType, notes };
}

function mergeParams(base: BaseState, target: PlanTarget, options: InterventionOption[]): ScenarioParams {
  const p: ScenarioParams = { ...defaultParams(base), targetCells: target.cityWide ? [] : target.cells.map((c) => c.id) };
  for (const o of options) {
    const { industryIntensityOverrides, ...rest } = o.patch;
    Object.assign(p, rest);
    if (industryIntensityOverrides) p.industryIntensityOverrides = { ...p.industryIntensityOverrides, ...industryIntensityOverrides };
  }
  p.name = `Plan-It: ${options.map(describeOption).join(' + ')}`;
  return p;
}

export function describeOption(o: InterventionOption): string {
  if (o.type === 'trees') return `${o.quantity.toLocaleString('en-IN')} trees`;
  if (o.type === 'industry') return `${o.quantity} bag filter${o.quantity > 1 ? 's' : ''}`;
  return o.quantityUnit.includes('intensive') ? 'intensive traffic zone' : 'traffic zone';
}

function impactOf(result: ScenarioResult, target: PlanTarget): PlanImpact {
  const ids = new Set(target.cells.map((c) => c.id));
  const mean = (xs: { pm25: number }[]) => xs.reduce((s, x) => s + x.pm25, 0) / Math.max(1, xs.length);
  const baseline = mean(result.baseline.filter((s) => ids.has(s.cellId)));
  const predicted = mean(result.scenario.filter((s) => ids.has(s.cellId)));
  return {
    baseline,
    predicted,
    abs: predicted - baseline,
    pct: pct(baseline, predicted),
    cityBaseline: result.summary.meanBaseline,
    cityPredicted: result.summary.meanScenario,
    zonesImproved: Object.values(result.delta).filter((d) => d.pm25 <= -0.5).length,
    affectedZones: result.affectedZones,
  };
}

interface Candidate {
  options: InterventionOption[];
  key: string;
  signature: string;
  total: number;
  oneTime: number;
  recurring: number;
  params: ScenarioParams;
  result: ScenarioResult;
  impact: PlanImpact;
  score: number;
}

function scoreOf(objective: Objective, c: { impact: PlanImpact; total: number }): number {
  const reduction = -c.impact.abs;
  if (objective === 'efficiency') return reduction / (c.total / 100000);
  if (objective === 'coverage') return c.impact.zonesImproved + reduction / 1000; // reduction breaks ties
  return reduction;
}

function compare(a: Candidate, b: Candidate): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.total !== b.total) return a.total - b.total;
  return a.key.localeCompare(b.key);
}

// ------------------------------------------------------------------ engine

export function generatePlans(input: PlanInput): PlanOutcome {
  const a = input.assumptions ?? DEFAULT_ASSUMPTIONS;
  const prices = input.prices ?? PRICES;
  const empty: PlanOutcome = {
    status: 'INVALID',
    messages: [],
    target: null,
    plans: [],
    notes: [],
    evaluated: 0,
    feasible: 0,
    rejected: { overBudget: 0, tooMany: 0, noReduction: 0 },
    budget: input.budget,
    objective: input.objective,
    assumptions: a,
  };
  if (!Number.isFinite(input.budget) || input.budget <= 0) return { ...empty, messages: ['Enter a budget above ₹0.'] };
  if (input.limits.maxInterventions != null && input.limits.maxInterventions < 1)
    return { ...empty, messages: ['The maximum number of interventions must be at least 1.'] };
  const target = resolveTarget(input.base, input.targetId);
  if (!target) return { ...empty, messages: [`Zone “${input.targetId}” isn’t part of the current grid.`] };

  const { byType, notes } = candidates(input.base, target, input.limits, a, prices);
  const types = (Object.keys(byType) as InterventionType[]).filter((t) => byType[t].length);
  const rejected = { overBudget: 0, tooMany: 0, noReduction: 0 };
  const pool: Candidate[] = [];
  let evaluated = 0;

  // Every combination of "not used" or one quantity level per type.
  const walk = (i: number, chosen: InterventionOption[]) => {
    if (i === types.length) {
      if (!chosen.length) return;
      evaluated++;
      if (input.limits.maxInterventions != null && chosen.length > input.limits.maxInterventions) {
        rejected.tooMany++;
        return;
      }
      const total = chosen.reduce((s, o) => s + o.total, 0);
      if (total > input.budget) {
        rejected.overBudget++;
        return;
      }
      const params = mergeParams(input.base, target, chosen);
      if (validateParams(params).length) return;
      const result = runScenario(input.base, params);
      const impact = impactOf(result, target);
      if (!(impact.abs <= -MIN_REDUCTION)) {
        rejected.noReduction++;
        return;
      }
      const cand = {
        options: chosen,
        key: chosen.map((o) => o.key).join('|'),
        signature: chosen.map((o) => o.type).join('+'),
        total,
        oneTime: chosen.reduce((s, o) => s + o.oneTime, 0),
        recurring: chosen.reduce((s, o) => s + o.recurring, 0),
        params,
        result,
        impact,
        score: 0,
      };
      cand.score = scoreOf(input.objective, cand);
      pool.push(cand);
      return;
    }
    walk(i + 1, chosen);
    for (const o of byType[types[i]]) walk(i + 1, [...chosen, o]);
  };
  walk(0, []);
  pool.sort(compare);

  if (!pool.length) {
    const messages: string[] = [];
    const all = types.flatMap((t) => byType[t]);
    let suggestedBudget: number | undefined;
    if (!all.length) messages.push('No measure can be used for this target with the selected limits.');
    else if (rejected.overBudget && !rejected.noReduction) {
      const cheapest = [...all].sort((x, y) => x.total - y.total)[0];
      suggestedBudget = cheapest.total;
      messages.push(`The budget is too small: the cheapest measure, ${describeOption(cheapest)}, costs ${formatINR(cheapest.total)}.`);
    } else if (rejected.noReduction) messages.push('No affordable package lowers predicted PM2.5 here.');
    else messages.push('No package meets all the selected limits.');
    return { ...empty, status: 'INFEASIBLE', target, notes, messages, evaluated, rejected, suggestedBudget };
  }

  // Plan A is the best; B and C are the best packages with a different mix of measures.
  const picks: Candidate[] = [pool[0]];
  const mixNote: string[] = [];
  for (const id of ['B', 'C'] as const) {
    const usedSig = new Set(picks.map((p) => p.signature));
    const usedKey = new Set(picks.map((p) => p.key));
    let next = pool.find((c) => !usedSig.has(c.signature));
    if (!next) {
      next = pool.find((c) => !usedKey.has(c.key));
      if (next) mixNote.push(`Plan ${id} uses the same mix of measures as a higher plan, with different quantities: no other mix is feasible.`);
    }
    if (next) picks.push(next);
  }

  const best = picks[0];
  const plans: Plan[] = picks.map((c, i) => {
    const id = (['A', 'B', 'C'] as const)[i];
    return {
      id,
      options: c.options,
      oneTime: c.oneTime,
      recurring: c.recurring,
      total: c.total,
      remaining: input.budget - c.total,
      impact: c.impact,
      params: { ...c.params, name: `Plan ${id}: ${c.options.map(describeOption).join(' + ')}` },
      result: { ...c.result, params: { ...c.result.params, name: `Plan ${id}: ${c.options.map(describeOption).join(' + ')}` } },
      reason: i === 0 ? reasonFirst(c, input.objective, pool.length, target) : reasonAlt(c, best, input.objective),
      tradeoff: i === 0 ? null : tradeoff(c, best),
    };
  });

  const messages: string[] = [];
  if (plans.length < 3)
    messages.push(
      plans.length === 1
        ? 'Only one distinct package fits the budget and limits.'
        : `Only ${plans.length} distinct packages fit the budget and limits.`,
    );
  messages.push(...mixNote);
  return { status: 'OK', messages, target, plans, notes, evaluated, feasible: pool.length, rejected, budget: input.budget, objective: input.objective, assumptions: a };
}

function fmtDelta(v: number) {
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} µg/m³`;
}

function reasonFirst(c: Candidate, objective: Objective, n: number, target: PlanTarget): string {
  const where = target.cityWide ? 'across the analysis area' : `in ${target.label}`;
  const of = n === 1 ? 'the only feasible package' : `the ${n} feasible packages`;
  if (objective === 'efficiency')
    return `Most predicted PM2.5 reduction per rupee of ${of}: ${(-c.impact.abs / (c.total / 100000)).toFixed(3)} µg/m³ per ₹1 lakh ${where}.`;
  if (objective === 'coverage') return `Improves the most zones (${c.impact.zonesImproved} by at least 0.5 µg/m³) of ${of}.`;
  return `Largest predicted PM2.5 reduction ${where} (${fmtDelta(c.impact.abs)}) of ${of} within budget.`;
}

function reasonAlt(c: Candidate, best: Candidate, objective: Objective): string {
  const gap = c.impact.abs - best.impact.abs; // positive = smaller reduction than A
  const costDiff = c.total - best.total;
  const cost = costDiff < 0 ? `costs ${formatINR(-costDiff)} less` : costDiff > 0 ? `costs ${formatINR(costDiff)} more` : 'costs the same';
  const mix = c.signature !== best.signature ? `Uses ${listJoin(c.options.map((o) => INTERVENTION_LABEL[o.type].toLowerCase()))}. ` : '';
  if (objective === 'coverage') return `${mix}Improves ${c.impact.zonesImproved} zones against Plan A's ${best.impact.zonesImproved}, and ${cost}.`;
  const reduction = Math.abs(gap) < 0.005 ? 'about the same reduction as Plan A' : gap > 0 ? `${gap.toFixed(2)} µg/m³ less reduction than Plan A` : `${(-gap).toFixed(2)} µg/m³ more reduction than Plan A`;
  return `${mix}Predicts ${reduction} and ${cost}.`;
}

function tradeoff(c: Candidate, best: Candidate): string {
  const costDiff = c.total - best.total;
  const gap = c.impact.abs - best.impact.abs;
  const parts = [costDiff < 0 ? `${formatINR(-costDiff)} cheaper` : costDiff > 0 ? `${formatINR(costDiff)} dearer` : 'same cost'];
  parts.push(Math.abs(gap) < 0.005 ? 'same reduction' : gap > 0 ? `${gap.toFixed(2)} µg/m³ less reduction` : `${(-gap).toFixed(2)} µg/m³ more reduction`);
  return parts.join(', ');
}
