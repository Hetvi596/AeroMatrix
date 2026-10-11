import { useMemo, useState } from 'react';
import { Columns3, MousePointerClick, Trash2, X } from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import { Button, Empty, SectionHeader, Slider, Toggle } from '../components/ui';
import { compareSites, scoreBreakdown, type LocationAssessment } from './locationComparison';
import { zoneRecord } from '../services/liveData';
import { useSiteAssessment } from './useSiteAssessment';
import type { IndustryCategory, LonLat } from '../types';
import { fmt } from '../utils/format';
import { zonePlaceNames } from '../utils/zones';
import { candidatePoint } from '../services/industryData';

const CATEGORIES: IndustryCategory[] = ['Manufacturing', 'Chemical', 'Power', 'Metal', 'Processing'];
const EXAMPLE_SITES: LonLat[] = [
  [73.835, 18.585],
  [73.955, 18.462],
  [73.79, 18.47],
];

export function LocationsPanel() {
  const base = useTwin((s) => s.base)!;
  // Extent of the analysis grid: estates are placed at a point of the estate inside it.
  const gridBox = useMemo(() => {
    if (!base.cells.length) return null;
    const b = base.cells.map((c) => c.bounds);
    return { west: Math.min(...b.map((x) => x.west)), south: Math.min(...b.map((x) => x.south)), east: Math.max(...b.map((x) => x.east)), north: Math.max(...b.map((x) => x.north)) };
  }, [base]);
  const candidates = useTwin((s) => s.candidates);
  const clear = useTwin((s) => s.clearCandidates);
  const interaction = useTwin((s) => s.interaction);
  const setInteraction = useTwin((s) => s.setInteraction);
  const addCandidate = useTwin((s) => s.addCandidate);
  const project = useTwin((s) => s.siteProject);
  const setProject = useTwin((s) => s.setSiteProject);
  const selected = useTwin((s) => s.selectedCandidateId);
  const selectCandidate = useTwin((s) => s.selectCandidate);
  const flyTo = useTwin((s) => s.requestFlyTo);
  const { rows, valid } = useSiteAssessment();
  const industry = useTwin((s) => s.industry);
  const places = zonePlaceNames(base.cells);
  const picking = interaction === 'pick-candidate';
  const removeCandidate = useTwin((s) => s.removeCandidate);
  const live = useTwin((s) => s.live);
  const [comparing, setComparing] = useState(false);
  const comparison = useMemo(() => {
    const current = Object.fromEntries(rows.map((r) => [r.candidate.id, r.hostCellId ? zoneRecord({ base, live }, r.hostCellId, 'pm25').value : null]));
    return compareSites(rows, current);
  }, [rows, base, live]);

  return (
    <>
      <SectionHeader title="Sites" subtitle="Compare candidate locations for a proposed industry" />

      <section className="border-t hairline px-5 py-4">
        <h3 className="mb-2 text-[13px] font-semibold text-sand-200">Proposed industry</h3>
        <label className="flex items-center justify-between gap-3 py-1 text-[12.5px] text-sand-200">
          Category
          <select
            value={project.category}
            onChange={(e) => setProject({ category: e.target.value as IndustryCategory })}
            className="min-w-[150px] cursor-pointer rounded-lg bg-ink-950 px-2.5 py-1.5 text-[12.5px] text-sand-100 ring-1 ring-inset ring-sand-100/15 outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <Slider label="Emission intensity" value={project.intensity} min={5} max={100} step={1} onChange={(v) => setProject({ intensity: v })} />
        <Toggle checked={project.greenBuffer} onChange={(v) => setProject({ greenBuffer: v })} label="Include a green buffer" />
      </section>

      <section className="border-t hairline px-5 py-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-[13px] font-semibold text-sand-200">Candidates</h3>
          <span className="num text-[12px] text-sand-400">{candidates.length} of 5</span>
        </div>
        <div className="flex gap-2">
          <Button variant={picking ? 'primary' : 'default'} className="flex-1" onClick={() => setInteraction(picking ? 'select' : 'pick-candidate')}>
            <MousePointerClick size={14} aria-hidden="true" /> {picking ? 'Click the map…' : 'Pick on map'}
          </Button>
          <Button
            onClick={() => {
              clear();
              EXAMPLE_SITES.forEach((p) => addCandidate(p));
            }}
          >
            Example sites
          </Button>
          {candidates.length > 0 && (
            <Button variant="ghost" onClick={clear} title="Remove all sites" className="!px-2">
              <Trash2 size={14} aria-label="Remove all sites" />
            </Button>
          )}
        </div>
      </section>

      {industry && (
        <section className="border-t hairline px-5 py-4">
          <label className="block text-[12.5px] text-sand-300">
            Add an MIDC estate as a candidate
            <select
              value=""
              onChange={(e) => {
                const a = industry.areas.find((x) => x.code === Number(e.target.value));
                if (a) addCandidate((gridBox && candidatePoint(a, gridBox)) || a.centroid);
              }}
              className="mt-1 w-full cursor-pointer rounded-lg bg-ink-950 px-2.5 py-1.5 text-[12.5px] text-sand-100 ring-1 ring-inset ring-sand-100/15 outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              <option value="" disabled>
                Choose an estate…
              </option>
              {[...industry.areas]
                .sort((a, b) => Number(a.analysisArea === 'outside') - Number(b.analysisArea === 'outside') || a.name.localeCompare(b.name))
                .map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.name}
                    {a.analysisArea === 'outside' || (gridBox && !candidatePoint(a, gridBox)) ? ' (outside map area)' : ''}
                  </option>
                ))}
            </select>
          </label>

        </section>
      )}

      <section className="border-t hairline px-4 pb-5 pt-4">
        {rows.length === 0 ? (
          <Empty>Click the map to drop up to five candidate sites, or load the example sites.</Empty>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <div>
                <h3 className="text-[13px] font-semibold text-sand-200">Ranking</h3>
                <span className="text-[11.5px] text-sand-500">Risk score, lower is better</span>
              </div>
              <Button variant={comparing ? 'primary' : 'default'} disabled={valid.length < 2} onClick={() => setComparing(!comparing)} title={valid.length < 2 ? 'Add at least two sites inside the analysis area' : 'Compare the sites side by side'}>
                <Columns3 size={14} aria-hidden="true" /> {comparing ? 'Hide comparison' : 'Compare'}
              </Button>
            </div>
            {comparing && valid.length >= 2 && <ComparisonTable comparison={comparison} onClose={() => setComparing(false)} />}
            <ol className="space-y-2">
              {rows.map((r) => {
                const active = selected === r.candidate.id;
                const parts = r.outOfArea ? [] : scoreBreakdown(r, valid);
                const top = parts.length ? parts.reduce((a, b) => (b.points > a.points ? b : a)) : null;
                const why = r.outOfArea
                  ? 'Outside the analysis area, so it cannot be assessed.'
                  : r.rank === 1 && valid.length > 1
                    ? `Lowest combined risk. Main factor: ${top!.label}.`
                    : `Main factor: ${top!.label}.`;
                const place = r.hostCellId ? places.get(r.hostCellId) : undefined;
                return (
                  <li key={r.candidate.id} className="relative">
                    <button
                      type="button"
                      onClick={() => removeCandidate(r.candidate.id)}
                      aria-label={`Remove site ${r.candidate.id}`}
                      title={`Remove site ${r.candidate.id}`}
                      className="absolute right-2 top-2 z-[1] grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-sand-400 transition-colors hover:bg-accent-500/10 hover:text-accent-300"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        selectCandidate(r.candidate.id);
                        flyTo(r.candidate.location, 5000, -40);
                      }}
                      className={`w-full cursor-pointer rounded-xl p-3 text-left ring-1 ring-inset transition-colors duration-150 ${
                        active ? 'bg-accent-500/[0.07] ring-accent-400/50' : 'bg-ink-950 ring-sand-100/12 hover:ring-sand-100/25'
                      } ${r.outOfArea ? 'opacity-70' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`num grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12.5px] font-semibold ${
                            r.rank === 1 && valid.length > 1 ? 'bg-accent-500 text-white' : 'bg-sand-100/[0.08] text-sand-200'
                          }`}
                        >
                          {r.rank ?? '–'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="pr-1 text-[14px] font-semibold text-sand-50">Site {r.candidate.id}</div>
                          <div className="truncate text-[12px] text-sand-400">
                            {r.hostCellId ? `Zone ${r.hostCellId}${place ? `, ${place}` : ''}` : 'Outside the grid'}
                          </div>
                        </div>
                        {!r.outOfArea && (
                          <div className="mr-8 text-right">
                            <div className="num text-[19px] font-semibold leading-none text-sand-50">{fmt(r.riskScore, 0)}</div>
                            <div className="text-[11px] text-sand-500">score</div>
                          </div>
                        )}
                      </div>
                      {!r.outOfArea && (
                        <div className="mt-2.5 grid grid-cols-2 gap-2 text-[12px]">
                          <div>
                            <div className="text-sand-400">Max local Δ PM2.5</div>
                            <div className="num font-semibold text-sand-100">+{fmt(r.maxDelta, 1)} µg/m³</div>
                          </div>
                          <div>
                            <div className="text-sand-400">Zones affected</div>
                            <div className="num font-semibold text-sand-100">{r.affectedZones}</div>
                          </div>
                        </div>
                      )}
                      <p className="mt-2 text-[12px] leading-snug text-sand-300">{why}</p>
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>
    </>
  );
}

/** Sites side by side: the score, what makes it up, and context rows, with a plain-English verdict. */
function ComparisonTable({ comparison: c, onClose }: { comparison: ReturnType<typeof compareSites>; onClose: () => void }) {
  const best = (vals: (number | null)[], lowerIsBetter: boolean) => {
    const xs = vals.filter((v): v is number => v != null);
    if (xs.length < 2 || Math.max(...xs) - Math.min(...xs) < 1e-9) return null;
    return lowerIsBetter ? Math.min(...xs) : Math.max(...xs);
  };
  const head = (s: LocationAssessment) => (
    <th key={s.candidate.id} className={`px-2 py-1.5 text-right font-semibold ${s.candidate.id === c.preferred ? 'text-accent-300' : 'text-sand-100'}`}>
      Site {s.candidate.id}
      {s.candidate.id === c.preferred && <span className="block text-[10.5px] font-medium text-accent-300">Preferred</span>}
    </th>
  );
  return (
    <section aria-label="Site comparison" className="mb-3 rounded-xl bg-ink-950 p-3 ring-1 ring-inset ring-accent-400/30">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-[12.5px] leading-snug text-sand-100">{c.summary}</p>
        <button type="button" onClick={onClose} aria-label="Close comparison" className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded text-sand-400 hover:text-sand-100">
          <X size={13} aria-hidden="true" />
        </button>
      </div>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[280px] text-[12px]">
          <thead className="border-b hairline">
            <tr>
              <th className="py-1.5 pl-1 text-left font-medium text-sand-400">Criterion</th>
              {c.sites.map(head)}
            </tr>
          </thead>
          <tbody>
            {c.criteria.map((k) => {
              const b = best(k.values, k.lowerIsBetter);
              return (
                <tr key={k.key} className={`border-b hairline last:border-0 ${k.key === 'riskScore' ? 'font-semibold' : ''}`}>
                  <td className="py-1.5 pl-1 pr-2 text-sand-300">
                    {k.label}
                    {k.weight != null && <span className="ml-1 text-[10.5px] text-sand-500">{Math.round(k.weight * 100)}%</span>}
                  </td>
                  {k.values.map((v, i) => (
                    <td key={c.sites[i].candidate.id} className={`num px-2 py-1.5 text-right ${v != null && b != null && Math.abs(v - b) < 1e-9 ? 'text-emerald-300' : 'text-sand-100'}`}>
                      {v == null ? <span className="text-sand-500" title="Not available">—</span> : k.format(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {c.advantages.length > 0 && (
        <div className="mt-2.5 text-[12px]">
          <div className="font-semibold text-sand-200">Advantages of Site {c.preferred}</div>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-sand-300">
            {c.advantages.map((t) => (
              <li key={t}>{t[0].toUpperCase() + t.slice(1)}.</li>
            ))}
          </ul>
        </div>
      )}
      {c.disadvantages.length > 0 && (
        <div className="mt-2 text-[12px]">
          <div className="font-semibold text-sand-200">Trade-offs</div>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-sand-300">
            {c.disadvantages.map((t) => (
              <li key={t}>{t[0].toUpperCase() + t.slice(1)}.</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-[11px] leading-snug text-sand-500">
        Percentages are each criterion’s weight in the risk score; rows without one are context. Green marks the best value.
        {c.unavailable.length ? ` ${c.unavailable.join(' ')}` : ''}
      </p>
    </section>
  );
}
