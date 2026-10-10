import { MousePointerClick, Trash2 } from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import { Button, Empty, SectionHeader, Slider, Toggle } from '../components/ui';
import { scoreBreakdown } from './locationComparison';
import { useSiteAssessment } from './useSiteAssessment';
import type { IndustryCategory, LonLat } from '../types';
import { fmt } from '../utils/format';
import { zonePlaceNames } from '../utils/zones';

const CATEGORIES: IndustryCategory[] = ['Manufacturing', 'Chemical', 'Power', 'Metal', 'Processing'];
const EXAMPLE_SITES: LonLat[] = [
  [73.835, 18.585],
  [73.955, 18.462],
  [73.79, 18.47],
];

export function LocationsPanel() {
  const base = useTwin((s) => s.base)!;
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
  const places = zonePlaceNames(base.cells);
  const picking = interaction === 'pick-candidate';

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
            <Button variant="ghost" onClick={clear} title="Remove all candidates" className="!px-2">
              <Trash2 size={14} aria-label="Remove all candidates" />
            </Button>
          )}
        </div>
      </section>

      <section className="border-t hairline px-4 pb-5 pt-4">
        {rows.length === 0 ? (
          <Empty>Click the map to drop up to five candidate sites, or load the example sites.</Empty>
        ) : (
          <>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h3 className="text-[13px] font-semibold text-sand-200">Ranking</h3>
              <span className="text-[11.5px] text-sand-500" title="Composite environmental risk score, 0–100. Lower is better.">
                Risk score, lower is better
              </span>
            </div>
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
                  <li key={r.candidate.id}>
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
                          <div className="text-[14px] font-semibold text-sand-50">Site {r.candidate.id}</div>
                          <div className="truncate text-[12px] text-sand-400">
                            {r.hostCellId ? `Zone ${r.hostCellId}${place ? `, ${place}` : ''}` : 'Outside the grid'}
                          </div>
                        </div>
                        {!r.outOfArea && (
                          <div className="text-right">
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
