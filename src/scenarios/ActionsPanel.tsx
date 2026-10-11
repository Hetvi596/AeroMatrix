import { useMemo, useState } from 'react';
import { Check, Eye, Play } from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import { Button, DeltaText, SectionHeader } from '../components/ui';
import { recommendActions, type Recommendation } from './recommendations';
import { isMeasured } from '../services/aeromatrixApi';
import { zoneRecord } from '../services/liveData';
import { formatINR } from '../plan/planEngine';
import { POLLUTANT_LABEL, POLLUTANT_UNIT } from '../utils/colors';
import { zonePlaceNames } from '../utils/zones';
import { fmt } from '../utils/format';

const signed = (v: number, d: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), d)}`;
const lakh = (v: number) => (v >= 100000 ? `₹${(v / 100000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} lakh` : formatINR(v));

export function ActionsPanel() {
  const base = useTwin((s) => s.base)!;
  const baseline = useTwin((s) => s.baseline);
  const pollutant = useTwin((s) => s.pollutant);
  const selectedCell = useTwin((s) => s.selectedCellId);
  const live = useTwin((s) => s.live);
  const interval = useTwin((s) => s.pm25Interval);
  const measured = useTwin((s) => s.stationMeasured);
  const active = useTwin((s) => s.activeResult);
  const draftName = useTwin((s) => s.draft?.name);
  const applyResult = useTwin((s) => s.applyResult);
  const updateDraft = useTwin((s) => s.updateDraft);
  const setDisplayMode = useTwin((s) => s.setDisplayMode);
  const setRightOpen = useTwin((s) => s.setRightOpen);
  const selectCell = useTwin((s) => s.selectCell);
  const flyTo = useTwin((s) => s.requestFlyTo);
  const [chosen, setChosen] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const places = useMemo(() => zonePlaceNames(base.cells), [base]);
  const hotspots = useMemo(() => [...baseline].sort((a, b) => b[pollutant] - a[pollutant]).slice(0, 8), [baseline, pollutant]);
  const targetId = chosen ?? selectedCell ?? hotspots[0]?.cellId ?? null;

  // Source-strength uncertainty for the effect ranges: the trained PM2.5 model's interval
  // relative to the latest measured station mean when available, otherwise ±25%.
  const uncertainty = useMemo(() => {
    const vals = Object.values(measured)
      .map((m) => (m.status === 'MEASURED' ? m.pollutants.pm25 : undefined))
      .filter(isMeasured)
      .map((v) => v.value);
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return interval && mean ? interval.radius / mean : 0.25;
  }, [interval, measured]);

  const set = useMemo(() => {
    if (!targetId || !baseline.length) return null;
    const current = zoneRecord({ base, live }, targetId, 'pm25').value;
    return recommendActions(base, baseline, { targetCellId: targetId, pollutant, currentPm25: current, uncertainty, placeName: (id) => places.get(id) });
  }, [base, baseline, targetId, pollutant, live, uncertainty, places]);

  if (!set) return <SectionHeader title="Actions" />;
  const unit = POLLUTANT_UNIT[pollutant];
  const digits = pollutant === 'co' ? 2 : 1;

  const showSummary = () => {
    selectCell(null);
    setRightOpen(true);
  };

  /** Show on map: the modelled change, without touching the What-If draft. */
  const preview = (r: Recommendation) => {
    applyResult(r.result);
    setDisplayMode('delta');
    showSummary();
    if (r.focus) flyTo(r.focus.lonlat, r.focus.range, -45);
    const ok = useTwin.getState().activeResult === r.result;
    setNotice(ok ? { ok, text: `Showing ${r.name} on the map.` } : { ok, text: `Couldn’t show ${r.name}.` });
  };

  /** Apply: make it the active scenario and load its settings into What-If. */
  const apply = (r: Recommendation) => {
    updateDraft({ ...r.result.params });
    applyResult(r.result);
    showSummary();
    const s = useTwin.getState();
    const ok = s.activeResult === r.result && s.draft?.name === r.result.params.name;
    setNotice(ok ? { ok, text: `${r.name} is now the active scenario.` } : { ok, text: `${r.name} wasn’t applied. Try again.` });
  };

  return (
    <>
      <SectionHeader title="Actions" subtitle={`Ranked by modelled ${POLLUTANT_LABEL[pollutant]} reduction in the target area`} />

      <div className="px-5 pb-3">
        <label className="block text-[12.5px] font-semibold text-sand-200">
          Target area
          <select
            value={targetId ?? ''}
            onChange={(e) => setChosen(e.target.value)}
            className="mt-1.5 w-full cursor-pointer rounded-lg bg-ink-950 px-2.5 py-1.5 text-[12.5px] font-normal text-sand-100 ring-1 ring-inset ring-sand-100/15 outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            {selectedCell && !hotspots.some((h) => h.cellId === selectedCell) && <option value={selectedCell}>Selected: Zone {selectedCell}{places.get(selectedCell) ? ` (${places.get(selectedCell)})` : ''}</option>}
            {hotspots.map((h, i) => (
              <option key={h.cellId} value={h.cellId}>
                {i === 0 ? 'Worst hotspot: ' : ''}Zone {h.cellId}
                {places.get(h.cellId) ? ` (${places.get(h.cellId)})` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px]">
          <span className="rounded-md bg-sand-100/[0.06] px-2 py-0.5 text-sand-300">Traffic {Math.round(set.target.shares.traffic * 100)}%</span>
          <span className="rounded-md bg-sand-100/[0.06] px-2 py-0.5 text-sand-300">Industry {Math.round(set.target.shares.industry * 100)}%</span>
          <span className="rounded-md bg-sand-100/[0.06] px-2 py-0.5 text-sand-300">Background and other {Math.round(set.target.shares.other * 100)}%</span>
          <span
            className={`rounded-md px-2 py-0.5 ${set.topStable ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-300/15 text-amber-200'}`}
            title={`Effects recalculated with traffic and industrial sources ±${Math.round(set.uncertainty * 100)}%`}
          >
            {set.topStable ? 'Top action is robust' : 'Ranking sensitive to uncertainty'}
          </span>
        </div>
      </div>

      {notice && (
        <p role="status" className={`mx-5 mb-2 text-[12.5px] font-medium ${notice.ok ? 'text-emerald-300' : 'text-accent-300'}`}>
          {notice.text}
        </p>
      )}

      <ol className="space-y-3 px-4 pb-4">
        {set.recommendations.map((r, i) => {
          const isActive = active?.id === r.result.id;
          const applied = isActive && draftName === r.result.params.name;
          const previewing = isActive && !applied;
          const e = r.effect;
          return (
            <li key={r.id} className={`rounded-xl p-4 ring-1 ring-inset transition-colors duration-150 ${isActive ? 'bg-accent-500/[0.06] ring-accent-400/45' : 'bg-ink-950 ring-sand-100/12'}`}>
              <div className="flex items-start gap-3">
                <span className={`num grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${i === 0 ? 'bg-accent-500 text-white' : 'bg-sand-100/[0.08] text-sand-200'}`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14.5px] font-semibold leading-snug text-sand-50">{r.name}</h3>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-sand-300">{r.measure}</p>
                </div>
                {(applied || previewing) && (
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${applied ? 'bg-accent-500 text-white' : 'bg-sand-100/[0.08] text-sand-200'}`}>
                    {applied ? 'Applied' : 'On map'}
                  </span>
                )}
              </div>

              <dl className="mt-3 grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
                <dt className="text-sand-400">Target</dt>
                <dd className="text-sand-100">{r.target}</dd>
                <dt className="text-sand-400">Why</dt>
                <dd className="space-y-0.5 text-sand-100">
                  {r.reasons.map((x) => (
                    <p key={x}>{x}</p>
                  ))}
                </dd>
                <dt className="text-sand-400">Effect</dt>
                <dd className="text-sand-100" title={`Modelled range with traffic and industrial sources ±${Math.round(set.uncertainty * 100)}%`}>
                  <DeltaText value={e.target} digits={digits} unit={` ${unit}`} /> in the zone
                  {e.targetPct != null && (
                    <>
                      {' '}
                      (<DeltaText value={e.targetPct} unit="%" />)
                    </>
                  )}
                  <span className="block text-[11.5px] text-sand-400">
                    Range {signed(e.high, digits)} to {signed(e.low, digits)}; city mean PM2.5 {signed(e.city, 2)}
                  </span>
                </dd>
                <dt className="text-sand-400">Cost</dt>
                <dd className="text-sand-100">{r.cost ? <span title="Plan-It cost model: one-time plus first-year running costs">{lakh(r.cost.total)}</span> : <span className="text-sand-400">Not costed</span>}</dd>
                <dt className="text-sand-400">Takes</dt>
                <dd className="text-sand-100">{r.timeframe}</dd>
              </dl>
              {r.limitations.length > 0 && <p className="mt-2 text-[11.5px] leading-snug text-sand-400">{r.limitations.join(' ')}</p>}

              <div className="mt-3.5 flex gap-2">
                <Button variant={applied ? 'default' : 'primary'} className="flex-1" onClick={() => apply(r)}>
                  {applied ? <Check size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />} {applied ? 'Applied' : 'Apply'}
                </Button>
                <Button className="flex-1" onClick={() => preview(r)}>
                  <Eye size={14} aria-hidden="true" /> Show on map
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      {set.excluded.length > 0 && (
        <details className="mx-5 mb-4 text-[12px] text-sand-400">
          <summary className="cursor-pointer font-medium text-sand-300 hover:text-sand-100">Not recommended here ({set.excluded.length})</summary>
          <ul className="mt-1.5 space-y-0.5">
            {set.excluded.map((x) => (
              <li key={x.name}>
                <span className="text-sand-200">{x.name}</span>: {x.reason}.
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="px-5 pb-6 text-[11.5px] text-sand-500">Effects are modelled estimates from the prototype What-If engine.</p>
    </>
  );
}
