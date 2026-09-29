import { MapPin, Save, Trash2, X, Crosshair, Factory, Play } from 'lucide-react';
import { useState } from 'react';
import { useTwin } from '../store/useTwinStore';
import { Block, Button, DataBadge, DeltaText, Disclaimer, SectionHeader, Slider, Stat } from './ui';
import { POLLUTANT_LABEL, POLLUTANT_UNIT, RISK_COLOR, RISK_LABEL } from '../utils/colors';
import { fmt, fmtInt } from '../utils/format';
import { haversineKm } from '../utils/geo';
import { SourceDonut } from '../analytics/SourceDonut';
import type { Pollutant } from '../types';
import { POLLUTANTS } from '../services/pollutionModel';

function ScenarioSummaryCard() {
  const r = useTwin((s) => s.activeResult)!;
  const saved = useTwin((s) => s.saved);
  const save = useTwin((s) => s.saveActive);
  const clear = useTwin((s) => s.clearResult);
  const mode = useTwin((s) => s.displayMode);
  const setMode = useTwin((s) => s.setDisplayMode);
  const [name, setName] = useState(r.params.name);
  const isSaved = saved.some((s) => s.id === r.id);
  const s = r.summary;
  return (
    <div className="border-b border-amber-400/20 bg-amber-500/[0.04]">
      <div className="flex items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.12em] text-amber-300/80">Active scenario</div>
          <div className="truncate text-[13px] font-semibold text-slate-100">{r.params.name}</div>
        </div>
        <div className="flex items-center gap-1">
          <DataBadge status="MODELED_SCENARIO" />
          <button onClick={clear} className="rounded p-0.5 text-slate-500 hover:text-slate-200" title="Clear scenario">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="text-[10.5px] text-slate-400">Mean PM2.5 across analysis area</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="num text-[15px] text-slate-400">{fmt(s.meanBaseline)}</span>
          <span className="text-slate-600">→</span>
          <span className="num text-2xl font-semibold text-slate-100">{fmt(s.meanScenario)}</span>
          <span className="text-[10.5px] text-slate-500">µg/m³</span>
        </div>
        <div className="mt-0.5 text-[12.5px]">
          <DeltaText value={s.meanDelta} /> <span className="text-slate-600">·</span> <DeltaText value={s.meanDeltaPct} unit="%" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Affected zones" value={s.affectedCount} />
          <Stat label="Max increase" value={<DeltaText value={s.maxIncrease} />} />
          <Stat label="Max decrease" value={<DeltaText value={s.maxDecrease} />} />
          <Stat label="High-risk zones" value={`${s.highRiskBaseline}→${s.highRiskScenario}`} />
          <Stat label="Pop. in worsened zones" value={fmtInt(s.exposedPopulation)} sub="demo" />
        </div>
        <div className="mt-3 flex gap-1.5">
          <Button variant={mode === 'scenario' ? 'primary' : 'default'} onClick={() => setMode('scenario')} className="flex-1">Scenario map</Button>
          <Button variant={mode === 'delta' ? 'primary' : 'default'} onClick={() => setMode('delta')} className="flex-1">Δ map</Button>
          <Button variant={mode === 'baseline' ? 'primary' : 'default'} onClick={() => setMode('baseline')} className="flex-1">Baseline</Button>
        </div>
        {!isSaved ? (
          <div className="mt-2 flex gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-0 flex-1 rounded-md bg-ink-800 px-2 py-1 text-[12px] text-slate-200 ring-1 ring-inset ring-ink-600 outline-none focus:ring-cyan-500"
            />
            <Button onClick={() => save(name)}>
              <Save size={13} /> Save
            </Button>
          </div>
        ) : (
          <div className="mt-2 text-[11px] text-emerald-300">✓ Saved — compare it in Scenarios</div>
        )}
        <Disclaimer>{r.metadata.disclaimer}</Disclaimer>
      </div>
    </div>
  );
}

