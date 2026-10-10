import { Crosshair, Eye, Factory, MapPin, Play, RadioTower, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTwin } from '../store/useTwinStore';
import { Button, DataBadge, DeltaText, DrawerHeader, MetricRow, SeverityChip, Slider } from './ui';
import { POLLUTANT_LABEL, POLLUTANT_UNIT, RISK_COLOR, RISK_LABEL, SOURCE_COLORS, SOURCE_LABELS } from '../utils/colors';
import { fmt, fmtInt } from '../utils/format';
import { haversineKm } from '../utils/geo';
import { zonePlaceNames } from '../utils/zones';
import { SourceDonut } from '../analytics/SourceDonut';
import { POLLUTANTS } from '../services/pollutionModel';
import { scoreBreakdown } from '../scenarios/locationComparison';
import { useSiteAssessment } from '../scenarios/useSiteAssessment';
import type { CellState, Pollutant, SourceContribution } from '../types';

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t hairline px-5 py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-sand-200">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function useCloseDrawer() {
  const selectCell = useTwin((s) => s.selectCell);
  const selectIndustry = useTwin((s) => s.selectIndustry);
  const selectCandidate = useTwin((s) => s.selectCandidate);
  const setRightOpen = useTwin((s) => s.setRightOpen);
  return () => {
    selectCell(null);
    selectIndustry(null);
    selectCandidate(null);
    setRightOpen(false);
  };
}

