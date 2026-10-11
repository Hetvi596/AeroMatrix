import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AlertTriangle, Crosshair, Factory, Play, RotateCcw, Trash2, Truck } from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import { Button, DataBadge, DeltaText, DrawerHeader, MetricRow, Slider, TABLE } from './ui';
import {
  AREA_BUFFER_KM,
  SITE_RADIUS_KM,
  emittedKg,
  fuelUnit,
  modeledSourcesFor,
  sitesInArea,
  sitesNear,
  type IndustrialArea,
  type IndustrialTarget,
  type IndustrySite,
} from '../services/industryData';
import { cellsInTarget, inModeledGrid, localImpact, reductionScenario, relocationScenario, shutdownScenario } from '../scenarios/industryScenarios';
import { fmt, fmtInt } from '../utils/format';
import type { ScenarioParams } from '../types';

const STATUS_LABEL: Record<IndustrialArea['analysisArea'], string> = { inside: 'In map area', partial: 'Partly in map area', outside: 'Outside map area' };
const POLLUTANT_LABEL = { pm10: 'PM10', pm25: 'PM2.5', so2: 'SO₂', nox: 'NOx', co: 'CO', nmvoc: 'NMVOC' } as const;

function rowKeys(go: () => void) {
  return (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      go();
    }
  };
}

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

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[11.5px] leading-snug text-sand-500">{children}</p>;
}

// ----------------------------------------------------------- Industries screen

