// Intervention sensitivity: the package's planning.analyze() run on the Task 2 forecast.
// Costs come from Plan-It's priced items and effects from the existing rule-based scenario
// engine, both via the Actions recommendations for the zone around the station. These are
// supplied assumptions: the Task 2 model learned no intervention effects.
import { useMemo, useState } from 'react';
import { useTwin } from '../store/useTwinStore';
import { recommendActions } from '../scenarios/recommendations';
import { formatINR } from '../plan/planEngine';
import { bboxContains, haversineKm } from '../utils/geo';
import { zonePlaceNames } from '../utils/zones';
import { fmt } from '../utils/format';
import { Button, Slider } from '../components/ui';
import { T2_LABEL, T2_UNIT, task2Api, type T2Action, type T2Plan, type T2Request, type T2Station } from '../services/task2Api';
import type { LonLat } from '../types';

const lakh = (v: number) => (v >= 100000 ? `₹${(v / 100000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} lakh` : formatINR(v));

export function Task2Planning({ request, station, available }: { request: T2Request; station: T2Station; available: boolean }) {
  const base = useTwin((s) => s.base);
  const baseline = useTwin((s) => s.baseline);
  const [budget, setBudget] = useState<number | null>(null);
  const [plan, setPlan] = useState<T2Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zone = useMemo(() => {
    if (!base || station.longitude == null || station.latitude == null) return null;
    const p: LonLat = [station.longitude, station.latitude];
    const inside = base.cells.find((c) => bboxContains(c.bounds, p));
    return inside ?? [...base.cells].sort((a, b) => haversineKm(a.center, p) - haversineKm(b.center, p))[0] ?? null;
  }, [base, station]);

  const actions = useMemo<T2Action[]>(() => {
    if (!base || !zone || !baseline.length) return [];
    const places = zonePlaceNames(base.cells);
    const set = recommendActions(base, baseline, { targetCellId: zone.id, pollutant: request.pollutant, placeName: (id) => places.get(id) });
    const seen = new Set<string>();
    return set.recommendations
      .filter((r) => r.cost && r.effect.targetPct != null && r.effect.targetPct < 0)
      .filter((r) => !seen.has(r.name) && seen.add(r.name))
      .slice(0, 12)
      .map((r) => ({
        id: r.name,
        cost: Math.round(r.cost!.total),
        fraction: Math.min(1, -r.effect.targetPct! / 100),
        source: `Cost: Plan-It priced items for “${r.measure}”. Effect: ${fmt(-r.effect.targetPct!, 1)}% ${T2_LABEL[request.pollutant]} change in the station’s zone from AeroMatrix’s rule-based scenario engine (not calibrated, not learned by the Task 2 model).`,
      }));
  }, [base, baseline, zone, request.pollutant]);

  const total = actions.reduce((a, b) => a + b.cost, 0);
  const value = budget ?? Math.round(total * 0.6);
  const key = JSON.stringify([request, actions, value]);
  const fresh = plan && (plan as T2Plan & { key?: string }).key === key;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await task2Api.plan(request, actions, value);
      setPlan(Object.assign(r, { key }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!available) return <p className="text-[12.5px] text-sand-400">No PM2.5 forecast for this hour.</p>;
  if (!actions.length) return <p className="text-[12.5px] text-sand-400">No priced action lowers {T2_LABEL[request.pollutant]} in this station’s zone.</p>;

  const a = fresh ? plan!.analysis : null;
  const rows = a && a.status === 'HYPOTHETICAL_SENSITIVITY' ? a.scenarios : [];
  // One assumption changed at a time; the others stay at their central values.
  type Row = (typeof rows)[number];
  type Dim = 'baseline' | 'effect' | 'budget' | 'action';
  const central: Record<Dim, (r: Row) => boolean> = {
    baseline: (r) => r.baseline_case === 'central',
    effect: (r) => r.effect_factor === 1,
    budget: (r) => r.budget === value,
    action: (r) => r.unavailable_action == null,
  };
  const only = (dim: Dim, pred: (r: Row) => boolean) => rows.find((r) => pred(r) && (Object.keys(central) as Dim[]).every((k) => k === dim || central[k](r)));
  const cases: [string, Row | undefined][] = [
    ['Forecast at the interval’s low end', only('baseline', (r) => r.baseline_case === 'lower')],
    ['Forecast at the interval’s high end', only('baseline', (r) => r.baseline_case === 'upper')],
    ['Effects 30% weaker', only('effect', (r) => r.effect_factor < 1)],
    ['Effects 30% stronger', only('effect', (r) => r.effect_factor > 1)],
    ['Budget 30% smaller', only('budget', (r) => r.budget < value)],
    [`Without “${actions[0].id}”`, only('action', (r) => r.unavailable_action != null)],
  ];

  return (
    <div>
      <ul className="mb-2 space-y-1 text-[12px] text-sand-300">
        {actions.map((x) => (
          <li key={x.id} className="flex justify-between gap-3" title={x.source}>
            <span className="min-w-0 truncate">{x.id}</span>
            <span className="num shrink-0 text-sand-400">
              {lakh(x.cost)} · {fmt(x.fraction * 100, 1)}%
            </span>
          </li>
        ))}
      </ul>
      <Slider label="Budget" value={value} min={0} max={total} step={Math.max(1000, Math.round(total / 100))} format={lakh} onChange={setBudget} />
      <div className="mt-2 flex items-center gap-2">
        <Button variant="outline" onClick={() => void run()} disabled={busy}>
          {busy ? 'Running…' : fresh ? 'Run again' : 'Run sensitivity'}
        </Button>
        {error && <span className="text-[12px] text-accent-300">{error}</span>}
      </div>
      {a && a.status === 'UNAVAILABLE' && <p className="mt-2 text-[12.5px] text-sand-400">{a.reason}</p>}
      {a && a.status === 'HYPOTHETICAL_SENSITIVITY' && (
        <div className="mt-3 space-y-2 text-[12.5px]">
          <p className="text-sand-200">
            Within {lakh(value)}: <span className="font-semibold text-sand-50">{a.central.selected.length ? a.central.selected.join(' + ') : 'no action fits'}</span>{' '}
            <span className="text-sand-400">
              ({lakh(a.central.cost)}, about {fmt(a.central.benefit, 1)} {T2_UNIT} lower than the forecast if the assumed effects held)
            </span>
          </p>
          <table className="w-full text-[12px]">
            <thead className="text-[11px] text-sand-500">
              <tr>
                <th className="pb-1 text-left font-medium">If only this changes</th>
                <th className="pb-1 text-right font-medium">Best choice</th>
              </tr>
            </thead>
            <tbody className="text-sand-300">
              {cases.map(([label, r]) => (
                <tr key={label} className="border-t hairline">
                  <td className="py-1">{label}</td>
                  <td className={`py-1 text-right ${r?.changed ? 'font-semibold text-amber-200' : ''}`}>{!r ? '—' : !r.changed ? 'same' : r.selected.length ? r.selected.join(' + ') : actions.some((x) => x.cost <= r.budget && x.id !== r.unavailable_action) ? `none (no gain from ${fmt(r.baseline, 0)} ${T2_UNIT})` : 'nothing fits the budget'}</td>
                </tr>
              ))}
              <tr className="border-t hairline">
                <td className="py-1">All {rows.length} combinations</td>
                <td className="num py-1 text-right text-sand-50">{fmt(a.unchanged_fraction * 100, 0)}% unchanged</td>
              </tr>
            </tbody>
          </table>
          <p className="text-[11px] text-sand-500" title={a.limitations}>Costs and effects are Actions-screen assumptions, not model estimates.</p>
        </div>
      )}
    </div>
  );
}