function ZoneCard({ cellId }: { cellId: string }) {
  const base = useTwin((s) => s.base)!;
  const baseline = useTwin((s) => s.baseline);
  const result = useTwin((s) => s.activeResult);
  const mode = useTwin((s) => s.displayMode);
  const selectCell = useTwin((s) => s.selectCell);
  const toggleArea = useTwin((s) => s.toggleAreaCell);
  const inArea = useTwin((s) => s.draft?.targetCells.includes(cellId) ?? false);
  const flyTo = useTwin((s) => s.requestFlyTo);
  const selectIndustry = useTwin((s) => s.selectIndustry);
  const cell = base.cells.find((c) => c.id === cellId);
  const b = baseline.find((s) => s.cellId === cellId);
  if (!cell || !b) return null;
  const showScn = !!result && mode !== 'baseline';
  const sc = showScn ? result!.scenario.find((s) => s.cellId === cellId)! : null;
  const cur = sc ?? b;
  const d = showScn ? result!.delta[cellId] : null;
  const contrib = cur.contributionAbs;
  const total = contrib.traffic + contrib.industry + contrib.background + contrib.other;
  const nearby = base.industries
    .map((i) => ({ i, d: haversineKm(i.location, cell.center) }))
    .filter((x) => x.d < 4)
    .sort((a, b2) => a.d - b2.d);

  return (
    <>
      <div className="flex items-start justify-between gap-2 px-4 pt-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-cyan-300/80">Zone</div>
          <div className="font-mono text-lg font-semibold text-slate-100">{cell.id}</div>
          <div className="text-[11px] text-slate-400">
            {cell.landUse} · row {cell.row + 1}, col {cell.col + 1}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <DataBadge status={showScn ? 'MODELED_SCENARIO' : 'DEMO'} />
          <button onClick={() => selectCell(null)} className="rounded p-0.5 text-slate-500 hover:text-slate-200">
            <X size={14} />
          </button>
        </div>
      </div>
      <Block>
        <div className="flex items-end gap-3">
          <div>
            <div className="text-[10.5px] text-slate-400">PM2.5</div>
            <div className="num text-3xl font-semibold" style={{ color: RISK_COLOR[cur.risk] }}>
              {fmt(cur.pm25, 0)}
              <span className="ml-1 text-[11px] font-normal text-slate-500">µg/m³</span>
            </div>
          </div>
          <div className="pb-1">
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: RISK_COLOR[cur.risk], background: `${RISK_COLOR[cur.risk]}22` }}>
              {RISK_LABEL[cur.risk].toUpperCase()}
            </span>
          </div>
          {d && (
            <div className="ml-auto pb-1 text-right text-[11px]">
              <div className="text-slate-500">baseline {fmt(b.pm25, 0)}</div>
              <DeltaText value={d.pm25} /> <span className="text-slate-600">(</span>
              <DeltaText value={(d.pm25 / b.pm25) * 100} unit="%" />
              <span className="text-slate-600">)</span>
            </div>
          )}
        </div>
      </Block>
      <Block title="Source contribution" right={<span className="text-[9.5px] font-semibold tracking-wider text-fuchsia-300">DEMO SOURCE CONTRIBUTION</span>}>
        <SourceDonut value={contrib} size={104} />
        <div className="mt-2 grid grid-cols-2 gap-x-3 text-[10.5px] text-slate-500">
          <span>Traffic {fmt((contrib.traffic / total) * 100, 0)}%</span>
          <span>Industry {fmt((contrib.industry / total) * 100, 0)}%</span>
          <span>Weather multiplier ×{fmt(cur.windInfluence, 2)}</span>
          <span>Background {fmt((contrib.background / total) * 100, 0)}%</span>
        </div>
        <Disclaimer>Illustrative split from the prototype model — not a validated source apportionment.</Disclaimer>
      </Block>
      <Block title="Pollutants">
        <table className="w-full text-[11.5px]">
          <thead className="text-[10px] text-slate-500">
            <tr>
              <th className="text-left font-medium" />
              <th className="text-right font-medium">{showScn ? 'Baseline' : 'Value'}</th>
              {showScn && <th className="text-right font-medium">Scenario</th>}
              {showScn && <th className="text-right font-medium">Δ</th>}
            </tr>
          </thead>
          <tbody>
            {POLLUTANTS.map((p: Pollutant) => (
              <tr key={p} className="border-t border-ink-800">
                <td className="py-1 text-slate-300">
                  {POLLUTANT_LABEL[p]} <span className="text-[9.5px] text-slate-600">{POLLUTANT_UNIT[p]}</span>
                </td>
                <td className="num text-right text-slate-300">{fmt(b[p], p === 'co' ? 2 : 1)}</td>
                {showScn && <td className="num text-right text-slate-100">{fmt(sc![p], p === 'co' ? 2 : 1)}</td>}
                {showScn && (
                  <td className="text-right">
                    <DeltaText value={d![p]} digits={p === 'co' ? 2 : 1} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Block>
      <Block title="Urban & environmental factors">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Factor label="Traffic intensity" v={cur.trafficIntensity} b={b.trafficIntensity} unit="/100" show={showScn} />
          <Factor label="Industrial influence" v={cur.industrialInfluence} b={b.industrialInfluence} unit="/100" show={showScn} />
          <Factor label="Green cover" v={cur.greenCover} b={b.greenCover} unit="%" show={showScn} invert />
          <Factor label="Building density" v={cur.buildingDensity * 100} b={b.buildingDensity * 100} unit="%" show={showScn} />
          <Factor label="Temperature" v={cur.temperature} b={b.temperature} unit="°C" show={showScn} />
          <Factor label="Dispersion factor" v={cur.windInfluence} b={b.windInfluence} unit="×" show={showScn} digits={2} />
          <div>
            <div className="text-[10.5px] text-slate-500">Population (demo)</div>
            <div className="num text-[13px] text-slate-200">{fmtInt(cell.population)}</div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-500">Avg bldg height</div>
            <div className="num text-[13px] text-slate-200">{fmt(cell.avgBuildingHeight, 0)} m</div>
          </div>
        </div>
      </Block>
      {nearby.length > 0 && (
        <Block title="Nearby industries (< 4 km)">
          {nearby.map(({ i, d: dist }) => (
            <button key={i.id} onClick={() => selectIndustry(i.id)} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-[11.5px] hover:bg-ink-800">
              <Factory size={12} className="text-violet-300" />
              <span className="font-mono text-[10.5px] text-slate-500">{i.id}</span>
              <span className="truncate text-slate-300">{i.category}</span>
              <span className="num ml-auto text-slate-400">{fmt(dist)} km</span>
            </button>
          ))}
        </Block>
      )}
      <Block>
        <div className="flex gap-1.5">
          <Button onClick={() => flyTo(cell.center, 7000)} className="flex-1">
            <Crosshair size={13} /> Fly to
          </Button>
          <Button onClick={() => toggleArea(cell.id)} className="flex-1" variant={inArea ? 'primary' : 'default'}>
            <MapPin size={13} /> {inArea ? 'In scenario area' : 'Add to scenario area'}
          </Button>
        </div>
      </Block>
    </>
  );
}

function Factor({ label, v, b, unit, show, invert, digits = 0 }: { label: string; v: number; b: number; unit: string; show: boolean; invert?: boolean; digits?: number }) {
  const d = v - b;
  return (
    <div>
      <div className="text-[10.5px] text-slate-500">{label}</div>
      <div className="num text-[13px] text-slate-200">
        {fmt(v, digits)}
        <span className="ml-0.5 text-[10px] text-slate-500">{unit}</span>
        {show && Math.abs(d) > 0.05 && (
          <span className="ml-1.5 text-[10.5px]">
            <DeltaText value={d} digits={digits} invert={invert} />
          </span>
        )}
      </div>
    </div>
  );
}

function IndustryCard({ id }: { id: string }) {
  const base = useTwin((s) => s.base)!;
  const draft = useTwin((s) => s.draft);
  const result = useTwin((s) => s.activeResult);
  const updateDraft = useTwin((s) => s.updateDraft);
  const selectIndustry = useTwin((s) => s.selectIndustry);
  const runDraft = useTwin((s) => s.runDraft);
  const ind =
    base.industries.find((i) => i.id === id) ??
    draft?.addedIndustries.find((i) => i.id === id) ??
    result?.params.addedIndustries.find((i) => i.id === id);
  if (!ind || !draft) return null;
  const isBase = base.industries.some((i) => i.id === id);
  const removed = draft.removedIndustryIds.includes(id);
  const override = draft.industryIntensityOverrides[id];
  const intensity = override ?? ind.emissionIntensity;

  return (
    <>
      <div className="flex items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.12em] text-violet-300/80">Industry · {ind.category}</div>
          <div className="truncate text-[13px] font-semibold text-slate-100">{ind.name}</div>
          <div className="font-mono text-[10.5px] text-slate-500">
            {ind.id} · {ind.location[1].toFixed(4)}°N {ind.location[0].toFixed(4)}°E
          </div>
        </div>
        <div className="flex items-center gap-1">
          <DataBadge status={ind.status} />
          <button onClick={() => selectIndustry(null)} className="rounded p-0.5 text-slate-500 hover:text-slate-200">
            <X size={14} />
          </button>
        </div>
      </div>
      <Block>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Emission intensity" value={ind.emissionIntensity} unit="/100" />
          <Stat label="Control efficiency" value={`${Math.round(ind.controlEfficiency * 100)}%`} />
        </div>
        <div className="mt-2 text-[11.5px] text-slate-400">{ind.emissionProfile}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {ind.mainPollutants.map((p) => (
            <span key={p} className="rounded bg-ink-700 px-1.5 py-0.5 text-[10.5px] text-slate-300">
              {POLLUTANT_LABEL[p]}
            </span>
          ))}
        </div>
      </Block>
      {isBase && (
        <Block title="What-if for this source">
          <Slider
            label="Scenario emission intensity"
            value={intensity}
            min={0}
            max={100}
            step={1}
            onChange={(v) => updateDraft({ industryIntensityOverrides: { ...draft.industryIntensityOverrides, [id]: v } })}
          />
          <div className="mt-2 flex gap-1.5">
            <Button
              variant={removed ? 'primary' : 'danger'}
              className="flex-1"
              onClick={() =>
                updateDraft({
                  removedIndustryIds: removed ? draft.removedIndustryIds.filter((x) => x !== id) : [...draft.removedIndustryIds, id],
                })
              }
            >
              <Trash2 size={13} /> {removed ? 'Restore' : 'Remove in scenario'}
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => runDraft()}>
              <Play size={13} /> Run scenario
            </Button>
          </div>
          <Disclaimer>Changes go into the What-If draft together with any other parameters.</Disclaimer>
        </Block>
      )}
    </>
  );
}

export function RightPanel() {
  const result = useTwin((s) => s.activeResult);
  const cellId = useTwin((s) => s.selectedCellId);
  const industryId = useTwin((s) => s.selectedIndustryId);
  return (
    <div>
      {result && <ScenarioSummaryCard key={result.id} />}
      {industryId ? (
        <IndustryCard id={industryId} />
      ) : cellId ? (
        <ZoneCard cellId={cellId} />
      ) : (
        <>
          <SectionHeader title="Details" subtitle="Click a grid zone or industry on the 3D map" />
          <div className="px-4 py-6 text-center text-[12px] text-slate-500">
            <MapPin className="mx-auto mb-2 text-slate-600" size={22} />
            No zone selected.
            <br />
            Zone details, pollutant values and demo source contribution appear here.
          </div>
        </>
      )}
    </div>
  );
}
