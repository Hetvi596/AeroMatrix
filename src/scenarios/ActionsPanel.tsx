import { useMemo, useState } from 'react';
import { Check, Eye, Play, Save } from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import { Button, DeltaText, SectionHeader } from '../components/ui';
import { evaluateActions } from './actions';
import { explainAction } from './actionInsights';
import { fmt } from '../utils/format';
import type { BaseState, ScenarioResult } from '../types';

// Results are cached per base state so ids stay stable when the screen is revisited —
// that keeps the Applied / Previewing / Saved states truthful.
const evaluated = new WeakMap<BaseState, ReturnType<typeof evaluateActions>>();
function actionsFor(base: BaseState) {
  let rows = evaluated.get(base);
  if (!rows) {
    rows = evaluateActions(base);
    evaluated.set(base, rows);
  }
  return rows;
}

export function ActionsPanel() {
  const base = useTwin((s) => s.base)!;
  const baseline = useTwin((s) => s.baseline);
  const active = useTwin((s) => s.activeResult);
  const draftName = useTwin((s) => s.draft?.name);
  const saved = useTwin((s) => s.saved);
  const applyResult = useTwin((s) => s.applyResult);
  const saveActive = useTwin((s) => s.saveActive);
  const updateDraft = useTwin((s) => s.updateDraft);
  const setDisplayMode = useTwin((s) => s.setDisplayMode);
  const setRightOpen = useTwin((s) => s.setRightOpen);
  const selectCell = useTwin((s) => s.selectCell);
  const selectIndustry = useTwin((s) => s.selectIndustry);
  const selectCandidate = useTwin((s) => s.selectCandidate);
  const flyTo = useTwin((s) => s.requestFlyTo);
  const [notice, setNotice] = useState('');

  const ranked = useMemo(
    () =>
      actionsFor(base)
        .map((row) => ({ ...row, insight: explainAction(row.action.id, base, baseline, row.result.params) }))
        .sort((a, b) => a.result.summary.meanDelta - b.result.summary.meanDelta),
    [base, baseline],
  );

  // Show the scenario summary rather than an unrelated selection.
  const showSummary = () => {
    selectCell(null);
    selectIndustry(null);
    selectCandidate(null);
    setRightOpen(true);
  };

  /** Preview: put the modeled change on the map without touching the What-If draft. */
  const preview = (result: ScenarioResult, focus: (typeof ranked)[number]['insight']['focus']) => {
    applyResult(result);
    setDisplayMode('delta');
    showSummary();
    if (focus) flyTo(focus.lonlat, focus.range, -45);
    setNotice(`Previewing ${result.params.name.replace(/^Action: /, '')} as a modeled change on the map.`);
  };

  /** Apply: make it the active scenario and load its parameters into What-If to build on. */
  const apply = (result: ScenarioResult) => {
    updateDraft({ ...result.params });
    applyResult(result);
    showSummary();
    setNotice(`Applied ${result.params.name.replace(/^Action: /, '')}. The map shows the modeled scenario; adjust it further in What-If.`);
  };

  const save = (result: ScenarioResult) => {
    applyResult(result);
    saveActive();
    setNotice(`Saved ${result.params.name.replace(/^Action: /, '')}.`);
  };

  return (
    <>
      <SectionHeader title="Actions" subtitle="Ranked by modeled change in mean PM2.5" />
      <p className="sr-only" role="status" aria-live="polite">
        {notice}
      </p>
      <ol className="space-y-3 px-4 pb-5">
        {ranked.map(({ action, implementation, result, insight }, i) => {
          const isActive = active?.id === result.id;
          const applied = isActive && draftName === result.params.name;
          const previewing = isActive && !applied;
          const isSaved = saved.some((s) => s.id === result.id || s.params.name === result.params.name);
          const s = result.summary;
          const reduces = s.meanDelta < -0.005;
          return (
            <li
              key={action.id}
              className={`rounded-xl p-4 ring-1 ring-inset transition-colors duration-150 ${
                isActive ? 'bg-accent-500/[0.06] ring-accent-400/45' : 'bg-ink-950 ring-sand-100/12'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sand-100/[0.08] text-[12px] font-semibold text-sand-200">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14.5px] font-semibold leading-snug text-sand-50">{action.name}</h3>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-sand-300">{implementation}</p>
                </div>
                {(applied || previewing) && (
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${applied ? 'bg-accent-500 text-white' : 'bg-sand-100/[0.08] text-sand-200'}`}>
                    {applied ? 'Applied' : 'Previewing'}
                  </span>
                )}
              </div>

              <dl className="mt-3 grid grid-cols-[76px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
                <dt className="text-sand-400">Target</dt>
                <dd className="text-sand-100">{insight.target}</dd>
                {insight.reason && (
                  <>
                    <dt className="text-sand-400">Why</dt>
                    <dd className="text-sand-100">{insight.reason}</dd>
                  </>
                )}
                <dt className="text-sand-400">Effect</dt>
                <dd className="text-sand-100">
                  {reduces ? (
                    <>
                      Mean PM2.5 <DeltaText value={s.meanDelta} digits={2} unit=" µg/m³" /> (<DeltaText value={s.meanDeltaPct} unit="%" />)
                      {s.highRiskScenario !== s.highRiskBaseline && (
                        <span className="block text-sand-300">
                          High-risk zones {s.highRiskBaseline} → {s.highRiskScenario}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-sand-300">No modeled reduction ({fmt(s.meanDelta, 2)} µg/m³)</span>
                  )}
                </dd>
              </dl>

              <div className="mt-3.5 flex flex-wrap gap-2">
                <Button variant={applied ? 'default' : 'primary'} className="flex-1" onClick={() => apply(result)}>
                  {applied ? <Check size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />} {applied ? 'Applied' : 'Apply'}
                </Button>
                <Button className="flex-1" onClick={() => preview(result, insight.focus)}>
                  <Eye size={14} aria-hidden="true" /> Show on map
                </Button>
                <Button variant="ghost" disabled={isSaved} onClick={() => save(result)} title={isSaved ? 'Already saved' : 'Save as a scenario'}>
                  {isSaved ? <Check size={14} aria-hidden="true" /> : <Save size={14} aria-hidden="true" />} {isSaved ? 'Saved' : 'Save'}
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="px-5 pb-6 text-[11.5px] leading-relaxed text-sand-500">
        Effects come from the uncalibrated prototype model on demo inputs and are relative, not forecasts.
      </p>
    </>
  );
}
