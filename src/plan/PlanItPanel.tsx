import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, ChevronDown, Download, Eye, EyeOff, Play, RotateCcw, X } from 'lucide-react';
import { forecastKey, useTwin, type PlanItState } from '../store/useTwinStore';
import { Button, DeltaText, MetricRow, Slider, TABLE } from '../components/ui';
import { zonePlaceNames } from '../utils/zones';
import { cellAt } from '../services/scenarioService';
import { evaluateRegionScenario, regionLocality } from '../scenarios/regionScenario';
import {
  OBJECTIVE_LABEL,
  describeOption,
  formatINR,
  generatePlans,
  listJoin,
  type Objective,
  type OperationalLimits,
  type Plan,
  type PlanOutcome,
} from './planEngine';
import { INTERVENTION_LABEL, TREE_LEVELS, type InterventionType, type PlanAssumptions } from './costModel';

const lakh = (v: number) => `${(v / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} lakh`;
const ug = (v: number) => `${v.toFixed(1)} µg/m³`;
const lakhNum = (v: number) => (v / 100000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-semibold text-sand-200">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <div className="mt-1 text-[11.5px] text-sand-500">{hint}</div>}
    </label>
  );
}

const FIELD = 'w-full rounded-lg bg-ink-950 px-3 py-2 text-[13px] text-sand-50 ring-1 ring-inset ring-sand-100/15 outline-none focus-visible:ring-2 focus-visible:ring-accent-400';

// ---------------------------------------------------------------- limits

const TYPE_UNAVAILABLE: Record<InterventionType, string> = {
  trees: 'Tree planting unavailable',
  industry: 'Industrial controls unavailable',
  traffic: 'Traffic enforcement unavailable',
};

function limitChips(l: OperationalLimits): { key: string; label: string; remove: (l: OperationalLimits) => OperationalLimits }[] {
  const chips: ReturnType<typeof limitChips> = [];
  if (l.maxInterventions != null)
    chips.push({ key: 'max', label: `At most ${l.maxInterventions} measure${l.maxInterventions > 1 ? 's' : ''}`, remove: (x) => ({ ...x, maxInterventions: null }) });
  for (const t of l.unavailable) chips.push({ key: `u-${t}`, label: TYPE_UNAVAILABLE[t], remove: (x) => ({ ...x, unavailable: x.unavailable.filter((u) => u !== t) }) });
  if (l.plantingCapacity != null)
    chips.push({ key: 'cap', label: `Plant at most ${l.plantingCapacity.toLocaleString('en-IN')} trees`, remove: (x) => ({ ...x, plantingCapacity: null }) });
  return chips;
}

