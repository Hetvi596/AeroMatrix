import { useMemo } from 'react';
import { ArrowRight, Droplets, Gauge, Thermometer, Wind, CloudRain, Navigation } from 'lucide-react';
import { useDisplayedStates, useTwin } from '../store/useTwinStore';
import { Block, Button, DataBadge, SectionHeader, Segmented, Stat, Disclaimer } from './ui';
import { POLLUTANT_LABEL, POLLUTANT_UNIT, RISK_COLOR, RISK_LABEL, pollutionColor, rgbToCss } from '../utils/colors';
import { fmt, fmtInt } from '../utils/format';
import type { CellState, RiskLevel } from '../types';

function useStatus() {
  const r = useTwin((s) => s.activeResult);
  const m = useTwin((s) => s.displayMode);
  return r && m !== 'baseline' ? ('MODELED_SCENARIO' as const) : ('DEMO' as const);
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function RiskBar({ states }: { states: CellState[] }) {
  const counts: Record<RiskLevel, number> = { LOW: 0, MODERATE: 0, HIGH: 0, VERY_HIGH: 0 };
  states.forEach((s) => counts[s.risk]++);
  const total = states.length || 1;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {(Object.keys(counts) as RiskLevel[]).map((k) => (
          <div key={k} style={{ width: `${(counts[k] / total) * 100}%`, background: RISK_COLOR[k] }} />
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-1 text-[10.5px]">
        {(Object.keys(counts) as RiskLevel[]).map((k) => (
          <div key={k} className="text-slate-400">
            <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: RISK_COLOR[k] }} />
            {RISK_LABEL[k]} <span className="num text-slate-200">{counts[k]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HotspotList({ states, limit = 6 }: { states: CellState[]; limit?: number }) {
  const pollutant = useTwin((s) => s.pollutant);
  const base = useTwin((s) => s.base);
  const selectCell = useTwin((s) => s.selectCell);
  const flyTo = useTwin((s) => s.requestFlyTo);
  const top = [...states].sort((a, b) => b[pollutant] - a[pollutant]).slice(0, limit);
  return (
    <div className="space-y-1">
      {top.map((s, i) => {
        const cell = base?.cells.find((c) => c.id === s.cellId);
        return (
          <button
            key={s.cellId}
            onClick={() => {
              selectCell(s.cellId);
              if (cell) flyTo(cell.center, 9000);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-ink-800"
          >
            <span className="w-4 text-[10px] text-slate-500">{i + 1}</span>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: rgbToCss(pollutionColor(pollutant, s[pollutant])) }} />
            <span className="font-mono text-slate-200">{s.cellId}</span>
            <span className="truncate text-[11px] text-slate-500">{cell?.landUse}</span>
            <span className="num ml-auto text-slate-100">{fmt(s[pollutant], pollutant === 'co' ? 2 : 0)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function WeatherBlock() {
  const w = useTwin((s) => s.draft?.weather ?? s.base?.weather);
  if (!w) return null;
  const items = [
    { icon: Thermometer, label: 'Temp', v: `${fmt(w.temperature, 0)}°C` },
    { icon: Wind, label: 'Wind', v: `${fmt(w.windSpeed)} m/s` },
    { icon: Navigation, label: 'From', v: `${fmt(w.windDirection, 0)}°`, rot: w.windDirection + 180 },
    { icon: Droplets, label: 'Humidity', v: `${fmt(w.humidity, 0)}%` },
    { icon: CloudRain, label: 'Rain', v: `${fmt(w.rainfall)} mm` },
    { icon: Gauge, label: 'Pressure', v: `${fmt(w.pressure, 0)} hPa` },
  ];
  return (
    <Block title="Meteorology" right={<DataBadge status="DEMO" />}>
      <div className="grid grid-cols-3 gap-2">
        {items.map(({ icon: Icon, label, v, rot }) => (
          <div key={label} className="rounded-md bg-ink-800/70 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <Icon size={11} style={rot !== undefined ? { transform: `rotate(${rot - 45}deg)` } : undefined} />
              {label}
            </div>
            <div className="num text-[12.5px] font-medium text-slate-200">{v}</div>
          </div>
        ))}
      </div>
      <Disclaimer>Placeholder for ERA5 reanalysis. Editable in the What-If simulator.</Disclaimer>
    </Block>
  );
}

export function OverviewSection() {
  const states = useDisplayedStates();
  const base = useTwin((s) => s.base)!;
  const status = useStatus();
  const setSection = useTwin((s) => s.setSection);
  const pm = mean(states.map((s) => s.pm25));
  const high = states.filter((s) => s.risk === 'HIGH' || s.risk === 'VERY_HIGH');
  const popHigh = high.reduce((a, s) => a + (base.cells.find((c) => c.id === s.cellId)?.population ?? 0), 0);
  return (
    <>
      <SectionHeader title="City overview" subtitle={`${base.city.name} analysis area · ${base.gridSize}×${base.gridSize} grid · ${base.cells.length} zones`} right={<DataBadge status={status} />} />
      <Block>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Mean PM2.5" value={fmt(pm, 0)} unit="µg/m³" />
          <Stat label="High-risk zones" value={high.length} sub={`of ${states.length}`} tone="text-orange-300" />
          <Stat label="Pop. in high zones" value={`${fmt(popHigh / 1e5, 1)}L`} sub="demo estimate" />
        </div>
      </Block>
      <Block title="Risk distribution (PM2.5)">
        <RiskBar states={states} />
      </Block>
      <Block title="Top hotspots">
        <HotspotList states={states} limit={5} />
      </Block>
      <WeatherBlock />
      <Block title="Quick start">
        <div className="space-y-1.5">
          {[
            ['Click any grid cell on the map to inspect a zone', null],
            ['Model a what-if scenario', 'simulator'],
            ['Compare pollution-reduction actions', 'actions'],
            ['Compare candidate sites for a new industry', 'locations'],
          ].map(([t, s]) => (
            <button
              key={t}
              disabled={!s}
              onClick={() => s && setSection(s as never)}
              className="flex w-full items-center gap-2 rounded-md bg-ink-800/60 px-2.5 py-2 text-left text-[11.5px] text-slate-300 enabled:hover:bg-ink-700"
            >
              {t}
              {s && <ArrowRight size={12} className="ml-auto text-cyan-400" />}
            </button>
          ))}
        </div>
      </Block>
      <Block>
        <Disclaimer>
          All environmental values are DEMO / SIMULATED and deterministic. They are not CPCB observations. Base map, roads, labels
          and terrain come from open map services; environmental features are approximate demo geometry.
        </Disclaimer>
      </Block>
    </>
  );
}

export function AirQualitySection() {
  const states = useDisplayedStates();
  const pollutant = useTwin((s) => s.pollutant);
  const setPollutant = useTwin((s) => s.setPollutant);
  const status = useStatus();
  const vals = states.map((s) => s[pollutant]);
  const digits = pollutant === 'co' ? 2 : 0;
  return (
    <>
      <SectionHeader title="Air quality" subtitle="Gridded pollutant fields for the analysis area" right={<DataBadge status={status} />} />
      <Block title="Indicator">
        <div className="flex flex-wrap gap-1">
          {(Object.keys(POLLUTANT_LABEL) as (keyof typeof POLLUTANT_LABEL)[]).map((p) => (
            <Button key={p} variant={p === pollutant ? 'primary' : 'default'} onClick={() => setPollutant(p)} className="!px-2 !py-1">
              {POLLUTANT_LABEL[p]}
            </Button>
          ))}
        </div>
      </Block>
      <Block>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Mean" value={fmt(mean(vals), digits)} unit={POLLUTANT_UNIT[pollutant]} />
          <Stat label="Max" value={fmt(Math.max(...vals), digits)} tone="text-rose-300" />
          <Stat label="Min" value={fmt(Math.min(...vals), digits)} tone="text-emerald-300" />
        </div>
      </Block>
      <Block title="PM2.5 risk bands">
        <RiskBar states={states} />
        <Disclaimer>Bands follow Indian NAQI PM2.5 breakpoints (30 / 60 / 90 µg/m³) for display only.</Disclaimer>
      </Block>
      <Block title={`Hotspots · ${POLLUTANT_LABEL[pollutant]}`}>
        <HotspotList states={states} limit={10} />
      </Block>
      <Block>
        <Disclaimer>
          Future: CPCB CAAQMS station observations (OBSERVED) interpolated to the grid; ML forecasts labelled MODEL PREDICTION.
        </Disclaimer>
      </Block>
    </>
  );
}

export function ZonesSection() {
  const states = useDisplayedStates();
  const base = useTwin((s) => s.base)!;
  const gridSize = useTwin((s) => s.gridSize);
  const setGridSize = useTwin((s) => s.setGridSize);
  const selected = useTwin((s) => s.selectedCellId);
  const selectCell = useTwin((s) => s.selectCell);
  const flyTo = useTwin((s) => s.requestFlyTo);
  const pollutant = useTwin((s) => s.pollutant);
  const status = useStatus();
  const n = base.gridSize;
  return (
    <>
      <SectionHeader title="Pollution zones" subtitle="Configurable spatial analysis grid" right={<DataBadge status={status} />} />
      <Block title="Grid resolution">
        <Segmented<string>
          value={String(gridSize)}
          onChange={(v) => setGridSize(Number(v))}
          options={[
            { value: '5', label: '5×5' },
            { value: '10', label: '10×10' },
            { value: '20', label: '20×20' },
          ]}
        />
        <Disclaimer>Changing resolution rebuilds the grid and clears the active scenario.</Disclaimer>
      </Block>
      <Block title="Zone matrix" right={<span className="text-[10px] text-slate-500">{POLLUTANT_LABEL[pollutant]} · click to select</span>}>
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {states.map((s) => (
            <button
              key={s.cellId}
              title={`${s.cellId}: ${fmt(s[pollutant])}`}
              onClick={() => {
                selectCell(s.cellId);
                const c = base.cells.find((x) => x.id === s.cellId);
                if (c) flyTo(c.center, 9000);
              }}
              className={`aspect-square rounded-[2px] ${selected === s.cellId ? 'ring-2 ring-cyan-300' : ''}`}
              style={{ background: rgbToCss(pollutionColor(pollutant, s[pollutant]), 0.85) }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-500">
          <span>NW</span>
          <span>North ↑</span>
          <span>NE</span>
        </div>
      </Block>
      <Block title="All zones">
        <div className="max-h-[320px] overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-ink-900 text-slate-500">
              <tr>
                <th className="py-1 text-left font-medium">Zone</th>
                <th className="text-left font-medium">Use</th>
                <th className="text-right font-medium">PM2.5</th>
                <th className="text-right font-medium">Traffic</th>
                <th className="text-right font-medium">Green</th>
              </tr>
            </thead>
            <tbody>
              {states.map((s) => {
                const c = base.cells.find((x) => x.id === s.cellId)!;
                return (
                  <tr
                    key={s.cellId}
                    onClick={() => selectCell(s.cellId)}
                    className={`cursor-pointer border-t border-ink-800 hover:bg-ink-800 ${selected === s.cellId ? 'bg-cyan-500/10' : ''}`}
                  >
                    <td className="py-1 font-mono text-slate-200">{s.cellId}</td>
                    <td className="text-slate-500">{c.landUse}</td>
                    <td className="num text-right" style={{ color: RISK_COLOR[s.risk] }}>{fmt(s.pm25, 0)}</td>
                    <td className="num text-right text-slate-300">{fmt(s.trafficIntensity, 0)}</td>
                    <td className="num text-right text-emerald-300">{fmt(s.greenCover, 0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Block>
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
  const rows = base.roads
    .map((r) => {
      const cells = base.cells.filter((c) => (c.trafficByRoad[r.id] ?? 0) > 20);
      const level = cells.length ? mean(cells.map((c) => byId.get(c.id)?.trafficIntensity ?? 0)) : r.volume * 0.6;
      return { r, level };
    })
    .sort((a, b) => b.level - a.level);
  const lvl = (v: number) => (v < 40 ? ['LOW', '#22c55e'] : v < 60 ? ['MEDIUM', '#facc15'] : v < 80 ? ['HIGH', '#f97316'] : ['VERY HIGH', '#ef4444']);
  return (
    <>
      <SectionHeader title="Traffic" subtitle="Major corridors & modeled traffic intensity" right={<DataBadge status={status} />} />
      <Block>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Mean traffic index" value={fmt(mean(states.map((s) => s.trafficIntensity)), 0)} unit="/100" />
          <Stat label="Corridors" value={base.roads.length} sub="demo digitised" />
        </div>
      </Block>
      <Block title="Corridors">
        <div className="space-y-1">
          {rows.map(({ r, level }) => {
            const [label, color] = lvl(level);
            return (
              <button
                key={r.id}
                onClick={() => flyTo(r.path[Math.floor(r.path.length / 2)], 12000)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] hover:bg-ink-800"
              >
                <span className="h-1.5 w-4 rounded" style={{ background: color }} />
                <span className="truncate text-slate-200">{r.name}</span>
                <span className="ml-auto text-[10px] font-semibold" style={{ color }}>{label}</span>
                <span className="num w-7 text-right text-slate-400">{fmt(level, 0)}</span>
              </button>
            );
          })}
        </div>
      </Block>
      <Block>
        <Button variant="primary" className="w-full" onClick={() => setSection('simulator')}>
          Modify traffic in What-If simulator <ArrowRight size={13} />
        </Button>
        <Disclaimer>Corridor geometry is approximate. The Roads layer shows the real OSM-derived road network (Esri). Future: live traffic API / counts.</Disclaimer>
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
  const setInteraction = useTwin((s) => s.setInteraction);
  const sorted = useMemo(() => [...base.industries].sort((a, b) => b.emissionIntensity - a.emissionIntensity), [base]);
  return (
    <>
      <SectionHeader title="Industries" subtitle={`${base.industries.length} demo industrial sources`} right={<DataBadge status="DEMO" />} />
      <Block title="Sources (by intensity)">
        <div className="space-y-1">
          {sorted.map((i) => (
            <button
              key={i.id}
              onClick={() => {
                selectIndustry(i.id);
                flyTo(i.location, 5000);
              }}
              className={`w-full rounded-md px-2 py-1.5 text-left hover:bg-ink-800 ${selectedId === i.id ? 'bg-cyan-500/10 ring-1 ring-cyan-400/30' : ''}`}
            >
              <div className="flex items-center gap-2 text-[11.5px]">
                <span className="font-mono text-[10.5px] text-slate-500">{i.id}</span>
                <span className="truncate text-slate-200">{i.name}</span>
                <span className="num ml-auto text-slate-300">{i.emissionIntensity}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[10px] text-slate-500">{i.category}</span>
                <div className="h-1 flex-1 rounded-full bg-ink-700">
                  <div className="h-1 rounded-full bg-violet-400" style={{ width: `${i.emissionIntensity}%` }} />
                </div>
              </div>
            </button>
          ))}
        </div>
      </Block>
      <Block>
        <Button
          variant="primary"
          className="w-full"
          onClick={() => {
            setSection('simulator');
            setInteraction('add-industry');
          }}
        >
          Place a new industry (what-if) <ArrowRight size={13} />
        </Button>
        <Disclaimer>Industry names and emissions are fictional demo records. Future: MPCB/CPCB consent registry + emission inventory.</Disclaimer>
      </Block>
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
      <SectionHeader title="Green cover" subtitle="Vegetation & open green areas" right={<DataBadge status={status} />} />
      <Block>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Mean cover" value={fmt(mean(green), 0)} unit="%" tone="text-emerald-300" />
          <Stat label="Low-green zones" value={low} sub="< 15%" tone="text-amber-300" />
          <Stat label="Green areas" value={base.greenAreas.length} />
        </div>
      </Block>
      <Block title="Mapped green areas (approx.)">
        <div className="space-y-1">
          {base.greenAreas.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                const c = g.polygon.reduce((a, p) => [a[0] + p[0] / g.polygon.length, a[1] + p[1] / g.polygon.length], [0, 0]);
                flyTo(c as [number, number], 5000);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] text-slate-200 hover:bg-ink-800"
            >
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/70" />
              {g.name}
            </button>
          ))}
        </div>
      </Block>
      <Block title="Least-green zones">
        <div className="space-y-1 text-[11.5px]">
          {[...states]
            .sort((a, b) => a.greenCover - b.greenCover)
            .slice(0, 5)
            .map((s) => (
              <div key={s.cellId} className="flex items-center gap-2 px-2">
                <span className="font-mono text-slate-300">{s.cellId}</span>
                <div className="h-1 flex-1 rounded-full bg-ink-700">
                  <div className="h-1 rounded-full bg-emerald-400" style={{ width: `${s.greenCover}%` }} />
                </div>
                <span className="num w-10 text-right text-slate-400">{fmt(s.greenCover, 0)}%</span>
                <span className="num w-10 text-right text-slate-500">{fmtInt(s.pm25)}</span>
              </div>
            ))}
        </div>
      </Block>
      <Block>
        <Button variant="primary" className="w-full" onClick={() => setSection('simulator')}>
          Simulate tree removal / green buffer <ArrowRight size={13} />
        </Button>
        <Disclaimer>Future: ESA WorldCover / Sentinel-2 NDVI-derived green cover per cell.</Disclaimer>
      </Block>
    </>
  );
}
