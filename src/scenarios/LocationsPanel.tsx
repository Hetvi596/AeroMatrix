import { useMemo, useState } from 'react';
import { Eye, MousePointerClick, Trophy, Trash2 } from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import { Block, Button, DataBadge, Disclaimer, Empty, SectionHeader, Slider, Toggle } from '../components/ui';
import { assessLocations } from './locationComparison';
import type { IndustryCategory } from '../types';
import { fmt, fmtInt } from '../utils/format';

const CATEGORIES: IndustryCategory[] = ['Manufacturing', 'Chemical', 'Power', 'Metal', 'Processing'];

export function LocationsPanel() {
  const base = useTwin((s) => s.base)!;
  const candidates = useTwin((s) => s.candidates);
  const clear = useTwin((s) => s.clearCandidates);
  const interaction = useTwin((s) => s.interaction);
  const setInteraction = useTwin((s) => s.setInteraction);
  const applyResult = useTwin((s) => s.applyResult);
  const addCandidate = useTwin((s) => s.addCandidate);
  const [category, setCategory] = useState<IndustryCategory>('Manufacturing');
  const [intensity, setIntensity] = useState(70);
  const [buffer, setBuffer] = useState(false);

  const rows = useMemo(
    () => assessLocations(base, candidates, category, intensity, { greenBuffer: buffer }),
    [base, candidates, category, intensity, buffer],
  );
  const valid = rows.filter((r) => !r.outOfArea);
  const best = valid.length > 1 ? valid.reduce((a, b) => (a.riskScore < b.riskScore ? a : b)) : null;

  const metrics: [string, (r: (typeof rows)[number]) => string, boolean?][] = [
    ['Host zone', (r) => r.hostCellId ?? 'outside'],
    ['Δ mean PM2.5', (r) => fmt(r.meanDelta, 2)],
    ['Max local Δ', (r) => fmt(r.maxDelta, 1)],
    ['Affected zones', (r) => String(r.affectedZones)],
    ['Pop. in worsened zones', (r) => `${fmtInt(r.exposedPopulation / 1000)}k`],
    ['Host traffic', (r) => fmt(r.hostTraffic, 0)],
    ['Host green cover', (r) => `${fmt(r.hostGreenCover, 0)}%`],
    ['Building density', (r) => `${fmt(r.hostBuildingDensity * 100, 0)}%`],
    ['Nearest industry', (r) => `${fmt(r.nearestIndustryKm, 1)} km`],
    ['Env. risk score', (r) => (r.outOfArea ? '—' : fmt(r.riskScore, 0)), true],
  ];

  return (
    <>
      <SectionHeader title="Site comparison" subtitle="Compare candidate locations for a proposed industry" right={<DataBadge status="MODELED_SCENARIO" />} />
      <Block title="Proposed project">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as IndustryCategory)}
          className="w-full rounded bg-ink-800 px-2 py-1.5 text-[12px] text-slate-200 ring-1 ring-ink-600"
        >
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <Slider label="Emission intensity" value={intensity} min={5} max={100} step={1} onChange={setIntensity} />
        <Toggle checked={buffer} onChange={setBuffer} label="Include green buffer" />
      </Block>
      <Block title={`Candidate sites (${candidates.length}/5)`}>
        <div className="flex gap-1.5">
          <Button
            variant={interaction === 'pick-candidate' ? 'primary' : 'default'}
            className="flex-1"
            onClick={() => setInteraction(interaction === 'pick-candidate' ? 'select' : 'pick-candidate')}
          >
            <MousePointerClick size={13} /> {interaction === 'pick-candidate' ? 'Picking on map…' : 'Pick on map'}
          </Button>
          <Button
            onClick={() => {
              clear();
              [
                [73.835, 18.585],
                [73.955, 18.462],
                [73.79, 18.47],
              ].forEach((p) => addCandidate(p as [number, number]));
            }}
          >
            Example A–C
          </Button>
          {candidates.length > 0 && (
            <Button variant="ghost" onClick={clear}>
              <Trash2 size={13} />
            </Button>
          )}
        </div>
      </Block>

      {rows.length === 0 ? (
        <Block>
          <Empty>Click on the 3D map to drop up to five candidate sites, or load the example.</Empty>
        </Block>
      ) : (
        <Block title="Assessment">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-slate-400">
                  <th className="py-1 text-left font-medium">Metric</th>
                  {rows.map((r) => (
                    <th key={r.candidate.id} className="px-1 text-right font-semibold">
                      <span className={best?.candidate.id === r.candidate.id ? 'text-emerald-300' : 'text-violet-300'}>
                        {best?.candidate.id === r.candidate.id && <Trophy size={10} className="-mt-0.5 mr-0.5 inline" />}
                        {r.candidate.id}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="num">
                {metrics.map(([label, f, strong]) => (
                  <tr key={label} className="border-t border-ink-800">
                    <td className="py-1 text-slate-400">{label}</td>
                    {rows.map((r) => (
                      <td key={r.candidate.id} className={`px-1 text-right ${strong ? 'font-semibold text-slate-100' : 'text-slate-300'}`}>
                        {f(r)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-ink-800">
                  <td className="py-1 text-slate-400">Map</td>
                  {rows.map((r) => (
                    <td key={r.candidate.id} className="px-1 text-right">
                      <button disabled={!r.result} onClick={() => r.result && applyResult(r.result)} className="text-cyan-400 hover:text-cyan-200 disabled:opacity-30" title="Show scenario on map">
                        <Eye size={13} />
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {best && (
            <div className="mt-2 rounded-md bg-emerald-500/10 px-2.5 py-2 text-[11.5px] text-emerald-200 ring-1 ring-inset ring-emerald-400/20">
              Site {best.candidate.id} has the lowest composite demo risk score ({fmt(best.riskScore, 0)}).
            </div>
          )}
        </Block>
      )}
      <Block>
        <Disclaimer>
          Score = 35% population in worsened zones + 25% max local Δ + 15% mean Δ + 15% host green cover + 10% building density (normalised
          across candidates). Demo rules only — to be replaced by a trained geospatial / ML suitability model.
        </Disclaimer>
      </Block>
    </>
  );
}
