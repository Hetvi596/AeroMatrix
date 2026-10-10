import { useTwin } from '../store/useTwinStore';
import { assessLocations, type LocationAssessment } from './locationComparison';
import type { BaseState, CandidateLocation } from '../types';
import type { SiteProject } from '../store/useTwinStore';

export interface RankedSite extends LocationAssessment {
  /** 1 = lowest composite risk; null when the site is outside the analysis area. */
  rank: number | null;
}

interface Assessment {
  rows: RankedSite[];
  valid: LocationAssessment[];
}

// One shared result for the Sites screen and the details drawer, so both refer to the
// same scenario objects (ids) — "Show impact" state stays consistent between them.
let last: { base: BaseState; candidates: CandidateLocation[]; project: SiteProject; value: Assessment } | null = null;

function assess(base: BaseState, candidates: CandidateLocation[], project: SiteProject): Assessment {
  if (last && last.base === base && last.candidates === candidates && last.project === project) return last.value;
  const all = assessLocations(base, candidates, project.category, project.intensity, { greenBuffer: project.greenBuffer });
  const valid = all.filter((r) => !r.outOfArea);
  const order = [...valid].sort((a, b) => a.riskScore - b.riskScore);
  const rows = all
    .map((r) => ({ ...r, rank: r.outOfArea ? null : order.indexOf(r) + 1 }))
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  last = { base, candidates, project, value: { rows, valid } };
  return last.value;
}

const EMPTY: Assessment = { rows: [], valid: [] };

/** Candidate-site assessment shared by the Sites screen and its details drawer. */
export function useSiteAssessment(): Assessment {
  const base = useTwin((s) => s.base);
  const candidates = useTwin((s) => s.candidates);
  const project = useTwin((s) => s.siteProject);
  return base ? assess(base, candidates, project) : EMPTY;
}
