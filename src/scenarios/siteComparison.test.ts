// Sites: individual removal keeps the other sites, and the comparison explains the real ranking.

import { beforeEach, describe, expect, it } from 'vitest';
import { getDemoBaseState } from '../data/demo/demoDataProvider';
import { useTwin } from '../store/useTwinStore';
import { assessLocations, compareSites } from './locationComparison';
import type { CandidateLocation, LonLat } from '../types';

const base = getDemoBaseState(10);
const SITES: LonLat[] = [
  [73.835, 18.585],
  [73.955, 18.462],
  [73.79, 18.47],
];
const st = () => useTwin.getState();

describe('site removal', () => {
  beforeEach(async () => {
    await st().init(10);
    st().clearCandidates();
    SITES.forEach((p) => st().addCandidate(p));
  });

  it('removes one site and keeps the others with their letters', () => {
    st().selectCandidate('B');
    st().removeCandidate('B');
    expect(st().candidates.map((c) => c.id)).toEqual(['A', 'C']);
    expect(st().selectedCandidateId).toBeNull();
    st().addCandidate([73.86, 18.52]);
    expect(st().candidates.map((c) => c.id)).toEqual(['A', 'C', 'B']);
  });

  it('keeps the selection when another site is removed, and handles removing all', () => {
    st().selectCandidate('A');
    st().removeCandidate('C');
    expect(st().selectedCandidateId).toBe('A');
    st().removeCandidate('A');
    st().removeCandidate('B');
    expect(st().candidates).toEqual([]);
    expect(st().selectedCandidateId).toBeNull();
  });
});

describe('site comparison', () => {
  const candidates: CandidateLocation[] = SITES.map((location, i) => ({ id: 'ABC'[i], location }));
  const rows = assessLocations(base, candidates, 'Chemical', 70);

  it('prefers the lowest risk score and lists every site', () => {
    const c = compareSites(rows);
    const best = [...rows].filter((r) => !r.outOfArea).sort((a, b) => a.riskScore - b.riskScore)[0];
    expect(c.preferred).toBe(best.candidate.id);
    expect(c.sites.map((s) => s.candidate.id)[0]).toBe(best.candidate.id);
    expect(c.criteria.find((x) => x.key === 'riskScore')!.values).toEqual(c.sites.map((s) => s.riskScore));
    expect(c.summary).toContain(`Site ${best.candidate.id} ranks first`);
  });

  it('explains with the sites’ own numbers', () => {
    const c = compareSites(rows);
    expect(c.advantages.length + c.disadvantages.length).toBeGreaterThan(0);
    for (const t of [...c.advantages, ...c.disadvantages]) {
      expect(t).toMatch(/\d/);
      const [, x, y] = t.match(/\(([^ ]+) vs ([^)]+)\)/)!;
      expect(x).not.toBe(y); // never claims a difference that rounds away
    }
  });

  it('marks missing data instead of inventing it', () => {
    const c = compareSites(rows, { A: 40.2 });
    const cur = c.criteria.find((x) => x.key === 'currentPm25')!;
    expect(cur.weight).toBeNull();
    expect(cur.values.filter((v) => v == null).length).toBe(2);
    expect(c.unavailable.join(' ')).toMatch(/Current PM2\.5/);
  });

  it('reports out-of-area sites and needs two assessable sites to rank', () => {
    const out = assessLocations(base, [{ id: 'A', location: SITES[0] }, { id: 'B', location: [72.5, 19.5] }], 'Chemical', 70);
    const c = compareSites(out);
    expect(c.unavailable.join(' ')).toMatch(/Site B is outside/);
    expect(c.summary).toMatch(/Add another site/);
  });
});