/** Multi-select of operational limits; changes apply only on Apply. */
function LimitsPicker({ value, onChange }: { value: OperationalLimits; onChange: (l: OperationalLimits) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const toggleType = (t: InterventionType) =>
    setDraft((d) => ({ ...d, unavailable: d.unavailable.includes(t) ? d.unavailable.filter((u) => u !== t) : [...d.unavailable, t] }));
  const chips = limitChips(value);
  const box = 'h-4 w-4 shrink-0 cursor-pointer';
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setOpen(!open);
        }}
        aria-expanded={open}
        className={`${FIELD} flex cursor-pointer items-center justify-between text-left`}
      >
        <span className={chips.length ? 'text-sand-50' : 'text-sand-500'}>{chips.length ? `${chips.length} selected` : 'No limits'}</span>
        <ChevronDown size={15} className={`text-sand-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-20 rounded-xl bg-ink-950 p-3 ring-1 ring-sand-100/15 shadow-[0_16px_36px_-18px_rgba(42,15,23,0.6)] animate-rise">
          <div className="space-y-2.5 text-[12.5px] text-sand-100">
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                className={box}
                checked={draft.maxInterventions != null}
                onChange={(e) => setDraft((d) => ({ ...d, maxInterventions: e.target.checked ? 1 : null }))}
                id="lim-max"
              />
              <label htmlFor="lim-max" className="flex-1 cursor-pointer">
                Limit the number of measures
              </label>
              <select
                value={draft.maxInterventions ?? 1}
                disabled={draft.maxInterventions == null}
                onChange={(e) => setDraft((d) => ({ ...d, maxInterventions: Number(e.target.value) }))}
                aria-label="Maximum number of measures"
                className="rounded-md bg-ink-900 px-1.5 py-0.5 text-[12px] ring-1 ring-sand-100/15 disabled:opacity-40"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </div>
            {(Object.keys(TYPE_UNAVAILABLE) as InterventionType[]).map((t) => (
              <div key={t} className="flex items-center gap-2.5">
                <input type="checkbox" className={box} checked={draft.unavailable.includes(t)} onChange={() => toggleType(t)} id={`lim-${t}`} />
                <label htmlFor={`lim-${t}`} className="flex-1 cursor-pointer">
                  {TYPE_UNAVAILABLE[t]}
                </label>
              </div>
            ))}
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                className={box}
                checked={draft.plantingCapacity != null}
                onChange={(e) => setDraft((d) => ({ ...d, plantingCapacity: e.target.checked ? 500 : null }))}
                id="lim-cap"
              />
              <label htmlFor="lim-cap" className="flex-1 cursor-pointer">
                Planting capacity
              </label>
              <select
                value={draft.plantingCapacity ?? 500}
                disabled={draft.plantingCapacity == null}
                onChange={(e) => setDraft((d) => ({ ...d, plantingCapacity: Number(e.target.value) }))}
                aria-label="Maximum trees that can be planted"
                className="rounded-md bg-ink-900 px-1.5 py-0.5 text-[12px] ring-1 ring-sand-100/15 disabled:opacity-40"
              >
                {TREE_LEVELS.slice(0, -1).map((n) => (
                  <option key={n} value={n}>
                    {n.toLocaleString('en-IN')} trees
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2 border-t hairline pt-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              <Check size={14} aria-hidden="true" /> Apply
            </Button>
          </div>
        </div>
      )}
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1 rounded-md bg-accent-500/10 py-0.5 pl-2 pr-1 text-[12px] font-medium text-accent-200">
              {c.label}
              <button type="button" onClick={() => onChange(c.remove(value))} aria-label={`Remove: ${c.label}`} className="grid h-5 w-5 cursor-pointer place-items-center rounded hover:bg-accent-500/15">
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- form

function PlanForm({ onGenerate, busy, error }: { onGenerate: () => void; busy: boolean; error: string | null }) {
  const st = useTwin((s) => s.planIt);
  const setPlanIt = useTwin((s) => s.setPlanIt);
  const base = useTwin((s) => s.base)!;
  const baseline = useTwin((s) => s.baseline);
  const [budgetText, setBudgetText] = useState(() => st.budget.toLocaleString('en-IN'));
  const places = zonePlaceNames(base.cells);
  const zones = useMemo(() => [...baseline].sort((a, b) => b.pm25 - a.pm25), [baseline]);
  const byId = useMemo(() => new Map(base.cells.map((c) => [c.id, c])), [base]);
  const budgetValid = Number.isFinite(st.budget) && st.budget > 0;

  return (
    <form
      className="space-y-4 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        onGenerate();
      }}
    >
      <Field label="Budget" hint={budgetValid ? `${formatINR(st.budget)}, one-time plus first-year running costs (${lakh(st.budget)})` : 'Enter an amount above ₹0'}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-sand-400">₹</span>
          <input
            value={budgetText}
            inputMode="numeric"
            aria-label="Budget in rupees"
            aria-invalid={!budgetValid}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, '');
              setBudgetText(digits ? Number(digits).toLocaleString('en-IN') : '');
              setPlanIt({ budget: digits ? Number(digits) : 0 });
            }}
            className={`${FIELD} num pl-7 ${budgetValid ? '' : 'ring-accent-400'}`}
          />
        </div>
      </Field>

      <Field label="Target area">
        <select value={st.targetId ?? ''} onChange={(e) => setPlanIt({ targetId: e.target.value })} className={`${FIELD} cursor-pointer`}>
          <option value="city">Whole analysis area</option>
          {zones.map((z) => {
            const c = byId.get(z.cellId);
            const place = places.get(z.cellId);
            return (
              <option key={z.cellId} value={z.cellId}>
                {z.cellId}
                {place ? ` ${place}` : ''}, {c?.landUse}, PM2.5 {Math.round(z.pm25)}
              </option>
            );
          })}
        </select>
      </Field>

      <div>
        <span className="text-[12.5px] font-semibold text-sand-200">Operational limits</span>
        <div className="mt-1.5">
          <LimitsPicker value={st.limits} onChange={(limits) => setPlanIt({ limits })} />
        </div>
      </div>

      <fieldset>
        <legend className="text-[12.5px] font-semibold text-sand-200">Objective</legend>
        <div className="mt-1.5 space-y-1">
          {(Object.keys(OBJECTIVE_LABEL) as Objective[]).map((o) => (
            <label
              key={o}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] ring-1 ring-inset transition-colors ${
                st.objective === o ? 'bg-accent-500/[0.08] text-sand-50 ring-accent-400/50' : 'text-sand-200 ring-sand-100/12 hover:ring-sand-100/25'
              }`}
            >
              <input type="radio" name="plan-objective" className="h-4 w-4 cursor-pointer" checked={st.objective === o} onChange={() => setPlanIt({ objective: o })} />
              {OBJECTIVE_LABEL[o]}
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-lg bg-accent-500/10 px-3 py-2 text-[12.5px] text-accent-300">
          {error}
        </p>
      )}

      <Button variant="primary" className="w-full !min-h-10 text-[13.5px]" onClick={onGenerate} disabled={busy || !budgetValid || !st.targetId}>
        {busy ? 'Calculating…' : 'Generate plan'}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- results

