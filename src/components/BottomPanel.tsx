import { useEffect, useMemo, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTwin } from '../store/useTwinStore';
import { observedSeries } from '../services/observations';
import { DataBadge, Segmented } from './ui';
import { RegionScenarioBlock } from './RegionScenarioPanels';
import { POLLUTANT_LABEL, POLLUTANT_UNIT } from '../utils/colors';
import { SERIES, axisProps, gridProps, tooltipStyle } from '../analytics/chartTheme';

type Tab = 'timeseries' | 'beforeafter';

/**
 * Time series: imported station observations when present; otherwise the region's
 * measured value and trained-model +24 h forecast with the scenario (no synthetic series).
 */
function TimeSeriesChart() {
  const pollutant = useTwin((s) => s.pollutant);
  const cellId = useTwin((s) => s.selectedCellId);
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('24h');
  const ds = useTwin((s) => s.observations);
  const summaries = useTwin((s) => s.stationSummaries);
  const base = useTwin((s) => s.base);
  const observed = useMemo(
    () => (ds && base ? observedSeries(ds, summaries, pollutant, base, cellId, range === '24h' ? 1 : range === '7d' ? 7 : 30) : null),
    [ds, summaries, pollutant, base, cellId, range],
  );

  if (!observed) {
    return (
      <div className="panel-scroll h-full px-1">
        <RegionScenarioBlock compact />
      </div>
    );
  }
  const data = observed.points.map((p) => ({ t: p.t, observed: +p.value.toFixed(2) }));
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-1 pb-1">
        <span className="text-[12px] font-medium text-sand-200">
          {POLLUTANT_LABEL[pollutant]}, {cellId ? `zone ${cellId}` : 'city'} <span className="font-normal text-sand-500">{observed.label}</span>
        </span>
        <DataBadge status="OBSERVED" />
        <div className="ml-auto">
          <Segmented<'24h' | '7d' | '30d'>
            size="xs"
            value={range}
            onChange={setRange}
            options={[
              { value: '24h', label: '24 h' },
              { value: '7d', label: '7 d' },
              { value: '30d', label: '30 d' },
            ]}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 6, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="t" {...axisProps} minTickGap={18} />
            <YAxis {...axisProps} />
            <Tooltip {...tooltipStyle} formatter={(v) => [`${v} ${POLLUTANT_UNIT[pollutant]}`, 'Observed']} />
            <Line type="monotone" dataKey="observed" stroke={SERIES.observed} strokeWidth={1.8} dot={false} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function BeforeAfterChart() {
  const result = useTwin((s) => s.activeResult);
  const pollutant = useTwin((s) => s.pollutant);
  const selectCell = useTwin((s) => s.selectCell);
  if (!result) {
    return (
      <div className="grid h-full place-items-center text-[12px] text-sand-500">
        Run a scenario in the What-If simulator to see baseline vs modeled scenario per zone.
      </div>
    );
  }
  const rows = result.scenario
    .map((s, i) => ({ id: s.cellId, b: result.baseline[i][pollutant], s: s[pollutant], d: s[pollutant] - result.baseline[i][pollutant] }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 16)
    .map((r) => ({ name: r.id, Baseline: +r.b.toFixed(1), Scenario: +r.s.toFixed(1), delta: +r.d.toFixed(2) }));
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-1 pb-1">
        <span className="text-[11.5px] font-medium text-sand-200">
          {POLLUTANT_LABEL[pollutant]} — most-changed zones · {result.params.name}
        </span>
        <DataBadge status="MODELED_SCENARIO" />
        <span className="ml-auto text-[11px] text-sand-500">Click a bar to select its zone</span>
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer>
          <BarChart
            data={rows}
            margin={{ top: 6, right: 12, left: -18, bottom: 0 }}
            onClick={(e) => {
              const label = (e as { activeLabel?: string } | null)?.activeLabel;
              if (label) selectCell(String(label));
            }}
          >
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...axisProps} interval={0} tick={{ fill: '#9c8580', fontSize: 10 }} />
            <YAxis {...axisProps} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="Baseline" fill={SERIES.baseline} radius={[2, 2, 0, 0]} />
            <Bar dataKey="Scenario" fill={SERIES.scenario} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Insights drawer: a slim always-visible bar; expands to charts. */
export function BottomPanel() {
  const result = useTwin((s) => s.activeResult);
  const open = useTwin((s) => s.bottomOpen);
  const setOpen = useTwin((s) => s.setBottomOpen);
  const [tab, setTab] = useState<Tab>('timeseries');
  const hasResult = !!result;
  useEffect(() => {
    if (hasResult) {
      setTab('beforeafter');
      setOpen(true);
    }
  }, [hasResult, setOpen]);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 px-4">
        <span className="text-[12.5px] font-semibold text-sand-100">Insights</span>
        <Segmented<Tab>
          size="xs"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setOpen(true);
          }}
          options={[
            { value: 'timeseries', label: 'Forecast' },
            { value: 'beforeafter', label: 'Before vs after' },
          ]}
        />
        <button
          onClick={() => setOpen(!open)}
          className="ml-auto flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-medium text-sand-300 ring-1 ring-inset ring-sand-100/10 hover:text-sand-50" aria-expanded={open}
          title={open ? 'Collapse charts' : 'Expand charts'}
        >
          {open ? 'Hide' : 'Show'} <ChevronUp size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && <div className="min-h-0 flex-1 px-3 pb-2 animate-fade">{tab === 'timeseries' ? <TimeSeriesChart /> : <BeforeAfterChart />}</div>}
    </div>
  );
}