/** MIDC estates list; rows select the estate on the map and open its card. */
export function IndustrialAreasTable() {
  const industry = useTwin((s) => s.industry);
  const status = useTwin((s) => s.industryStatus);
  const selected = useTwin((s) => s.selectedIndustrialArea);
  const select = useTwin((s) => s.selectIndustrialArea);
  const flyTo = useTwin((s) => s.requestFlyTo);
  const rows = useMemo(() => {
    const order = { inside: 0, partial: 1, outside: 2 } as const;
    return [...(industry?.areas ?? [])].sort((a, b) => order[a.analysisArea] - order[b.analysisArea] || a.name.localeCompare(b.name));
  }, [industry]);

  if (status === 'error') return <p className="px-5 pb-3 text-[12.5px] text-accent-300">Couldn't load the industry dataset (public/data/industry).</p>;
  if (!industry) return <p className="px-5 pb-3 text-[12.5px] text-sand-400">Loading industrial areas…</p>;

  return (
    <div className="pb-2">
      <div className="flex items-baseline justify-between gap-2 px-5 pb-1 pt-4">
        <h3 className="text-[13px] font-semibold text-sand-200">MIDC industrial areas</h3>
        <span className="text-[11.5px] text-sand-500">{industry.areas.length} in Pune district</span>
      </div>
      <table className={TABLE.table}>
        <thead>
          <tr>
            <th className={`${TABLE.th} pl-5 text-left`}>Area</th>
            <th className={`${TABLE.th} pr-5 text-right`} title="Industrial plots, from the MIDC plot summary">
              Ind. plots
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const active = selected === a.code;
            const go = () => {
              select(a.code);
              flyTo(a.centroid, a.analysisArea === 'outside' ? 26000 : 9000);
            };
            return (
              <tr key={a.code} tabIndex={0} aria-selected={active} onClick={go} onKeyDown={rowKeys(go)} className={`${TABLE.row} ${active ? TABLE.rowActive : ''}`}>
                <td className={`${TABLE.td} relative pl-5`}>
                  {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-accent-500" aria-hidden="true" />}
                  <span className="flex flex-col">
                    <span className="font-semibold leading-snug text-sand-50">{a.name}</span>
                    <span className={`text-[11.5px] ${a.analysisArea === 'outside' ? 'text-sand-500' : 'text-sand-300'}`}>
                      {STATUS_LABEL[a.analysisArea]}
                      {a.fieldType ? `, ${a.fieldType.toLowerCase()}` : ''}
                    </span>
                  </span>
                </td>
                <td className={`${TABLE.td} num pr-5 text-right text-sand-200`}>{a.plots?.industrial ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-5 pt-2 text-[11.5px] text-sand-500" title={`${industry.counts.osmSites} OpenStreetMap industry sites are also on the map (partial coverage).`}>
        Official MIDC estates. Mapped factory sites are partial.
      </p>
    </div>
  );
}

/** District-level 2021 inventory: the industry sector's share, as context only. */
export function DistrictInventory() {
  const industry = useTwin((s) => s.industry);
  if (!industry) return null;
  const ind = industry.districtEmissions.find((d) => d.code === 'INDU');
  const total = industry.districtEmissions.find((d) => d.code === 'TOTAL');
  if (!ind || !total) return null;
  const keys = ['pm25', 'pm10', 'so2', 'nox', 'co'] as const;
  return (
    <section className="border-t hairline px-5 py-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-sand-200">Industry in the 2021 district inventory</h3>
        <span className="text-[11.5px] text-sand-500">tonnes/year</span>
      </div>
      <table className="w-full text-[12.5px]">
        <thead className="text-[11.5px] text-sand-500">
          <tr>
            <th className="pb-1 text-left font-medium">
              <span className="sr-only">Pollutant</span>
            </th>
            <th className="pb-1 text-right font-medium">Industry</th>
            <th className="pb-1 text-right font-medium">Share of district</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const v = ind.tonnesPerYear[k];
            const t = total.tonnesPerYear[k];
            return (
              <tr key={k} className="border-t hairline">
                <td className="py-1.5 font-medium text-sand-200">{POLLUTANT_LABEL[k]}</td>
                <td className="num py-1.5 text-right text-sand-50">{v == null ? '—' : fmtInt(v)}</td>
                <td className="num py-1.5 text-right text-sand-300">{v == null || !t ? '—' : `${fmt((v / t) * 100, 0)}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Note>Pune district totals (ARAI/TERI). Emitted mass, not air concentration.</Note>
    </section>
  );
}

// ------------------------------------------------------------ What-If controls

/** Reduce / shut down / relocate the modeled sources covered by a real estate or site cluster. */
function IndustrialScenarioControls({ target }: { target: IndustrialTarget }) {
  const base = useTwin((s) => s.base)!;
  const industry = useTwin((s) => s.industry)!;
  const result = useTwin((s) => s.activeResult);
  const updateDraft = useTwin((s) => s.updateDraft);
  const runDraft = useTwin((s) => s.runDraft);
  const clearResult = useTwin((s) => s.clearResult);
  const resetDraft = useTwin((s) => s.resetDraft);
  const setSection = useTwin((s) => s.setSection);
  const setLeftOpen = useTwin((s) => s.setLeftOpen);
  const setPending = useTwin((s) => s.setPendingIndustry);
  const setInteraction = useTwin((s) => s.setInteraction);
  const [pct, setPct] = useState(30);
  const [lastName, setLastName] = useState<string | null>(null);
  const sources = useMemo(() => modeledSourcesFor(target, base.industries), [target, base]);
  const others = useMemo(() => industry.areas.filter((a) => !(target.kind === 'area' && a.code === target.area.code)), [industry, target]);
  const [destCode, setDestCode] = useState<number>(() => (others.find((a) => a.analysisArea !== 'outside') ?? others[0])?.code ?? 0);
  const dest = others.find((a) => a.code === destCode) ?? null;
  const cells = useMemo(() => cellsInTarget(base, target), [base, target]);
  const anchor = target.kind === 'area' ? target.area.centroid : target.site.location;

  const run = (params: ScenarioParams | null) => {
    if (!params) return;
    updateDraft(params);
    if (runDraft()) setLastName(params.name);
  };
  const mine = result && lastName && result.params.name === lastName ? result : null;
  const impact = mine ? localImpact(mine, cells) : null;
  const scope = target.kind === 'area' ? `in or within ${AREA_BUFFER_KM} km of this estate` : `within ${target.radiusKm} km of this site`;

  if (!sources.length) {
    return (
      <Section title="What-If">
        <div className="flex gap-2 rounded-lg bg-sand-100/[0.05] px-3 py-2.5 text-[12.5px] leading-snug text-sand-300 ring-1 ring-inset ring-sand-100/10">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-200" aria-hidden="true" />
          <span>
            No modeled emission source lies {scope}. The dataset has no facility emissions, so the simulator can't compute a reduction, shutdown or
            relocation effect here.
          </span>
        </div>
        {inModeledGrid(base, anchor) && (
          <Button
            className="mt-2 w-full"
            onClick={() => {
              setPending({ location: anchor });
              setInteraction('select');
              setSection('simulator');
              setLeftOpen(true);
            }}
          >
            <Factory size={14} aria-hidden="true" /> Place a hypothetical source here in What-If
          </Button>
        )}
      </Section>
    );
  }

  return (
    <Section title="What-If" right={<DataBadge status="MODELED_SCENARIO" />}>
      <div className="text-[12px] text-sand-400">Modeled sources {scope}:</div>
      <ul className="mt-1.5 space-y-1">
        {sources.map(({ industry: ind, distanceKm }) => (
          <li key={ind.id} className="flex items-baseline gap-2 text-[12.5px]">
            <span className="font-semibold text-sand-100">{ind.id}</span>
            <span className="min-w-0 flex-1 truncate text-sand-300">{ind.category}</span>
            <span className="num text-sand-400" title="Assumed emission intensity, 0–100">
              intensity {ind.emissionIntensity}
            </span>
            <span className="num w-14 text-right text-sand-500">{distanceKm === 0 ? (target.kind === 'area' ? 'inside' : 'at site') : `${fmt(distanceKm, 2)} km`}</span>
          </li>
        ))}
      </ul>
      <Note>Illustrative sources and intensities.</Note>

      <div className="mt-3 rounded-xl bg-sand-100/[0.04] p-3 ring-1 ring-inset ring-sand-100/10">
        <Slider label="Emission reduction" value={pct} min={5} max={100} step={5} format={(v) => `${v}%`} onChange={setPct} />
        <div className="mt-1 grid grid-cols-2 gap-2">
          <Button variant="primary" onClick={() => run(reductionScenario(base, target, sources, pct))}>
            <Play size={14} aria-hidden="true" /> Reduce {pct}%
          </Button>
          <Button variant="danger" onClick={() => run(shutdownScenario(base, target, sources))}>
            <Trash2 size={14} aria-hidden="true" /> Shut down
          </Button>
        </div>
        <label className="mt-3 block text-[12px] text-sand-400">
          Relocate to
          <select
            value={destCode}
            onChange={(e) => setDestCode(Number(e.target.value))}
            className="mt-1 w-full rounded-lg bg-ink-950 px-2 py-1.5 text-[12.5px] text-sand-100 ring-1 ring-inset ring-sand-100/15 outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            {others.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
                {a.analysisArea === 'outside' ? ' (outside map area)' : ''}
              </option>
            ))}
          </select>
        </label>
        {dest && !inModeledGrid(base, dest.centroid) && (
          <Note>Outside the modelled area: the effect there isn’t modelled.</Note>
        )}
        <Button className="mt-2 w-full" disabled={!dest} onClick={() => dest && run(relocationScenario(base, target, sources, dest))}>
          <Truck size={14} aria-hidden="true" /> Relocate
        </Button>
      </div>

      {mine && (
        <div className="mt-3 rounded-xl bg-amber-300/10 p-3 ring-1 ring-inset ring-amber-300/25" role="status">
          <div className="text-[12.5px] font-semibold text-sand-100">{mine.params.name}</div>
          <MetricRow label="City mean PM2.5">
            {fmt(mine.summary.meanBaseline)} → {fmt(mine.summary.meanScenario)} (<DeltaText value={mine.summary.meanDeltaPct} unit="%" />)
          </MetricRow>
          {impact ? (
            <MetricRow label={`Near the ${target.kind === 'area' ? 'estate' : 'site'} (${impact.cells} zones)`}>
              {fmt(impact.baseline)} → {fmt(impact.scenario)} (<DeltaText value={impact.deltaPct} unit="%" />)
            </MetricRow>
          ) : (
            <MetricRow label="Near the target">outside the modeled grid</MetricRow>
          )}
          <MetricRow label="Zones changed by ≥0.5 µg/m³">{mine.summary.affectedCount}</MetricRow>
          <Note>Hypothetical, from the prototype What-If engine.</Note>
          <Button
            className="mt-2 w-full"
            onClick={() => {
              clearResult();
              resetDraft();
              setLastName(null);
            }}
          >
            <RotateCcw size={14} aria-hidden="true" /> Restore baseline
          </Button>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------- estimator / weather

function EmissionsEstimator() {
  const industry = useTwin((s) => s.industry)!;
  const [fuel, setFuel] = useState(industry.emissionFactors[0]?.fuel ?? '');
  const [qty, setQty] = useState('');
  const [days, setDays] = useState('');
  const factor = industry.emissionFactors.find((f) => f.fuel === fuel);
  const q = Number(qty);
  const d = Number(days);
  const out = factor && qty !== '' && q >= 0 ? emittedKg(factor, q) : null;
  const field = 'mt-1 w-full rounded-lg bg-ink-950 px-2 py-1.5 text-[12.5px] text-sand-100 ring-1 ring-inset ring-sand-100/15 outline-none focus-visible:ring-2 focus-visible:ring-accent-400';
  return (
    <Section title="Estimated emissions">
      <div className="grid grid-cols-2 gap-2 text-[12px] text-sand-400">
        <label className="col-span-2">
          Fuel
          <select value={fuel} onChange={(e) => setFuel(e.target.value)} className={field}>
            {industry.emissionFactors.map((f) => (
              <option key={f.fuel} value={f.fuel}>
                {f.fuel.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          Use per day ({factor ? fuelUnit(factor.denominator) : ''})
          <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="e.g. 2" className={`num ${field}`} />
        </label>
        <label>
          Operating days/yr
          <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" placeholder="optional" className={`num ${field}`} />
        </label>
      </div>
      {out && (
        <table className="mt-3 w-full text-[12.5px]">
          <thead className="text-[11.5px] text-sand-500">
            <tr>
              <th className="pb-1 text-left font-medium">
                <span className="sr-only">Pollutant</span>
              </th>
              <th className="pb-1 text-right font-medium">kg/day</th>
              {days !== '' && d > 0 && <th className="pb-1 text-right font-medium">t/year</th>}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(POLLUTANT_LABEL) as (keyof typeof POLLUTANT_LABEL)[]).map((k) => (
              <tr key={k} className="border-t hairline">
                <td className="py-1.5 font-medium text-sand-200">{POLLUTANT_LABEL[k]}</td>
                <td className="num py-1.5 text-right text-sand-50">{out[k] == null ? '—' : fmt(out[k]!, out[k]! < 1 ? 3 : 1)}</td>
                {days !== '' && d > 0 && <td className="num py-1.5 text-right text-sand-300">{out[k] == null ? '—' : fmt((out[k]! * d) / 1000, 2)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Note>Estimated from your fuel use and ARAI/TERI emission factors. Emitted mass, not air concentration; a dash means no published factor.</Note>
    </Section>
  );
}

function WeatherCases({ areaCode }: { areaCode: number }) {
  const all = useTwin((s) => s.industry?.weatherCases);
  const cases = useMemo(() => (all ?? []).filter((w) => w.areaCode === areaCode), [all, areaCode]);
  const updateWeather = useTwin((s) => s.updateWeather);
  const draftWeather = useTwin((s) => s.draft?.weather);
  if (!cases.length) return null;
  return (
    <Section title="Seasonal weather (ERA5, 2024–25)">
      <div className="grid grid-cols-2 gap-1.5">
        {cases.map((c) => {
          const on = !!draftWeather && Object.entries(c.weather).every(([k, v]) => draftWeather[k as keyof typeof draftWeather] === v);
          return (
            <Button key={c.season} variant={on ? 'primary' : 'default'} className="!min-h-8 text-[12px]" onClick={() => updateWeather(c.weather)}>
              {c.label.split(' (')[0]}
            </Button>
          );
        })}
      </div>
      <Note>Applies the season’s typical weather (ERA5 reanalysis) to What-If.</Note>
    </Section>
  );
}

// ------------------------------------------------------------------ cards

function useClose() {
  const selectArea = useTwin((s) => s.selectIndustrialArea);
  const selectSite = useTwin((s) => s.selectIndustrySite);
  const setRightOpen = useTwin((s) => s.setRightOpen);
  return () => {
    selectArea(null);
    selectSite(null);
    setRightOpen(false);
  };
}

export function IndustrialAreaCard({ code }: { code: number }) {
  const industry = useTwin((s) => s.industry);
  const flyTo = useTwin((s) => s.requestFlyTo);
  const close = useClose();
  const area = industry?.areas.find((a) => a.code === code);
  const target = useMemo<IndustrialTarget | null>(() => (area ? { kind: 'area', area } : null), [area]);
  if (!industry || !area || !target) return null;
  const sites = sitesInArea(area, industry.sites);
  const named = sites.filter((s) => s.name);
  const areaMismatch = area.areaHa != null && Math.abs(area.mappedAreaHa - area.areaHa) / area.areaHa > 0.08;
  const p = area.plots;
  return (
    <>
      <DrawerHeader
        kicker="MIDC industrial area"
        title={area.name}
        subtitle={`Code ${area.code}${area.fieldType ? `, ${area.fieldType.toLowerCase()}` : ''}, ${STATUS_LABEL[area.analysisArea].toLowerCase()}`}
        onClose={close}
      />
      <Section title="Estate">
        <MetricRow label="Area">{area.areaHa == null ? '—' : `${fmt(area.areaHa, 0)} ha`}</MetricRow>
        {areaMismatch && <MetricRow label="Mapped boundary area">{fmt(area.mappedAreaHa, 0)} ha</MetricRow>}
        {p && (
          <>
            <MetricRow label="Plots, total">{p.total ?? '—'}</MetricRow>
            <MetricRow label="Industrial plots">{p.industrial ?? '—'}</MetricRow>
            <MetricRow label="Allotted / vacant">
              {p.allotted ?? '—'} / {p.vacant ?? '—'}
            </MetricRow>
          </>
        )}
        {area.category && <MetricRow label="MIDC category">{area.category}</MetricRow>}
        {areaMismatch && <Note>The published area and the mapped boundary differ by more than 8%; both are shown as published.</Note>}
      </Section>
      <Section title="Mapped industry sites" right={<span className="text-[11.5px] text-sand-500">OSM, partial</span>}>
        <p className="text-[12.5px] text-sand-300">
          {sites.length ? `${sites.length} mapped site${sites.length === 1 ? '' : 's'} inside this estate${named.length ? `, ${named.length} named` : ''}.` : 'No mapped sites inside this estate in the partial snapshot.'}
        </p>
        {named.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-[12px] text-sand-200">
            {named.slice(0, 8).map((s) => (
              <li key={s.id} className="truncate">
                {s.name}
                {s.kind && <span className="text-sand-500"> ({s.kind})</span>}
              </li>
            ))}
            {named.length > 8 && <li className="text-sand-500">+{named.length - 8} more</li>}
          </ul>
        )}
        <Note>OpenStreetMap coverage is partial.</Note>
      </Section>
      <IndustrialScenarioControls key={area.code} target={target} />
      {area.era5 && <WeatherCases areaCode={area.code} />}
      <EmissionsEstimator />
      <section className="border-t hairline px-5 py-4">
        <Button className="w-full" onClick={() => flyTo(area.centroid, area.analysisArea === 'outside' ? 26000 : 9000)}>
          <Crosshair size={14} aria-hidden="true" /> Fly to
        </Button>
      </section>
      <div className="border-t hairline px-5 py-3 text-[11.5px] text-sand-500">Source: MIDC Pune Zone GIS (map layer 6, table 22).</div>
    </>
  );
}

export function IndustrySiteCard({ id }: { id: string }) {
  const industry = useTwin((s) => s.industry);
  const flyTo = useTwin((s) => s.requestFlyTo);
  const selectArea = useTwin((s) => s.selectIndustrialArea);
  const close = useClose();
  const site = industry?.sites.find((s) => s.id === id);
  const target = useMemo<IndustrialTarget | null>(() => (site ? { kind: 'site', site, radiusKm: SITE_RADIUS_KM } : null), [site]);
  if (!industry || !site || !target) return null;
  const area = site.midcCode !== null ? industry.areas.find((a) => a.code === site.midcCode) : undefined;
  const cluster = sitesNear(site.location, industry.sites, SITE_RADIUS_KM).filter((s: IndustrySite) => s.id !== site.id);
  return (
    <>
      <DrawerHeader kicker="Mapped industry site" title={site.name ?? 'Unnamed site'} subtitle={site.kind ? `OSM tag: ${site.kind}` : 'OpenStreetMap feature'} onClose={close} />
      <Section title="Site">
        <MetricRow label="Coordinates">
          {site.location[1].toFixed(4)}°N {site.location[0].toFixed(4)}°E
        </MetricRow>
        {site.operator && <MetricRow label="Operator">{site.operator}</MetricRow>}
        <MetricRow label="MIDC estate">
          {area ? (
            <button type="button" className="cursor-pointer text-accent-300 hover:underline" onClick={() => selectArea(area.code)}>
              {area.name}
            </button>
          ) : (
            'None'
          )}
        </MetricRow>
        <MetricRow label={`Other mapped sites within ${SITE_RADIUS_KM} km`}>{cluster.length}</MetricRow>
        <MetricRow label="In the modeled area">{site.inAnalysisArea ? 'Yes' : 'No'}</MetricRow>
        <Note>Mapped location only; no emissions data.</Note>
      </Section>
      <IndustrialScenarioControls key={site.id} target={target} />
      <section className="border-t hairline px-5 py-4">
        <Button className="w-full" onClick={() => flyTo(site.location, 3500)}>
          <Crosshair size={14} aria-hidden="true" /> Fly to
        </Button>
      </section>
      <div className="border-t hairline px-5 py-3 text-[11.5px] text-sand-500">© OpenStreetMap contributors (ODbL).</div>
    </>
  );
}
