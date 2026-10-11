// Live What-If: re-run the scenario shortly after the draft parameters change, so the
// map, heatmap, legend, charts and summary cards follow the controls without a button.
// The engine runs synchronously in the browser (no network), so "latest wins" is
// guaranteed by the debounce: only the last change in a burst is evaluated.

import { useTwin } from '../store/useTwinStore';
import { defaultParams } from '../services/scenarioService';
import type { ScenarioParams } from '../types';

export const LIVE_DEBOUNCE_MS = 200;

/** Parameters compared without the display name (runDraft may assign one). */
export function paramsKey(p: ScenarioParams): string {
  return JSON.stringify({ ...p, name: '' });
}

/** Brings the active scenario in line with the draft. Exposed for tests. */
export function syncScenarioToDraft(): void {
  const s = useTwin.getState();
  if (!s.base || !s.draft) return;
  const key = paramsKey(s.draft);
  if (key === paramsKey(defaultParams(s.base))) {
    // Every parameter is back at baseline: show the baseline, not a zero-change scenario.
    if (s.activeResult) s.clearResult();
    return;
  }
  if (s.activeResult && paramsKey(s.activeResult.params) === key) return;
  s.runDraft();
}

export function startLiveScenario(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = useTwin.subscribe((s, prev) => {
    if (s.draft === prev.draft || !s.liveScenario) return;
    clearTimeout(timer);
    timer = setTimeout(syncScenarioToDraft, LIVE_DEBOUNCE_MS);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