function PlanDetails({ plan, outcome }: { plan: Plan; outcome: PlanOutcome }) {
  const base = useTwin((s) => s.base)!;
  const stations = useTwin((s) => s.stations);
  const measuredAll = useTwin((s) => s.stationMeasured);
  const forecasts = useTwin((s) => s.forecasts);
  const allowHistorical = useTwin((s) => s.allowHistoricalForecast);
  const online = useTwin((s) => s.modelService.status === 'online');
  const target = outcome.target!;
  // If a monitoring station's area falls in the target zone, apply the plan's modelled change to its ML forecast too.
  const station = !target.cityWide
    ? stations.find((s) => {
        const loc = regionLocality(s);
        return loc && cellAt(base, loc.location)?.id === target.id;
      })
    : undefined;
  const stationEval = station
    ? evaluateRegionScenario({
        station,
        measured: measuredAll[station.station],
        forecast: forecasts[forecastKey(station.station, allowHistorical)],
        serviceOnline: online,
        base,
        result: plan.result,
      })
    : null;
  const pmRow = stationEval?.rows.find((r) => r.pollutant === 'pm25');

  return (
    <div className="space-y-3">
      {plan.options.map((o) => (
        <details key={o.key} className="group rounded-xl ring-1 ring-inset ring-sand-100/12 open:bg-sand-100/[0.025]">
          <summary className="flex cursor-pointer list-none items-start gap-3 px-3.5 py-3">
            <ChevronDown size={15} className="mt-0.5 shrink-0 text-sand-400 transition-transform group-open:rotate-180" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-sand-50">{o.label}</span>
              <span className="block text-[12px] text-sand-400">
                {o.quantity.toLocaleString('en-IN')} {o.quantityUnit}, {o.location}
              </span>
            </span>
            <span className="num shrink-0 text-[13px] font-semibold text-sand-50">{formatINR(o.total)}</span>
          </summary>
          <div className="px-3.5 pb-3.5">
            <table className="w-full text-[12px]">
              <thead className="text-[11px] text-sand-500">
                <tr>
                  <th className="pb-1 text-left font-medium">Item</th>
                  <th className="pb-1 text-right font-medium">Quantity × price</th>
                  <th className="pb-1 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {o.lines.map((l, i) => (
                  <tr key={`${l.priceId}-${i}`} className="border-t hairline align-top">
                    <td className="py-1.5 pr-2 text-sand-200">
                      {l.item}
                      <span className="block text-[10.5px] text-sand-500">
                        {l.category}
                        {l.recurring ? ', first-year running cost' : ''}
                        {l.kind === 'estimate' ? ', estimated price' : ''}
                        {l.adjusted ? ', adjusted' : ''}
                      </span>
                    </td>
                    <td className="num py-1.5 text-right text-sand-300">
                      {l.quantity.toLocaleString('en-IN')} {l.unit} × {formatINR(l.unitPrice, l.unitPrice % 1 ? 2 : 0)}
                    </td>
                    <td className="num py-1.5 pl-2 text-right font-medium text-sand-50">{formatINR(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 border-t hairline pt-2">
              <MetricRow label="One-time">{formatINR(o.oneTime)}</MetricRow>
              <MetricRow label="First-year running">{formatINR(o.recurring)}</MetricRow>
            </div>
            <p className="mt-2 text-[12px] leading-snug text-sand-300">{o.effect}</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11.5px] leading-snug text-sand-500">
              {o.limitations.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </details>
      ))}

      <div className="rounded-xl bg-sand-100/[0.04] px-3.5 py-3 ring-1 ring-inset ring-sand-100/10">
        <MetricRow label="One-time costs">{formatINR(plan.oneTime)}</MetricRow>
        <MetricRow label="First-year running costs">{formatINR(plan.recurring)}</MetricRow>
        <MetricRow label={<span className="font-semibold text-sand-100">Total</span>}>{formatINR(plan.total)}</MetricRow>
        <MetricRow label="Budget left">{formatINR(plan.remaining)}</MetricRow>
      </div>

      <div className="rounded-xl bg-sand-100/[0.04] px-3.5 py-3 ring-1 ring-inset ring-sand-100/10">
        <div className="text-[12.5px] font-semibold text-sand-100">Predicted outcome</div>
        <MetricRow label={`PM2.5, ${target.cityWide ? 'area mean' : target.label}`}>
          {ug(plan.impact.baseline)} → {ug(plan.impact.predicted)}
        </MetricRow>
        <MetricRow label="Change">
          <DeltaText value={plan.impact.abs} digits={2} unit=" µg/m³" /> {plan.impact.pct != null && <>(<DeltaText value={plan.impact.pct} unit="%" />)</>}
        </MetricRow>
        <MetricRow label="City mean PM2.5">
          {ug(plan.impact.cityBaseline)} → {ug(plan.impact.cityPredicted)}
        </MetricRow>
        <MetricRow label="Zones improved by 0.5 µg/m³ or more">{plan.impact.zonesImproved}</MetricRow>
        {station && pmRow?.baseline && pmRow.scenario && (
          <MetricRow label={`${station.name} station, +24 h forecast`}>
            {ug(pmRow.baseline.value)} → {ug(pmRow.scenario.value)}
          </MetricRow>
        )}
        <p className="mt-1.5 text-[11.5px] text-sand-500">Modelled estimate, not a measured change.</p>
      </div>
    </div>
  );
}

function SensitivityPanel({ outcome, onUse }: { outcome: PlanOutcome; onUse: (o: PlanOutcome) => void }) {
  const st = useTwin((s) => s.planIt);
  const base = useTwin((s) => s.base)!;
  const [a, setA] = useState<PlanAssumptions>(outcome.assumptions);
  const [alt, setAlt] = useState<PlanOutcome | null>(null);
  const setCost = (t: InterventionType, v: number) => setA((x) => ({ ...x, costMultiplier: { ...x.costMultiplier, [t]: v } }));
  const before = outcome.plans[0];
  const after = alt?.plans[0];
  const order = (o: PlanOutcome) => o.plans.map((p) => p.options.map((x) => x.key).join('|')).join(' / ');
  const pctLabel = (v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
  return (
    <details className="group rounded-xl ring-1 ring-inset ring-sand-100/12">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-[13px] font-semibold text-sand-100">
        <ChevronDown size={15} className="text-sand-400 transition-transform group-open:rotate-180" aria-hidden="true" />
        Test the assumptions
      </summary>
      <div className="px-3.5 pb-3.5">
        <Slider label="Tree planting costs" value={a.costMultiplier.trees} min={0.5} max={1.5} step={0.05} format={pctLabel} onChange={(v) => setCost('trees', v)} />
        <Slider label="Industrial control costs" value={a.costMultiplier.industry} min={0.5} max={1.5} step={0.05} format={pctLabel} onChange={(v) => setCost('industry', v)} />
        <Slider label="Traffic enforcement costs" value={a.costMultiplier.traffic} min={0.5} max={1.5} step={0.05} format={pctLabel} onChange={(v) => setCost('traffic', v)} />
        <Slider label="Canopy per tree" value={a.treeCanopyM2} min={10} max={80} step={5} format={(v) => `${v} m²`} onChange={(v) => setA((x) => ({ ...x, treeCanopyM2: v }))} />
        <Slider label="Bag filter capture" value={a.bagFilterCapture} min={0.5} max={0.99} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setA((x) => ({ ...x, bagFilterCapture: v }))} />
        <Slider
          label="Traffic cut, standard enforcement"
          value={a.trafficReduction.standard}
          min={0.02}
          max={0.25}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => setA((x) => ({ ...x, trafficReduction: { standard: v, intensive: Math.min(0.5, v * 2) } }))}
          hint="Intensive enforcement is assumed to double it."
        />
        <div className="mt-2 flex gap-2">
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => setAlt(generatePlans({ base, budget: st.budget, targetId: outcome.target!.id, limits: st.limits, objective: st.objective, assumptions: a }))}
          >
            <Play size={14} aria-hidden="true" /> Recalculate
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setA(outcome.assumptions);
              setAlt(null);
            }}
          >
            <RotateCcw size={14} aria-hidden="true" /> Reset
          </Button>
        </div>
        {alt && (
          <div className="mt-3 rounded-lg bg-sand-100/[0.05] px-3 py-2.5 text-[12.5px] ring-1 ring-inset ring-sand-100/10" role="status">
            {alt.status !== 'OK' ? (
              <p className="text-sand-200">With these assumptions no plan is feasible: {alt.messages[0]}</p>
            ) : (
              <>
                <MetricRow label="Feasible packages">
                  {outcome.feasible} → {alt.feasible}
                </MetricRow>
                <MetricRow label="Plan A">{after ? listJoin(after.options.map(describeOption)) : '—'}</MetricRow>
                <MetricRow label="Plan A cost">
                  {formatINR(before.total)} → {after ? formatINR(after.total) : '—'}
                </MetricRow>
                <MetricRow label="Plan A budget left">
                  {formatINR(before.remaining)} → {after ? formatINR(after.remaining) : '—'}
                </MetricRow>
                <MetricRow label="Plan A PM2.5 change">
                  {signed(before.impact.abs)} → {after ? signed(after.impact.abs) : '—'} µg/m³
                </MetricRow>
                <p className="mt-1 text-[12px] text-sand-300">{order(alt) === order(outcome) ? 'The ranking of plans is unchanged.' : 'The plans or their ranking change.'}</p>
              </>
            )}
            <div className="mt-2 flex gap-2">
              {alt.status === 'OK' && (
                <Button
                  className="flex-1"
                  onClick={() => {
                    onUse(alt);
                    setAlt(null);
                  }}
                >
                  Use these results
                </Button>
              )}
              <Button variant="ghost" onClick={() => setAlt(null)}>
                Discard
              </Button>
            </div>
          </div>
        )}
        <p className="mt-2 text-[11.5px] text-sand-500">Temporary: doesn’t change prices or the active scenario.</p>
      </div>
    </details>
  );
}

