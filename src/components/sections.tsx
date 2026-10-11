import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { useDisplayedStates, useTwin } from '../store/useTwinStore';
import { Block, Button, DataBadge, SectionHeader, Segmented, Stat, Disclaimer, TABLE } from './ui';
import { StationTable } from './StationPanels';
import { DistrictInventory, IndustrialAreasTable } from './IndustryPanels';
import { POLLUTANT_LABEL, POLLUTANT_UNIT, pollutionColor, rgbToCss } from '../utils/colors';
import { fmt, fmtInt } from '../utils/format';
import { zonePlaceNames } from '../utils/zones';
import type { Pollutant } from '../types';
import { majorRoads, roadMidpoint, roadTrafficLevel, trafficLevelLabel } from '../services/traffic';
import { useZoneValues } from '../services/liveData';
import { fmtIst } from '../services/pollutantData';

function useStatus() {
  const r = useTwin((s) => s.activeResult);
  const m = useTwin((s) => s.displayMode);
  return r && (m === 'scenario' || m === 'delta') ? ('MODELED_SCENARIO' as const) : ('DEMO' as const);
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

const digitsFor = (p: Pollutant) => (p === 'co' ? 2 : 0);

/** Enter / Space activate a selectable table row. */
function rowKeys(go: () => void) {
  return (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      go();
    }
  };
}

/** Select a zone everywhere at once: store selection (map highlight + drawer) and camera. */
function useSelectZone() {
  const base = useTwin((s) => s.base);
  const selectCell = useTwin((s) => s.selectCell);
  const flyTo = useTwin((s) => s.requestFlyTo);
  return (cellId: string) => {
    selectCell(cellId);
    const cell = base?.cells.find((c) => c.id === cellId);
    if (cell) flyTo(cell.center, 9000);
  };
}

