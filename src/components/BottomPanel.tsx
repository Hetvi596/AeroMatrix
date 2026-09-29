import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTwin } from '../store/useTwinStore';
import { dataProvider, type TimeRange } from '../services/dataProvider';
import type { TimePoint } from '../types';
import { DataBadge, Segmented } from './ui';
import { POLLUTANT_LABEL, POLLUTANT_UNIT } from '../utils/colors';
import { axisProps, gridProps, tooltipStyle } from '../analytics/chartTheme';

type Tab = 'timeseries' | 'beforeafter';

function TimeSeriesChart() {
  const pollutant = useTwin((s) => s.pollutant);
  const cellId = useTwin((s) => s.selectedCellId);
  const baseline = useTwin((s) => s.baseline);
  const result = useTwin((s) => s.activeResult);
  const mode = useTwin((s) => s.displayMode);
  const [range, setRange] = useState<TimeRange>('24h');
  const [series, setSeries] = useState<TimePoint[]>([]);

  const ref = useMemo(() => {
    if (cellId) return baseline.find((s) => s.cellId === cellId)?.[pollutant] ?? 0;
    return baseline.reduce((a, s) => a + s[pollutant], 0) / Math.max(1, baseline.length);
  }, [cellId, baseline, pollutant]);

  const scnRef = useMemo(() => {
    if (!result || mode === 'baseline') return null;
    const xs = result.scenario;
    if (cellId) return xs.find((s) => s.cellId === cellId)?.[pollutant] ?? null;
    return xs.reduce((a, s) => a + s[pollutant], 0) / Math.max(1, xs.length);
  }, [result, mode, cellId, pollutant]);

  useEffect(() => {
    let alive = true;
    dataProvider.getTimeSeries(cellId ?? 'city', pollutant, ref, range).then((s) => alive && setSeries(s));
    return () => {
      alive = false;
    };
  }, [cellId, pollutant, ref, range]);

  const data = [
    ...series.map((p) => ({ t: p.t, demo: +p.value.toFixed(2) })),
    // Forecast window placeholder (no values — model not trained)
    ...Array.from({ length: range === '24h' ? 6 : range === '7d' ? 2 : 5 }, (_, i) => ({ t: `+${i + 1}${range === '24h' ? 'h' : 'd'}`, demo: null as number | null })),
  ];
  const firstForecast = data[series.length]?.t;
  const lastForecast = data[data.length - 1]?.t;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-1 pb-1">
        <span className="text-[11.5px] font-medium text-slate-200">
          {POLLUTANT_LABEL[pollutant]} · {cellId ? `Zone ${cellId}` : 'City mean'}
        </span>
        <DataBadge status="DEMO" />
        <span className="text-[10px] text-slate-500">Past → Present → Forecast</span>
        <div className="ml-auto">
          <Segmented<TimeRange>
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
            <defs>
              <linearGradient id="tsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="t" {...axisProps} minTickGap={18} />
            <YAxis {...axisProps} />
            <Tooltip {...tooltipStyle} formatter={(v) => [`${v} ${POLLUTANT_UNIT[pollutant]}`, 'Demo series']} />
            {firstForecast && (
              <ReferenceArea
                x1={firstForecast}
                x2={lastForecast}
                fill="#38bdf8"
                fillOpacity={0.06}
                stroke="#38bdf8"
                strokeOpacity={0.3}
                strokeDasharray="4 4"
                label={{ value: 'Forecast: model not trained', fill: '#7dd3fc', fontSize: 10, position: 'insideTop' }}
              />
            )}
            {scnRef !== null && (
              <ReferenceLine
                y={scnRef}
                stroke="#f59e0b"
                strokeDasharray="5 3"
                label={{ value: `Modeled scenario level ${scnRef.toFixed(1)}`, fill: '#fbbf24', fontSize: 10, position: 'insideTopLeft' }}
              />
            )}
            <Area type="monotone" dataKey="demo" stroke="none" fill="url(#tsFill)" connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="demo" stroke="#22d3ee" strokeWidth={1.8} dot={false} connectNulls={false} isAnimationActive={false} />
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
      <div className="grid h-full place-items-center text-[12px] text-slate-500">
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
        <span className="text-[11.5px] font-medium text-slate-200">
          {POLLUTANT_LABEL[pollutant]} — most-changed zones · {result.params.name}
        </span>
        <DataBadge status="MODELED_SCENARIO" />
        <span className="ml-auto text-[10px] text-slate-500">click a bar to select the zone</span>
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
            <XAxis dataKey="name" {...axisProps} interval={0} tick={{ fill: '#64748b', fontSize: 9.5 }} />
            <YAxis {...axisProps} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="Baseline" fill="#475569" radius={[2, 2, 0, 0]} />
            <Bar dataKey="Scenario" fill="#f59e0b" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function BottomPanel() {
  const result = useTwin((s) => s.activeResult);
  const [tab, setTab] = useState<Tab>('timeseries');
  useEffect(() => {
    if (result) setTab('beforeafter');
  }, [result]);
  return (
    <div className="flex h-full flex-col px-3 pb-2 pt-2">
      <div className="mb-1.5">
        <Segmented<Tab>
          size="xs"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'timeseries', label: 'Time series' },
            { value: 'beforeafter', label: 'Before vs after' },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1">{tab === 'timeseries' ? <TimeSeriesChart /> : <BeforeAfterChart />}</div>
    </div>
  );
}