/** The limits a plan satisfies, as checkmarked chips. */
function ConstraintsMet({ plan, outcome, limits }: { plan: Plan; outcome: PlanOutcome; limits: OperationalLimits }) {
  const trees = plan.options.find((o) => o.type === 'trees')?.quantity ?? 0;
  const items = [`Within budget`];
  if (limits.maxInterventions != null) items.push(`${plan.options.length} of max ${limits.maxInterventions} measures`);
  for (const t of limits.unavailable) items.push(`No ${INTERVENTION_LABEL[t].toLowerCase()}`);
  if (limits.plantingCapacity != null) items.push(`${trees.toLocaleString('en-IN')} of max ${limits.plantingCapacity.toLocaleString('en-IN')} trees`);
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Constraints met" title={`${formatINR(plan.remaining)} of ${formatINR(outcome.budget)} left`}>
      {items.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11.5px] font-medium text-emerald-300">
          <Check size={11} aria-hidden="true" /> {t}
        </span>
      ))}
    </div>
  );
}

function PlanResults({
  outcome,
  stale,
  onBack,
  onRegenerate,
  onTryBudget,
}: {
  outcome: PlanOutcome;
  stale: boolean;
  onBack: () => void;
  onRegenerate: () => void;
  onTryBudget: (budget: number) => void;
}) {
  const st = useTwin((s) => s.planIt);
  const setPlanIt = useTwin((s) => s.setPlanIt);
  const preview = useTwin((s) => s.previewResult);
  const setPreview = useTwin((s) => s.setPreviewResult);
  const applyScenario = useTwin((s) => s.applyScenario);
  const [confirming, setConfirming] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const plan = outcome.plans.find((p) => p.id === st.selected) ?? outcome.plans[0];
  const previewing = !!plan && !!preview && preview === plan.result;

  // Keep a running preview in step with the selected plan.
  useEffect(() => {
    if (preview && plan && outcome.plans.some((p) => p.result === preview) && preview !== plan.result) setPreview(plan.result);
  }, [plan, preview, outcome, setPreview]);

  if (outcome.status !== 'OK' || !plan) {
    return (
      <div className="space-y-3 px-5 py-4">
        <div role="alert" className="rounded-xl bg-accent-500/[0.07] px-3.5 py-3 ring-1 ring-inset ring-accent-400/30">
          <div className="text-[13px] font-semibold text-sand-50">{outcome.status === 'INVALID' ? 'Check the inputs' : 'No feasible plan'}</div>
          {outcome.messages.map((m) => (
            <p key={m} className="mt-1 text-[12.5px] leading-snug text-sand-200">
              {m}
            </p>
          ))}
          {outcome.notes.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[12px] text-sand-300">
              {outcome.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {outcome.suggestedBudget != null && (
            <Button variant="primary" onClick={() => onTryBudget(outcome.suggestedBudget!)}>
              Try a budget of {formatINR(outcome.suggestedBudget)}
            </Button>
          )}
          <Button onClick={onBack}>
            <ArrowLeft size={14} aria-hidden="true" /> Back to planning
          </Button>
        </div>
      </div>
    );
  }

  const a = outcome.plans[0];
  const downloadPdf = async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      const { downloadPlanPdf } = await import('./planPdf');
      downloadPlanPdf(outcome);
    } catch (e) {
      setPdfError(`Couldn’t create the PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-4 px-5 py-4">
      {stale && (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-lg bg-amber-300/15 px-3 py-2 text-[12.5px] text-amber-200">
          The grid or data changed since this plan was made.
          <Button className="!min-h-7 shrink-0" onClick={onRegenerate}>
            Generate again
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 text-[11.5px]">
        {[formatINR(outcome.budget), outcome.target!.label, OBJECTIVE_LABEL[outcome.objective], ...limitChips(st.limits).map((c) => c.label)].map((t) => (
          <span key={t} className="rounded-md bg-sand-100/[0.06] px-2 py-0.5 font-medium text-sand-300">
            {t}
          </span>
        ))}
      </div>

      {/* Plan A */}
      <section className={`rounded-xl p-4 ring-1 ring-inset ${st.selected === 'A' ? 'bg-accent-500/[0.06] ring-accent-400/50' : 'ring-sand-100/12'}`}>
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold text-sand-50">Plan A</h3>
          <span className="rounded-md bg-accent-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">Recommended</span>
        </div>
        <p className="mt-0.5 text-[12.5px] text-sand-300">{listJoin(a.options.map(describeOption))}</p>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
          <div>
            <div className="text-[11.5px] text-sand-400">Total cost</div>
            <div className="num text-[16px] font-semibold text-sand-50">{formatINR(a.total)}</div>
          </div>
          <div>
            <div className="text-[11.5px] text-sand-400">Budget left</div>
            <div className="num text-[16px] font-semibold text-sand-50">{formatINR(a.remaining)}</div>
          </div>
          <div>
            <div className="text-[11.5px] text-sand-400">Measures</div>
            <div className="num text-[16px] font-semibold text-sand-50">{a.options.length}</div>
          </div>
          <div>
            <div className="text-[11.5px] text-sand-400">Predicted PM2.5</div>
            <div className="text-[16px] font-semibold">
              <DeltaText value={a.impact.abs} digits={1} unit=" µg/m³" />
            </div>
          </div>
        </div>
        <p className="mt-3 text-[12.5px] leading-snug text-sand-200">{a.reason}</p>
        <ConstraintsMet plan={a} outcome={outcome} limits={st.limits} />
      </section>

      {/* Comparison */}
      {outcome.plans.length > 1 && (
        <div>
          <h3 className="mb-1 text-[13px] font-semibold text-sand-200">Compare plans</h3>
          <table className={TABLE.table}>
            <thead>
              <tr>
                <th className={`${TABLE.th} pl-2 text-left`}>Plan</th>
                <th className={`${TABLE.th} pl-3 text-right`}>Cost</th>
                <th className={`${TABLE.th} pl-3 text-right`}>Left</th>
                <th className={`${TABLE.th} pl-3 pr-2 text-right`}>PM2.5</th>
              </tr>
            </thead>
            <tbody>
              {outcome.plans.map((p) => {
                const active = p.id === plan.id;
                const go = () => setPlanIt({ selected: p.id });
                return (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    aria-selected={active}
                    onClick={go}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go())}
                    className={`${TABLE.row} ${active ? TABLE.rowActive : ''}`}
                  >
                    <td className={`${TABLE.td} relative pl-2`}>
                      {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-accent-500" aria-hidden="true" />}
                      <span className="block font-semibold text-sand-50">Plan {p.id}</span>
                      <span className="block text-[11.5px] text-sand-400">{p.tradeoff ?? listJoin(p.options.map(describeOption))}</span>
                    </td>
                    <td className={`${TABLE.td} num pl-3 text-right text-sand-100`}>{lakhNum(p.total)}</td>
                    <td className={`${TABLE.td} num pl-3 text-right text-sand-300`}>{lakhNum(p.remaining)}</td>
                    <td className={`${TABLE.td} pl-3 pr-2 text-right`}>
                      <DeltaText value={p.impact.abs} digits={1} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1.5 text-[11.5px] text-sand-500">Costs in ₹ lakh; PM2.5 change in µg/m³ in the target.</p>
        </div>
      )}
      {outcome.messages.map((m) => (
        <p key={m} className="text-[12px] leading-snug text-sand-400">
          {m}
        </p>
      ))}

      {/* Selected plan */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-sand-50">Plan {plan.id} in detail</h3>
          <span className="text-[12px] text-sand-400">{plan.options.length} measure{plan.options.length > 1 ? 's' : ''}</span>
        </div>
        {plan.id !== 'A' && <p className="mb-2 text-[12.5px] leading-snug text-sand-300">{plan.reason}</p>}
        <PlanDetails plan={plan} outcome={outcome} />
      </section>

      {/* Actions */}
      <div className="sticky bottom-0 -mx-5 space-y-2 border-t hairline bg-ink-950/95 px-5 py-3 backdrop-blur">
        {applied && (
          <p role="status" className="text-[12.5px] font-medium text-emerald-300">
            {applied}
          </p>
        )}
        {pdfError && (
          <p role="alert" className="text-[12.5px] text-accent-300">
            {pdfError}
          </p>
        )}
        {applyError && (
          <p role="alert" className="text-[12.5px] text-accent-300">
            {applyError}
          </p>
        )}
        {confirming ? (
          <div className="rounded-lg bg-accent-500/[0.07] p-3 ring-1 ring-inset ring-accent-400/30">
            <p className="text-[12.5px] text-sand-100">Apply Plan {plan.id} as the active What-If scenario? It replaces the current scenario. This is a modelled scenario, not real-world work.</p>
            <div className="mt-2 flex gap-2">
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => {
                  const err = applyScenario(plan.result);
                  setConfirming(false);
                  if (err) {
                    setApplyError(`Couldn’t apply the plan: ${err} The previous scenario is unchanged.`);
                    setApplied(null);
                  } else {
                    setApplyError(null);
                    setApplied(`Plan ${plan.id} is now the active scenario on the map.`);
                  }
                }}
              >
                Apply plan
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={stale} onClick={() => setPreview(previewing ? null : plan.result)}>
              {previewing ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />} {previewing ? 'Stop preview' : 'Preview on map'}
            </Button>
            <Button variant="primary" disabled={stale} onClick={() => setConfirming(true)}>
              <Check size={14} aria-hidden="true" /> Apply plan
            </Button>
            <Button variant="ghost" className="col-span-2" disabled={pdfBusy} onClick={downloadPdf}>
              <Download size={14} aria-hidden="true" /> {pdfBusy ? 'Preparing PDF…' : 'Download PDF report'}
            </Button>
          </div>
        )}
        {previewing && <p className="text-[11.5px] text-sand-500">Previewing Plan {plan.id}. The active scenario is unchanged.</p>}
      </div>

      <SensitivityPanel key={outcome.plans.map((p) => p.options.map((o) => o.key).join('|')).join('/')} outcome={outcome} onUse={(o) => setPlanIt({ outcome: o, selected: 'A' })} />

      <details className="group text-[12px] text-sand-400">
        <summary className="cursor-pointer list-none font-medium text-sand-300 hover:text-sand-100">What the planner considered</summary>
        <p className="mt-1.5 leading-snug">
          {outcome.evaluated} packages checked, {outcome.feasible} feasible. Rejected: {outcome.rejected.overBudget} over budget, {outcome.rejected.tooMany} with too many
          measures, {outcome.rejected.noReduction} with no predicted reduction.
        </p>
        {outcome.notes.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {outcome.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </details>

      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden="true" /> Back to planning
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- panel

export function PlanItPanel() {
  const st = useTwin((s) => s.planIt);
  const setPlanIt = useTwin((s) => s.setPlanIt);
  const setOpen = useTwin((s) => s.setPlanItOpen);
  const setPreview = useTwin((s) => s.setPreviewResult);
  const base = useTwin((s) => s.base);
  const baseline = useTwin((s) => s.baseline);
  const selectedCell = useTwin((s) => s.selectedCellId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default target: the selected zone, else the zone with the highest PM2.5.
  useEffect(() => {
    if (st.targetId || !baseline.length) return;
    const hottest = [...baseline].sort((x, y) => y.pm25 - x.pm25)[0];
    setPlanIt({ targetId: selectedCell ?? hottest.cellId });
  }, [st.targetId, baseline, selectedCell, setPlanIt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLSelectElement)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  if (!base) return null;
  const stale = !!st.outcome && st.outcomeBase !== base;

  const generate = (budgetOverride?: number) => {
    if (!st.targetId) return;
    const budget = budgetOverride ?? st.budget;
    setBusy(true);
    setError(null);
    setPreview(null);
    // Let the button show its busy state before the (synchronous) search runs.
    setTimeout(() => {
      try {
        const outcome = generatePlans({ base, budget, targetId: st.targetId!, limits: st.limits, objective: st.objective });
        if (outcome.status === 'INVALID') setError(outcome.messages.join(' '));
        else setPlanIt({ outcome, outcomeBase: base, view: 'results', selected: 'A' } satisfies Partial<PlanItState>);
      } catch (e) {
        setError(`Planning failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  const back = () => {
    setPreview(null);
    setPlanIt({ view: 'form' });
  };

  return (
    <aside
      aria-label="Plan-It"
      className="theme-cream sheet-surface absolute inset-x-0 bottom-0 z-[35] flex h-[85dvh] flex-col overflow-hidden rounded-t-2xl animate-sheet-up md:inset-x-auto md:bottom-3 md:right-3 md:top-3 md:h-auto md:w-[520px] md:rounded-2xl md:animate-slide-in"
    >
      <header className="flex items-center gap-3 border-b hairline px-5 py-3.5">
        {st.view === 'results' && (
          <button type="button" onClick={back} aria-label="Back to planning" className="-ml-1.5 grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-sand-400 hover:bg-sand-100/[0.07] hover:text-sand-50">
            <ArrowLeft size={16} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold leading-tight tracking-[-0.01em] text-sand-50">Plan-It</h2>
          <p className="text-[12px] text-sand-400">{st.view === 'results' ? 'Ranked plans within your budget' : 'Plan pollution measures within a budget'}</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close Plan-It" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-sand-400 hover:bg-sand-100/[0.07] hover:text-sand-50">
          <X size={16} />
        </button>
      </header>
      <div className="panel-scroll min-h-0 flex-1">
        {st.view === 'results' && st.outcome ? (
          <PlanResults
            outcome={st.outcome}
            stale={stale}
            onBack={back}
            onRegenerate={() => generate()}
            onTryBudget={(b) => {
              setPlanIt({ budget: b });
              generate(b);
            }}
          />
        ) : (
          <PlanForm onGenerate={() => generate()} busy={busy} error={error} />
        )}
      </div>
    </aside>
  );
}