/** Scroll the selected row into view when the selection comes from the map. */
function useRevealSelected(selected: string | null) {
  const body = useRef<HTMLTableSectionElement>(null);
  useEffect(() => {
    if (!selected) return;
    body.current?.querySelector<HTMLElement>(`[data-id="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  return body;
}

function ZoneName({ id, place }: { id: string; place?: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-semibold text-sand-50">{id}</span>
      {place && <span className="truncate text-[11.5px] text-sand-400">{place}</span>}
    </span>
  );
}

function ValueCell({ p, v }: { p: Pollutant; v: number }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="h-2 w-2 rounded-full" style={{ background: rgbToCss(pollutionColor(p, v)) }} aria-hidden="true" />
      <span className="num font-semibold text-sand-50">{fmt(v, digitsFor(p))}</span>
    </span>
  );
}

/**
 * Top hotspots: Zone, Zone type, value — rows select the zone on the map. Ranked from
 * one source and one time only: model data when it covers every zone, otherwise the
 * prototype model.
 */
function HotspotTable({ values, pollutant, limit }: { values: Map<string, number>; pollutant: Pollutant; limit: number }) {
  const base = useTwin((s) => s.base)!;
  const selected = useTwin((s) => s.selectedCellId);
  const selectZone = useSelectZone();
  const places = zonePlaceNames(base.cells);
  const byId = useMemo(() => new Map(base.cells.map((c) => [c.id, c])), [base]);
  const top = useMemo(
    () =>
      [...values.entries()]
        .map(([cellId, v]) => ({ cellId, v }))
        .sort((a, b) => b.v - a.v || a.cellId.localeCompare(b.cellId))
        .slice(0, limit),
    [values, limit],
  );
  return (
    <table className={TABLE.table}>
      <thead>
        <tr>
          <th className={`${TABLE.th} pl-5 text-left`}>Zone</th>
          <th className={`${TABLE.th} text-left`}>Zone type</th>
          <th className={`${TABLE.th} pr-5 text-right`}>
            {POLLUTANT_LABEL[pollutant]} <span className="font-normal text-sand-500">{POLLUTANT_UNIT[pollutant]}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {top.map((s) => {
          const active = selected === s.cellId;
          const go = () => selectZone(s.cellId);
          return (
            <tr
              key={s.cellId}
              tabIndex={0}
              aria-selected={active}
              onClick={go}
              onKeyDown={rowKeys(go)}
              className={`${TABLE.row} ${active ? TABLE.rowActive : ''}`}
            >
              <td className={`${TABLE.td} relative pl-5`}>
                {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-accent-500" aria-hidden="true" />}
                <ZoneName id={s.cellId} place={places.get(s.cellId)} />
              </td>
              <td className={`${TABLE.td} text-sand-300`}>{byId.get(s.cellId)?.landUse}</td>
              <td className={`${TABLE.td} pr-5 text-right`}>
                <ValueCell p={pollutant} v={s.v} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SourceTag({ zv }: { zv: ReturnType<typeof useZoneValues> }) {
  return zv.source === 'model_data' ? (
    <span className="inline-flex items-center gap-1.5" title="Open-Meteo CAMS model at each zone centre; neighbouring zones can share a value">
      <DataBadge status="MODEL_DATA" />
      <span className="num text-[11px] text-sand-500">{fmtIst(zv.time)}</span>
    </span>
  ) : (
    <span title="Current data isn't loaded; showing the prototype What-If baseline">
      <DataBadge status="DEMO" />
    </span>
  );
}

function HotspotHeader({ title, zv }: { title: string; zv: ReturnType<typeof useZoneValues> }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-5 pb-1 pt-4">
      <h3 className="text-[13px] font-semibold text-sand-200">{title}</h3>
      <SourceTag zv={zv} />
    </div>
  );
}

export function OverviewSection() {
  const states = useDisplayedStates();
  const zv = useZoneValues(states, 'pm25');
  const vals = [...zv.values.values()];
  const pm = mean(vals);
  const above = vals.filter((v) => v > 60).length;
  return (
    <>
      <SectionHeader title="Overview" />
      <StationTable pollutant="pm25" />
      <div className="border-t hairline pb-2">
        <HotspotHeader title="Top hotspots" zv={zv} />
        <div className="grid grid-cols-2 gap-4 px-5 pb-3 pt-1">
          <Stat label="Mean PM2.5 across zones" value={fmt(pm, 0)} unit="µg/m³" />
          <Stat label="Zones above 60 µg/m³" value={above} sub={`of ${vals.length}`} />
        </div>
        <HotspotTable values={zv.values} pollutant="pm25" limit={8} />
      </div>
    </>
  );
}

export function AirQualitySection() {
  const states = useDisplayedStates();
  const pollutant = useTwin((s) => s.pollutant);
  const zv = useZoneValues(states, pollutant);
  const setPollutant = useTwin((s) => s.setPollutant);
  return (
    <>
      <SectionHeader title="Air Quality" />
      <div className="px-5 pb-4">
        <div role="radiogroup" aria-label="Pollutant" className="flex flex-wrap gap-1.5">
          {(Object.keys(POLLUTANT_LABEL) as Pollutant[]).map((p) => {
            const on = p === pollutant;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPollutant(p)}
                className={`min-w-[52px] cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-150 ${
                  on ? 'bg-accent-500 text-white' : 'bg-sand-100/[0.06] text-sand-200 ring-1 ring-inset ring-sand-100/10 hover:bg-sand-100/[0.11]'
                }`}
              >
                {POLLUTANT_LABEL[p]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="border-t hairline">
        <StationTable pollutant={pollutant} />
      </div>
      <div className="border-t hairline pb-2">
        <HotspotHeader title="Hotspots" zv={zv} />
        <HotspotTable values={zv.values} pollutant={pollutant} limit={10} />
      </div>
    </>
  );
}

export function ZonesSection() {
  const states = useDisplayedStates();
  const zv = useZoneValues(states, 'pm25');
  const base = useTwin((s) => s.base)!;
  const gridSize = useTwin((s) => s.gridSize);
  const setGridSize = useTwin((s) => s.setGridSize);
  const selected = useTwin((s) => s.selectedCellId);
  const selectZone = useSelectZone();
  const places = zonePlaceNames(base.cells);
  const byId = useMemo(() => new Map(base.cells.map((c) => [c.id, c])), [base]);
  const body = useRevealSelected(selected);
  return (
    <>
      <SectionHeader title="Zones" />
      <div className="flex items-center justify-between gap-3 px-5 pb-4">
        <span className="text-[12.5px] text-sand-300">Grid</span>
        <Segmented<string>
          label="Grid resolution"
          value={String(gridSize)}
          onChange={(v) => setGridSize(Number(v))}
          options={[
            { value: '5', label: '5×5' },
            { value: '10', label: '10×10' },
          ]}
        />
      </div>
      <div className="border-t hairline pb-2">
        <div className="flex items-baseline justify-between gap-2 px-5 pb-1 pt-4">
          <h3 className="text-[13px] font-semibold text-sand-200">All zones</h3>
          <SourceTag zv={zv} />
        </div>
        <table className={TABLE.table}>
          <thead>
            <tr>
              <th className={`${TABLE.th} pl-5 text-left`}>Zone</th>
              <th className={`${TABLE.th} text-left`}>Type</th>
              <th className={`${TABLE.th} text-right`} title={zv.source === 'model_data' ? `Open-Meteo CAMS model data, ${fmtIst(zv.time)} IST` : 'Prototype model, demo inputs'}>
                PM2.5
              </th>
              <th className={`${TABLE.th} text-right`} title="Traffic intensity index, 0–100">Traffic</th>
              <th className={`${TABLE.th} pr-5 text-right`}>Green</th>
            </tr>
          </thead>
          <tbody ref={body}>
            {states.map((s) => {
              const c = byId.get(s.cellId);
              const active = selected === s.cellId;
              const go = () => selectZone(s.cellId);
              return (
                <tr
                  key={s.cellId}
                  data-id={s.cellId}
                  tabIndex={0}
                  aria-selected={active}
                  onClick={go}
                  onKeyDown={rowKeys(go)}
                  className={`${TABLE.row} ${active ? TABLE.rowActive : ''}`}
                >
                  <td className={`${TABLE.td} relative pl-5`}>
                    {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-accent-500" aria-hidden="true" />}
                    <ZoneName id={s.cellId} place={places.get(s.cellId)} />
                  </td>
                  <td className={`${TABLE.td} text-sand-300`}>{c?.landUse}</td>
                  <td className={`${TABLE.td} text-right`}>
                    <span className="inline-flex items-center justify-end gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: rgbToCss(pollutionColor('pm25', zv.values.get(s.cellId) ?? s.pm25)) }} aria-hidden="true" />
                      <span className="num font-semibold text-sand-50">{fmt(zv.values.get(s.cellId) ?? NaN, 0)}</span>
                    </span>
                  </td>
                  <td className={`${TABLE.td} num text-right text-sand-300`}>{fmt(s.trafficIntensity, 0)}</td>
                  <td className={`${TABLE.td} num pr-5 text-right text-sand-300`}>{fmt(s.greenCover, 0)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function TrafficSection() {
  const base = useTwin((s) => s.base)!;
  const states = useDisplayedStates();
  const flyTo = useTwin((s) => s.requestFlyTo);
  const setSection = useTwin((s) => s.setSection);
  const status = useStatus();
  const byId = new Map(states.map((s) => [s.cellId, s]));
  const isOsm = base.geometrySource === 'osm';
  const rows = majorRoads(base, 30)
    .map((r) => ({ r, level: roadTrafficLevel(r, base, byId) }))
    .sort((a, b) => b.level - a.level);
  return (
    <>
      <SectionHeader title="Traffic" subtitle="Major corridors and modeled traffic intensity" right={<DataBadge status={status} />} />
      <Block>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Mean traffic index" value={fmt(mean(states.map((s) => s.trafficIntensity)), 0)} unit="/100" />
          <Stat
            label={isOsm ? 'OSM roads' : 'Corridors'}
            value={base.roads.length}
            sub={isOsm ? `${fmt(base.roads.reduce((a, r) => a + (r.lengthKm ?? 0), 0), 0)} km, real geometry` : 'demo digitised'}
          />
        </div>
      </Block>
      <Block title={isOsm ? 'Major named roads (top 30)' : 'Corridors'}>
        <div className="space-y-0.5">
          {rows.map(({ r, level }) => {
            const { label, color } = trafficLevelLabel(level);
            return (
              <button
                key={r.id}
                onClick={() => flyTo(roadMidpoint(r), 12000)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-sand-100/[0.05]"
              >
                <span className="h-1.5 w-4 rounded" style={{ background: color }} />
                <span className="truncate text-sand-200">{r.name}</span>
                <span className="ml-auto text-[11px] font-semibold text-sand-300">{label}</span>
                <span className="num w-7 text-right text-sand-400">{fmt(level, 0)}</span>
              </button>
            );
          })}
        </div>
      </Block>
      <Block>
        <Button variant="primary" className="w-full" onClick={() => setSection('simulator')}>
          Modify traffic in What-If <ArrowRight size={14} />
        </Button>
        <Disclaimer>
          {isOsm
            ? 'Road geometry © OpenStreetMap contributors. Traffic volumes are a demo proxy from road class and density.'
            : 'Corridor geometry is approximate demo data. Load real OSM roads from Data.'}
        </Disclaimer>
      </Block>
    </>
  );
}

export function IndustriesSection() {
  const base = useTwin((s) => s.base)!;
  const selectIndustry = useTwin((s) => s.selectIndustry);
  const selectedId = useTwin((s) => s.selectedIndustryId);
  const flyTo = useTwin((s) => s.requestFlyTo);
  const setSection = useTwin((s) => s.setSection);
  const setLeftOpen = useTwin((s) => s.setLeftOpen);
  const setInteraction = useTwin((s) => s.setInteraction);
  const sorted = useMemo(() => [...base.industries].sort((a, b) => b.emissionIntensity - a.emissionIntensity), [base]);
  const illustrative = base.industries.some((i) => i.status === 'DEMO');
  const body = useRevealSelected(selectedId);
  const layers = useTwin((s) => s.layers);
  const toggleLayer = useTwin((s) => s.toggleLayer);
  // Show the industrial geography on the map while this screen is open (once per visit).
  useEffect(() => {
    if (!layers.midcAreas) toggleLayer('midcAreas');
    if (!layers.industrySites) toggleLayer('industrySites');
    // Runs on entry only, so turning a layer off while here is respected.
  }, []);
  return (
    <>
      <SectionHeader title="Industries" />
      <IndustrialAreasTable />
      <div className="border-t hairline pb-2">
        <div className="flex items-baseline justify-between gap-2 px-5 pb-1 pt-4">
          <h3 className="text-[13px] font-semibold text-sand-200">Modeled sources</h3>
          <DataBadge status="DEMO" />
        </div>
        {illustrative && (
          <p className="px-5 pb-2 text-[12px] text-sand-400" title="Names and intensities come from the prototype dataset, not a verified registry.">
            Illustrative sources used by What-If.
          </p>
        )}
        <table className={TABLE.table}>
          <thead>
            <tr>
              <th className={`${TABLE.th} pl-5 text-left`}>Source</th>
              <th className={`${TABLE.th} pr-5 text-right`} title="Emission intensity index, 0–100">Intensity</th>
            </tr>
          </thead>
          <tbody ref={body}>
            {sorted.map((i) => {
              const active = selectedId === i.id;
              const go = () => {
                selectIndustry(i.id);
                flyTo(i.location, 5000);
              };
              return (
                <tr
                  key={i.id}
                  data-id={i.id}
                  tabIndex={0}
                  aria-selected={active}
                  onClick={go}
                  onKeyDown={rowKeys(go)}
                  className={`${TABLE.row} ${active ? TABLE.rowActive : ''}`}
                >
                  <td className={`${TABLE.td} relative pl-5`}>
                    {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-accent-500" aria-hidden="true" />}
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold leading-snug text-sand-50">{i.name}</span>
                      <span className="text-[11.5px] text-sand-400">
                        {i.category}, {i.id}
                      </span>
                    </span>
                  </td>
                  <td className={`${TABLE.td} pr-5`}>
                    <span className="flex items-center justify-end gap-2">
                      <span className="hidden h-1 w-10 overflow-hidden rounded-full bg-sand-100/10 sm:block" aria-hidden="true">
                        <span className="block h-full rounded-full bg-accent-400" style={{ width: `${i.emissionIntensity}%` }} />
                      </span>
                      <span className="num w-7 text-right font-semibold text-sand-50">{i.emissionIntensity}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <DistrictInventory />
      <div className="px-5 pb-5 pt-2">
        <Button
          className="w-full"
          onClick={() => {
            setSection('simulator');
            setLeftOpen(true);
            setInteraction('add-industry');
          }}
        >
          <Plus size={14} aria-hidden="true" /> Place a new industry in What-If
        </Button>
      </div>
    </>
  );
}

export function GreenSection() {
  const base = useTwin((s) => s.base)!;
  const states = useDisplayedStates();
  const flyTo = useTwin((s) => s.requestFlyTo);
  const setSection = useTwin((s) => s.setSection);
  const status = useStatus();
  const green = states.map((s) => s.greenCover);
  const low = states.filter((s) => s.greenCover < 15).length;
  return (
    <>
      <SectionHeader title="Green cover" subtitle="Vegetation and open green areas" right={<DataBadge status={status} />} />
      <Block>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Mean cover" value={fmt(mean(green), 0)} unit="%" tone="text-emerald-300" />
          <Stat label="Low-green zones" value={low} sub="< 15%" />
          <Stat label="Green areas" value={base.greenAreas.length} />
        </div>
      </Block>
      <Block title="Mapped green areas (approx.)">
        <div className="space-y-0.5">
          {base.greenAreas.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                const c = g.polygon.reduce((a, p) => [a[0] + p[0] / g.polygon.length, a[1] + p[1] / g.polygon.length], [0, 0]);
                flyTo(c as [number, number], 5000);
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-sand-200 hover:bg-sand-100/[0.05]"
            >
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/70" />
              {g.name}
            </button>
          ))}
        </div>
      </Block>
      <Block title="Least-green zones">
        <div className="space-y-1 text-[12.5px]">
          {[...states]
            .sort((a, b) => a.greenCover - b.greenCover)
            .slice(0, 5)
            .map((s) => (
              <div key={s.cellId} className="flex items-center gap-2 px-2">
                <span className="font-semibold text-sand-200">{s.cellId}</span>
                <div className="h-1 flex-1 rounded-full bg-sand-100/10">
                  <div className="h-1 rounded-full bg-emerald-400" style={{ width: `${s.greenCover}%` }} />
                </div>
                <span className="num w-10 text-right text-sand-400">{fmt(s.greenCover, 0)}%</span>
                <span className="num w-10 text-right text-sand-500">{fmtInt(s.pm25)}</span>
              </div>
            ))}
        </div>
      </Block>
      <Block>
        <Button variant="primary" className="w-full" onClick={() => setSection('simulator')}>
          Simulate tree removal or a green buffer <ArrowRight size={14} />
        </Button>
      </Block>
    </>
  );
}