/** Map view toggles shared by the scenario summary and the strip. */
function ViewToggles() {
  const mode = useTwin((s) => s.displayMode);
  const setMode = useTwin((s) => s.setDisplayMode);
  const opts: [typeof mode, string][] = [
    ['baseline', 'Baseline'],
    ['scenario', 'Scenario'],
    ['delta', 'Δ Change'],
  ];
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg bg-sand-100/[0.06] p-0.5 ring-1 ring-inset ring-sand-100/10" role="radiogroup" aria-label="Map view">
      {opts.map(([m, l]) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          className={`cursor-pointer rounded-md py-1 text-[12px] font-medium transition-colors ${mode === m ? 'bg-accent-500 text-white' : 'text-sand-300 hover:text-sand-50'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** Full summary of the active scenario — shown when nothing on the map is selected. */
function ScenarioSummary() {
  const r = useTwin((s) => s.activeResult)!;
  const saved = useTwin((s) => s.saved);
  const save = useTwin((s) => s.saveActive);
  const clear = useTwin((s) => s.clearResult);
  const setSection = useTwin((s) => s.setSection);
  const setLeftOpen = useTwin((s) => s.setLeftOpen);
  const close = useCloseDrawer();
  const [name, setName] = useState(r.params.name);
  const isSaved = saved.some((s) => s.id === r.id);
  const s = r.summary;
  return (
    <>
      <DrawerHeader kicker="Active scenario" title={r.params.name} onClose={close} />
      <div className="px-5 pb-4">
        <div className="text-[12px] text-sand-400">Mean PM2.5 across the analysis area</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="num text-[15px] text-sand-400">{fmt(s.meanBaseline)}</span>
          <span className="text-sand-500" aria-hidden="true">→</span>
          <span className="num text-[28px] font-semibold leading-none tracking-[-0.02em] text-sand-50">{fmt(s.meanScenario)}</span>
          <span className="text-[12px] text-sand-500">µg/m³</span>
          <span className="ml-auto text-[13px] font-semibold">
            <DeltaText value={s.meanDeltaPct} unit="%" />
          </span>
        </div>
        <div className="mt-3">
          <ViewToggles />
        </div>
      </div>
      <Section title="Modeled effect">
        <MetricRow label="Change in mean PM2.5">
          <DeltaText value={s.meanDelta} unit=" µg/m³" />
        </MetricRow>
        <MetricRow label="Affected zones">{s.affectedCount}</MetricRow>
        <MetricRow label="Largest decrease">
          <DeltaText value={s.maxDecrease} />
        </MetricRow>
        <MetricRow label="Largest increase">
          <DeltaText value={s.maxIncrease} />
        </MetricRow>
        <MetricRow label="High-risk zones">
          {s.highRiskBaseline} → {s.highRiskScenario}
        </MetricRow>
        <MetricRow label={<span title="Demo population estimate">Population in worsened zones</span>}>{fmtInt(s.exposedPopulation)}</MetricRow>
      </Section>
      <Section title="Save">
        {!isSaved ? (
          <div className="flex gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Scenario name"
              className="min-w-0 flex-1 rounded-lg bg-ink-950 px-2.5 py-1.5 text-[12.5px] text-sand-100 ring-1 ring-inset ring-sand-100/15 outline-none focus:ring-2 focus:ring-accent-400"
            />
            <Button onClick={() => save(name)}>
              <Save size={14} aria-hidden="true" /> Save
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="font-medium text-emerald-300">Saved</span>
            <button
              type="button"
              className="cursor-pointer text-accent-300 hover:underline"
              onClick={() => {
                setSection('scenarios');
                setLeftOpen(true);
              }}
            >
              View saved scenarios
            </button>
          </div>
        )}
        <Button variant="ghost" className="mt-2 w-full" onClick={clear}>
          Discard scenario
        </Button>
      </Section>
      <SourceFooter status="MODELED_SCENARIO" note={r.metadata.disclaimer} />
    </>
  );
}

/** Compact scenario reminder above a selected zone / industry. */
function ScenarioStrip() {
  const r = useTwin((s) => s.activeResult);
  const selectCell = useTwin((s) => s.selectCell);
  const selectIndustry = useTwin((s) => s.selectIndustry);
  if (!r) return null;
  return (
    <div className="mx-5 mb-3 rounded-lg bg-amber-300/10 px-3 py-2 ring-1 ring-inset ring-amber-300/25">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium text-sand-100">{r.params.name}</span>
        <DeltaText value={r.summary.meanDeltaPct} unit="%" />
        <button
          type="button"
          className="cursor-pointer font-medium text-accent-300 hover:underline"
          onClick={() => {
            selectCell(null);
            selectIndustry(null);
          }}
        >
          Summary
        </button>
      </div>
    </div>
  );
}

function SourceFooter({ status, note }: { status: Parameters<typeof DataBadge>[0]['status']; note?: string }) {
  return (
    <div className="border-t hairline px-5 py-3" title={note}>
      <DataBadge status={status} />
    </div>
  );
}

function ContributionChart({ value, windInfluence }: { value: SourceContribution; windInfluence: number }) {
  const total = value.traffic + value.industry + value.background + value.other || 1;
  const keys = Object.keys(SOURCE_COLORS) as (keyof SourceContribution)[];
  return (
    <>
      <div className="flex items-center gap-4">
        <SourceDonut value={value} size={112} legend={false} />
        <ul className="min-w-0 flex-1 space-y-1.5">
          {keys.map((k) => (
            <li key={k} className="flex items-center gap-2 text-[12px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SOURCE_COLORS[k] }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sand-300">{SOURCE_LABELS[k]}</span>
              <span className="num font-semibold text-sand-50">{fmt((value[k] / total) * 100, 0)}%</span>
              <span className="num w-9 text-right text-[11.5px] text-sand-500">{fmt(value[k], 1)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-2 flex justify-between text-[11.5px] text-sand-500">
        <span>Values in µg/m³ PM2.5</span>
        <span>Weather multiplier ×{fmt(windInfluence, 2)}</span>
      </div>
    </>
  );
}

function ZoneCard({ cellId }: { cellId: string }) {
  const base = useTwin((s) => s.base)!;
  const baseline = useTwin((s) => s.baseline);
  const result = useTwin((s) => s.activeResult);
  const mode = useTwin((s) => s.displayMode);
  const pollutant = useTwin((s) => s.pollutant);
  const toggleArea = useTwin((s) => s.toggleAreaCell);
  const inArea = useTwin((s) => s.draft?.targetCells.includes(cellId) ?? false);
  const flyTo = useTwin((s) => s.requestFlyTo);
  const selectIndustry = useTwin((s) => s.selectIndustry);
  const setSection = useTwin((s) => s.setSection);
  const setLeftOpen = useTwin((s) => s.setLeftOpen);
  const close = useCloseDrawer();
  const cell = base.cells.find((c) => c.id === cellId);
  const b = baseline.find((s) => s.cellId === cellId);
  if (!cell || !b) return null;
  const showScn = !!result && (mode === 'scenario' || mode === 'delta');
  const sc = showScn ? result!.scenario.find((s) => s.cellId === cellId)! : null;
  const cur = sc ?? b;
  const d = showScn ? result!.delta[cellId] : null;
  const place = zonePlaceNames(base.cells).get(cell.id);
  const nearby = base.industries
    .map((i) => ({ i, d: haversineKm(i.location, cell.center) }))
    .filter((x) => x.d < 4)
    .sort((a, b2) => a.d - b2.d);

  return (
    <>
      <DrawerHeader
        kicker={place ? `Zone ${cell.id}` : 'Zone'}
        title={place ?? cell.id}
        subtitle={`${cell.landUse}, row ${cell.row + 1}, column ${cell.col + 1}`}
        onClose={close}
      />
      <ScenarioStrip />
      <div className="px-5 pb-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[12px] text-sand-400">PM2.5{showScn ? ', scenario' : ''}</div>
            <div className="num text-[34px] font-semibold leading-none tracking-[-0.02em] text-sand-50">
              {fmt(cur.pm25, 0)}
              <span className="ml-1.5 text-[12px] font-medium tracking-normal text-sand-500">µg/m³</span>
            </div>
          </div>
          <SeverityChip color={RISK_COLOR[cur.risk]} label={RISK_LABEL[cur.risk]} />
        </div>
        {d && (
          <div className="mt-2 text-[12px] text-sand-400">
            Baseline <span className="num font-medium text-sand-200">{fmt(b.pm25, 0)}</span>, change <DeltaText value={d.pm25} /> (
            <DeltaText value={(d.pm25 / b.pm25) * 100} unit="%" />)
          </div>
        )}
      </div>

      <ObservedSection cellId={cellId} modeled={b} />

      <Section title="Source contribution" right={<span className="text-[11.5px] text-sand-500" title="Illustrative split from the prototype model, not a validated source apportionment.">Prototype model</span>}>
        <ContributionChart value={cur.contributionAbs} windInfluence={cur.windInfluence} />
      </Section>

      <Section title="Pollutants">
        <table className="w-full text-[12.5px]">
          <thead className="text-[11.5px] text-sand-500">
            <tr>
              <th className="pb-1 text-left font-medium">
                <span className="sr-only">Pollutant</span>
              </th>
              <th className="pb-1 text-right font-medium">{showScn ? 'Baseline' : 'Value'}</th>
              {showScn && <th className="pb-1 text-right font-medium">Scenario</th>}
              {showScn && <th className="pb-1 text-right font-medium">Δ</th>}
            </tr>
          </thead>
          <tbody>
            {POLLUTANTS.map((p: Pollutant) => (
              <tr key={p} className={`border-t hairline ${p === pollutant ? 'bg-accent-500/[0.07]' : ''}`}>
                <td className="py-1.5 pl-1 text-sand-200">
                  <span className={p === pollutant ? 'font-semibold text-sand-50' : ''}>{POLLUTANT_LABEL[p]}</span>{' '}
                  <span className="text-[11px] text-sand-500">{POLLUTANT_UNIT[p]}</span>
                </td>
                <td className="num text-right text-sand-200">{fmt(b[p], p === 'co' ? 2 : 1)}</td>
                {showScn && <td className="num text-right font-medium text-sand-50">{fmt(sc![p], p === 'co' ? 2 : 1)}</td>}
                {showScn && (
                  <td className="pr-1 text-right">
                    <DeltaText value={d![p]} digits={p === 'co' ? 2 : 1} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Urban and environmental factors">
        <div className="grid grid-cols-2 gap-x-5">
          <Factor label="Traffic intensity" v={cur.trafficIntensity} b={b.trafficIntensity} unit="/100" show={showScn} />
          <Factor label="Industrial influence" v={cur.industrialInfluence} b={b.industrialInfluence} unit="/100" show={showScn} />
          <Factor label="Green cover" v={cur.greenCover} b={b.greenCover} unit="%" show={showScn} invert />
          <Factor label="Building density" v={cur.buildingDensity * 100} b={b.buildingDensity * 100} unit="%" show={showScn} />
          <Factor label="Temperature" v={cur.temperature} b={b.temperature} unit="°C" show={showScn} />
          <Factor label="Dispersion" v={cur.windInfluence} b={b.windInfluence} unit="×" show={showScn} digits={2} />
          <div className="py-[5px]">
            <div className="text-[11.5px] text-sand-400">Population</div>
            <div className="num text-[13.5px] font-medium text-sand-50" title="Demo estimate">
              {fmtInt(cell.population)}
            </div>
          </div>
          <div className="py-[5px]">
            <div className="text-[11.5px] text-sand-400">Avg building height</div>
            <div className="num text-[13.5px] font-medium text-sand-50">{fmt(cell.avgBuildingHeight, 0)} m</div>
          </div>
        </div>
      </Section>

      {nearby.length > 0 && (
        <Section title="Nearby industries" right={<span className="text-[11.5px] text-sand-500">within 4 km</span>}>
          <ul className="-mx-2">
            {nearby.map(({ i, d: dist }) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => selectIndustry(i.id)}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-sand-100/[0.06]"
                >
                  <Factory size={14} className="shrink-0 text-accent-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-sand-100">{i.name}</span>
                    <span className="text-[11.5px] text-sand-400">
                      {i.id}, {i.category}
                    </span>
                  </span>
                  <span className="num shrink-0 text-sand-300">{fmt(dist)} km</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <section className="grid grid-cols-2 gap-2 border-t hairline px-5 py-4">
        <Button onClick={() => flyTo(cell.center, 7000)}>
          <Crosshair size={14} aria-hidden="true" /> Fly to
        </Button>
        <Button onClick={() => toggleArea(cell.id)} variant={inArea ? 'primary' : 'default'} title="Use this zone as the area for What-If changes">
          <MapPin size={14} aria-hidden="true" /> {inArea ? 'In scenario area' : 'Add to scenario'}
        </Button>
        <Button
          variant="outline"
          className="col-span-2"
          onClick={() => {
            if (!inArea) toggleArea(cell.id);
            setSection('simulator');
            setLeftOpen(true);
          }}
        >
          <SlidersHorizontal size={14} aria-hidden="true" /> Model a What-If for this zone
        </Button>
      </section>
      <SourceFooter status={showScn ? 'MODELED_SCENARIO' : 'DEMO'} />
    </>
  );
}

function ObservedSection({ cellId, modeled }: { cellId: string; modeled: CellState }) {
  const summaries = useTwin((s) => s.stationSummaries);
  const field = useTwin((s) => s.observedField);
  const pollutant = useTwin((s) => s.pollutant);
  const aggWindow = useTwin((s) => s.aggWindow);
  if (!field && !summaries.length) return null;
  const inCell = summaries.filter((s) => s.cellId === cellId);
  const idw = field?.values[cellId];
  const near = field?.nearestKm[cellId];
  const digits = pollutant === 'co' ? 2 : 1;
  return (
    <Section title={`Observed, ${aggWindow === 'last24h' ? 'last 24 h' : 'whole period'}`} right={<DataBadge status="OBSERVED" />}>
      {inCell.map((s) => (
        <div key={s.station.id} className="flex items-center gap-2 py-0.5 text-[12.5px]">
          <RadioTower size={13} className="text-emerald-400" aria-hidden="true" />
          <span className="truncate text-sand-200">{s.station.name}</span>
          <span className="num ml-auto font-medium text-emerald-300">{s.values[pollutant] !== undefined ? fmt(s.values[pollutant]!, digits) : '—'}</span>
        </div>
      ))}
      {idw !== undefined && (
        <>
          <MetricRow label={`Interpolated ${POLLUTANT_LABEL[pollutant]}`}>{fmt(idw, digits)}</MetricRow>
          <MetricRow label="Prototype model">{fmt(modeled[pollutant], digits)}</MetricRow>
          <MetricRow label="Nearest station">
            {fmt(near ?? NaN, 1)} km{near !== undefined && near > 8 ? ', low confidence' : ''}
          </MetricRow>
        </>
      )}
      {idw === undefined && !inCell.length && <p className="text-[12px] text-sand-400">No station reports {POLLUTANT_LABEL[pollutant]} for this zone yet.</p>}
    </Section>
  );
}

function Factor({ label, v, b, unit, show, invert, digits = 0 }: { label: string; v: number; b: number; unit: string; show: boolean; invert?: boolean; digits?: number }) {
  const d = v - b;
  return (
    <div className="py-[5px]">
      <div className="text-[11.5px] text-sand-400">{label}</div>
      <div className="num text-[13.5px] font-medium text-sand-50">
        {fmt(v, digits)}
        <span className="ml-0.5 text-[11px] font-normal text-sand-500">{unit}</span>
        {show && Math.abs(d) > 0.05 && (
          <span className="ml-1.5 text-[11.5px]">
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
  const runDraft = useTwin((s) => s.runDraft);
  const flyTo = useTwin((s) => s.requestFlyTo);
  const close = useCloseDrawer();
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
      <DrawerHeader
        kicker={`Industry, ${ind.category}`}
        title={ind.name}
        subtitle={
          <span className="num">
            {ind.id}, {ind.location[1].toFixed(4)}°N {ind.location[0].toFixed(4)}°E
          </span>
        }
        onClose={close}
      />
      <ScenarioStrip />
      <Section title="Emissions">
        <MetricRow label="Emission intensity">{ind.emissionIntensity} / 100</MetricRow>
        <MetricRow label="Control efficiency">{Math.round(ind.controlEfficiency * 100)}%</MetricRow>
        <MetricRow label="Profile">{ind.emissionProfile}</MetricRow>
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Main pollutants">
          {ind.mainPollutants.map((p) => (
            <span key={p} className="rounded-md bg-sand-100/[0.07] px-2 py-0.5 text-[11.5px] font-medium text-sand-200">
              {POLLUTANT_LABEL[p]}
            </span>
          ))}
        </div>
      </Section>
      {isBase && (
        <Section title="What-If for this source">
          <Slider
            label="Scenario emission intensity"
            value={intensity}
            min={0}
            max={100}
            step={1}
            onChange={(v) => updateDraft({ industryIntensityOverrides: { ...draft.industryIntensityOverrides, [id]: v } })}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button
              variant={removed ? 'primary' : 'danger'}
              onClick={() =>
                updateDraft({
                  removedIndustryIds: removed ? draft.removedIndustryIds.filter((x) => x !== id) : [...draft.removedIndustryIds, id],
                })
              }
            >
              <Trash2 size={14} aria-hidden="true" /> {removed ? 'Restore' : 'Remove in scenario'}
            </Button>
            <Button variant="primary" onClick={() => runDraft()}>
              <Play size={14} aria-hidden="true" /> Run scenario
            </Button>
          </div>
          <p className="mt-2 text-[11.5px] text-sand-500">Runs with every other What-If change in the current draft.</p>
        </Section>
      )}
      <section className="border-t hairline px-5 py-4">
        <Button className="w-full" onClick={() => flyTo(ind.location, 4000)}>
          <Crosshair size={14} aria-hidden="true" /> Fly to
        </Button>
      </section>
      <SourceFooter status={ind.status} />
    </>
  );
}

function CandidateCard({ id }: { id: string }) {
  const { rows, valid } = useSiteAssessment();
  const project = useTwin((s) => s.siteProject);
  const applyResult = useTwin((s) => s.applyResult);
  const active = useTwin((s) => s.activeResult);
  const flyTo = useTwin((s) => s.requestFlyTo);
  const close = useCloseDrawer();
  const r = rows.find((x) => x.candidate.id === id);
  if (!r) return null;
  const parts = r.outOfArea ? [] : scoreBreakdown(r, valid);
  const showing = !!r.result && active?.id === r.result.id;
  return (
    <>
      <DrawerHeader
        kicker={r.rank ? `Candidate site, rank ${r.rank} of ${valid.length}` : 'Candidate site'}
        title={`Site ${r.candidate.id}`}
        subtitle={r.hostCellId ? `Zone ${r.hostCellId}, ${project.category.toLowerCase()} at intensity ${project.intensity}` : 'Outside the analysis area'}
        onClose={close}
      />
      {r.outOfArea ? (
        <p className="px-5 pb-5 text-[12.5px] text-sand-400">This point is outside the modeled grid, so it can't be assessed. Pick a site inside the analysis area.</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3 px-5 pb-4">
            <div>
              <div className="text-[12px] text-sand-400">Environmental risk score</div>
              <div className="num text-[34px] font-semibold leading-none tracking-[-0.02em] text-sand-50">
                {fmt(r.riskScore, 0)}
                <span className="ml-1.5 text-[12px] font-medium tracking-normal text-sand-500">/ 100, lower is better</span>
              </div>
            </div>
          </div>
          <Section title="What makes up the score">
            <ul className="space-y-2">
              {parts.map((p) => (
                <li key={p.key}>
                  <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="text-sand-300">
                      {p.label} <span className="text-[11px] text-sand-500">{Math.round(p.weight * 100)}%</span>
                    </span>
                    <span className="num font-semibold text-sand-50">{fmt(p.points, 1)}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-sand-100/10" aria-hidden="true">
                    <div className="h-full rounded-full bg-accent-400" style={{ width: `${(p.points / (p.weight * 100)) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            {valid.length < 2 && <p className="mt-2 text-[11.5px] text-sand-500">Scores are relative; add another site to compare.</p>}
          </Section>
          <Section title="Modeled impact">
            <MetricRow label="Δ mean PM2.5">
              <DeltaText value={r.meanDelta} digits={2} unit=" µg/m³" />
            </MetricRow>
            <MetricRow label="Max local Δ PM2.5">
              <DeltaText value={r.maxDelta} unit=" µg/m³" />
            </MetricRow>
            <MetricRow label="Zones affected">{r.affectedZones}</MetricRow>
            <MetricRow label={<span title="Demo population estimate">Population in worsened zones</span>}>{fmtInt(r.exposedPopulation)}</MetricRow>
          </Section>
          <Section title="Site conditions">
            <MetricRow label="Traffic at the site">{fmt(r.hostTraffic, 0)} / 100</MetricRow>
            <MetricRow label="Green cover">{fmt(r.hostGreenCover, 0)}%</MetricRow>
            <MetricRow label="Building density">{fmt(r.hostBuildingDensity * 100, 0)}%</MetricRow>
            <MetricRow label="Nearest existing industry">{fmt(r.nearestIndustryKm, 1)} km</MetricRow>
          </Section>
          <section className="grid grid-cols-2 gap-2 border-t hairline px-5 py-4">
            <Button onClick={() => flyTo(r.candidate.location, 5000)}>
              <Crosshair size={14} aria-hidden="true" /> Fly to
            </Button>
            <Button variant={showing ? 'primary' : 'default'} disabled={!r.result} onClick={() => r.result && applyResult(r.result)}>
              <Eye size={14} aria-hidden="true" /> {showing ? 'On the map' : 'Show impact'}
            </Button>
          </section>
          <SourceFooter status="MODELED_SCENARIO" note="Demo scoring rules; to be replaced by a trained suitability model." />
        </>
      )}
    </>
  );
}

export function RightPanel() {
  const result = useTwin((s) => s.activeResult);
  const cellId = useTwin((s) => s.selectedCellId);
  const industryId = useTwin((s) => s.selectedIndustryId);
  const candidateId = useTwin((s) => s.selectedCandidateId);
  if (industryId) return <IndustryCard key={industryId} id={industryId} />;
  if (cellId) return <ZoneCard key={cellId} cellId={cellId} />;
  if (candidateId) return <CandidateCard key={candidateId} id={candidateId} />;
  if (result) return <ScenarioSummary key={result.id} />;
  return null;
}
