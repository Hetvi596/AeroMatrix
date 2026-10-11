// A What-If scenario applied to current data: the same relative-change approach the
// region scenario uses for the trained-model baseline. The prototype engine supplies
// scenario / baseline for a zone and pollutant; the current value is scaled by it.
// The result is a hypothetical estimate and is always shown beside, never instead of,
// the current value.

/** Engine scenario ÷ engine baseline, or null when it can't be formed. */
export function scenarioOnCurrent(engineBaseline: number | undefined, engineScenario: number | undefined): number | null {
  if (engineBaseline == null || engineScenario == null) return null;
  if (!Number.isFinite(engineBaseline) || !Number.isFinite(engineScenario) || engineBaseline <= 0) return null;
  return engineScenario / engineBaseline;
}
