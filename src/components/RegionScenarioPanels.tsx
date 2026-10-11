import { useEffect, useMemo } from 'react';
import { CartesianGrid, ComposedChart, ErrorBar, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { forecastKey, useTwin } from '../store/useTwinStore';
import { evaluateRegionScenario, regionLocality, type RegionScenario, type RegionScenarioRow } from '../scenarios/regionScenario';
import { MODEL_QUALITY_NOTE, fmtTime, unitLabel } from '../services/aeromatrixApi';
import { SERIES, axisProps, gridProps, tooltipStyle } from '../analytics/chartTheme';
import { DeltaText, Segmented, Toggle } from './ui';
import { fmt } from '../utils/format';

const digits = (p: string) => (p === 'co' ? 2 : 1);

/** The single scenario evaluation for a region; every chart, card and table reads this. */
export function useRegionScenario(stationId: string | null): RegionScenario | null {
  const station = useTwin((s) => s.stations.find((x) => x.station === stationId));
  const measured = useTwin((s) => (stationId ? s.stationMeasured[stationId] : undefined));
  const forecast = useTwin((s) => (stationId ? s.forecasts[forecastKey(stationId, s.allowHistoricalForecast)] : undefined));
  const online = useTwin((s) => s.modelService.status === 'online');
  const base = useTwin((s) => s.base);
  const result = useTwin((s) => s.activeResult);
  return useMemo(
    () => (station && base ? evaluateRegionScenario({ station, measured, forecast, serviceOnline: online, base, result }) : null),
    [station, measured, forecast, online, base, result],
  );
}

/** Station picker for the What-If simulator; stations with a mapped area are listed first. */
export function RegionPicker() {
  const stations = useTwin((s) => s.stations);
  const region = useTwin((s) => s.whatIfRegionId);
  const setRegion = useTwin((s) => s.setWhatIfRegion);
  const online = useTwin((s) => s.modelService.status === 'online');
  const sorted = useMemo(
    () => [...stations].sort((a, b) => Number(!regionLocality(a)) - Number(!regionLocality(b)) || a.name.localeCompare(b.name)),
    [stations],
  );
  // Default to Hadapsar (or the first station with a mapped area) once stations load.
  useEffect(() => {
    if (region || !sorted.length) return;
    setRegion((sorted.find((s) => s.name === 'Hadapsar') ?? sorted[0]).station);
  }, [region, sorted, setRegion]);
  if (!online) return null;
  return (
    <label className="block text-[12.5px] text-sand-300">
      Monitoring location
      <select
        value={region ?? ''}
        onChange={(e) => setRegion(e.target.value)}
        className="mt-1 w-full cursor-pointer rounded-lg bg-ink-950 px-2.5 py-1.5 text-[12.5px] text-sand-100 ring-1 ring-inset ring-sand-100/15 outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
      >
        {sorted.map((s) => (
          <option key={s.station} value={s.station}>
            {s.name}
            {regionLocality(s) ? '' : ' (no scenario)'}
          </option>
        ))}
      </select>
    </label>
  );
}

function rowFor(sc: RegionScenario | null, pollutant: string): RegionScenarioRow | undefined {
  return sc?.rows.find((r) => r.pollutant === pollutant);
}

/**
 * Baseline vs scenario forecast for one pollutant: the latest measured hour and the
 * model's +24 h point. Only the points are model values; the dashed line between them
 * is not an hourly forecast.
 */
export function RegionForecastChart({ scenario, pollutant, height = 190 }: { scenario: RegionScenario; pollutant: string; height?: number }) {
  const time = useTwin((s) => s.forecastTime);
  const setTime = useTwin((s) => s.setForecastTime);
  const row = rowFor(scenario, pollutant);
  const quality = useTwin((s) => s.modelQuality[pollutant]);
  if (!row || !row.baseline) {
    return (
      <p className="text-[12.5px] text-sand-400" title={row?.reason ?? undefined}>
        {/historical/i.test(row?.reason ?? '') ? 'Forecast unavailable: no recent station readings.' : 'Forecast unavailable for this location.'}
      </p>
    );
  }
  const b = row.baseline;
  const s = row.scenario;
  const data = [
    { key: 'reference', label: 'Latest reading', baseline: row.current?.value ?? null, scenario: row.current?.value ?? null },
    {
      key: 'forecast',
      label: '+24 h',
      baseline: b.value,
      scenario: s?.value ?? null,
      baselineErr: b.lower != null && b.upper != null ? [b.value - b.lower, b.upper - b.value] : undefined,
      scenarioErr: s && s.lower != null && s.upper != null ? [s.value - s.lower, s.upper - s.value] : undefined,
    },
  ];
  const unit = row.unit ? unitLabel(row.unit) : '';
  return (
    <div>
      <div style={{ height }} role="img" aria-label={`${row.label} baseline and scenario forecast`}>
        <ResponsiveContainer>
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 16, left: -12, bottom: 0 }}
            onClick={(e) => {
              const label = (e as { activeLabel?: string } | null)?.activeLabel;
              if (label) setTime(label === '+24 h' ? 'forecast' : 'reference');
            }}
          >
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} padding={{ left: 28, right: 28 }} />
            <YAxis {...axisProps} domain={[0, 'auto']} />
            <Tooltip
              {...tooltipStyle}
              formatter={(v, n) => [v == null ? '—' : `${fmt(Number(v), digits(pollutant))} ${unit}`, n === 'baseline' ? 'Without intervention' : 'After intervention']}
            />
            <Legend
              wrapperStyle={{ fontSize: 11.5 }}
              formatter={(v) => (v === 'baseline' ? 'Forecast without intervention' : 'Modelled after intervention')}
            />
            <ReferenceLine x={time === 'forecast' ? '+24 h' : 'Latest reading'} stroke="#c84a62" strokeOpacity={0.35} strokeWidth={10} />
            <Line
              type="linear"
              dataKey="baseline"
              stroke={SERIES.baseline}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={{ r: 6, fill: '#fbf5e9', stroke: SERIES.baseline, strokeWidth: 2.5 }}
              isAnimationActive
              animationDuration={350}
              connectNulls
            >
              <ErrorBar dataKey="baselineErr" width={8} stroke={SERIES.baseline} strokeWidth={1.5} />
            </Line>
            {s && (
              <Line
                type="linear"
                dataKey="scenario"
                stroke={SERIES.scenario}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={{ r: 4, fill: SERIES.scenario, stroke: SERIES.scenario }}
                isAnimationActive
                animationDuration={350}
                connectNulls
              >
                <ErrorBar dataKey="scenarioErr" width={5} stroke={SERIES.scenario} strokeWidth={1.5} />
              </Line>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-sand-500">
        <span>
          {fmtTime(row.issuedAt ?? undefined)} → {fmtTime(row.validAt ?? undefined)}
        </span>
        <Segmented
          size="xs"
          label="Forecast time"
          value={time}
          onChange={setTime}
          options={[
            { value: 'reference', label: 'Latest reading' },
            { value: 'forecast', label: '+24 h' },
          ]}
        />
      </div>
      <p className="mt-1.5 text-[11.5px] text-sand-500" title="The dashed line only joins the two points; bars show the model's validation range.">
        One forecast point, 24 h ahead.
        {quality && quality !== 'ok' && <span className="ml-1 text-amber-200" title={MODEL_QUALITY_NOTE[quality]}>{quality === 'below_baseline' ? 'Weaker than a simple baseline.' : 'Baseline only, low accuracy.'}</span>}
      </p>
    </div>
  );
}

/** Before / After summary for the selected pollutant and time. */
export function RegionComparison({ scenario, pollutant }: { scenario: RegionScenario; pollutant: string }) {
  const time = useTwin((s) => s.forecastTime);
  const row = rowFor(scenario, pollutant);
  if (!row || !row.baseline) return null;
  const unit = row.unit ? unitLabel(row.unit) : '';
  const d = digits(pollutant);
  const atReference = time === 'reference';
  const before = atReference ? row.current?.value ?? null : row.baseline.value;
  const after = atReference ? row.current?.value ?? null : row.scenario?.value ?? null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="rounded-lg bg-sand-100/[0.05] p-2.5 ring-1 ring-inset ring-sand-100/10">
        <div className="text-[11.5px] text-sand-400">{atReference ? 'Latest reading' : 'Forecast without intervention'}</div>
        <div className="num text-[20px] font-semibold leading-tight text-sand-50">
          {before == null ? '—' : fmt(before, d)} <span className="text-[11px] font-medium text-sand-500">{unit}</span>
        </div>
        {!atReference && row.baseline.lower != null && (
          <div className="num text-[11px] text-sand-500">
            range {fmt(row.baseline.lower, d)}–{fmt(row.baseline.upper ?? NaN, d)}
          </div>
        )}
      </div>
      <div className="rounded-lg bg-accent-500/[0.07] p-2.5 ring-1 ring-inset ring-accent-400/30">
        <div className="text-[11.5px] text-sand-400">{atReference ? 'Same (intervention starts now)' : 'Modelled after intervention'}</div>
        <div className="num text-[20px] font-semibold leading-tight text-sand-50">
          {after == null ? '—' : fmt(after, d)} <span className="text-[11px] font-medium text-sand-500">{unit}</span>
        </div>
        {!atReference && row.absChange != null && (
          <div className="text-[11.5px]">
            <DeltaText value={row.absChange} digits={d} unit={` ${unit}`} /> {row.pctChange != null && <>(<DeltaText value={row.pctChange} unit="%" />)</>}
          </div>
        )}
        {!atReference && !row.scenario && <div className="text-[11px] leading-snug text-sand-500">{row.reason}</div>}
      </div>
    </div>
  );
}

/** All pollutants for the region: now, +24 h baseline, +24 h scenario, change. */
export function RegionTable({ scenario, highlight }: { scenario: RegionScenario; highlight: string }) {
  const rows = scenario.rows.filter((r) => r.baseline);
  if (!rows.length) return null;
  return (
    <table className="mt-3 w-full text-[12px]">
      <thead className="text-[11px] text-sand-500">
        <tr>
          <th className="pb-1 text-left font-medium">
            <span className="sr-only">Pollutant</span>
          </th>
          <th className="pb-1 text-right font-medium" title="Measured, reference hour">Now</th>
          <th className="pb-1 text-right font-medium" title="Trained model, +24 h">Forecast</th>
          <th className="pb-1 text-right font-medium" title="Forecast × modelled scenario effect">Scenario</th>
          <th className="pb-1 text-right font-medium">Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const d = digits(r.pollutant);
          return (
            <tr key={r.pollutant} className={`border-t hairline ${r.pollutant === highlight ? 'bg-accent-500/[0.07]' : ''}`}>
              <td className="py-1.5 pl-1 text-sand-200">
                <span className="font-medium">{r.label}</span> <span className="text-[10.5px] text-sand-500">{r.unit ? unitLabel(r.unit) : ''}</span>
              </td>
              <td className="num text-right text-sand-300">{r.current ? fmt(r.current.value, d) : '—'}</td>
              <td className="num text-right text-sand-100">{fmt(r.baseline!.value, d)}</td>
              <td className="num text-right font-semibold text-sand-50" title={r.reason ?? undefined}>
                {r.scenario ? fmt(r.scenario.value, d) : '—'}
              </td>
              <td className="pr-1 text-right">{r.pctChange != null ? <DeltaText value={r.pctChange} unit="%" /> : <span className="text-sand-500">—</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Region forecast block: status, chart, comparison, table and assumptions. */
export function RegionScenarioBlock({ compact = false }: { compact?: boolean }) {
  const regionId = useTwin((s) => s.whatIfRegionId ?? s.selectedStationId);
  const pollutant = useTwin((s) => s.pollutant);
  const allowHistorical = useTwin((s) => s.allowHistoricalForecast);
  const setAllow = useTwin((s) => s.setAllowHistoricalForecast);
  const active = useTwin((s) => s.activeResult);
  const sc = useRegionScenario(regionId);
  if (!sc) return <p className="text-[12.5px] text-sand-400">Choose a region to see its forecast.</p>;
  return (
    <div>
      {sc.status !== 'READY' && (
        <div className="rounded-lg bg-sand-100/[0.05] px-3 py-2.5 text-[12.5px] leading-snug text-sand-300 ring-1 ring-inset ring-sand-100/10">
          <span title={sc.message ?? undefined}>{sc.status === 'NO_FORECAST' ? 'Forecast unavailable: no recent station readings.' : sc.message}</span>
          {sc.status === 'NO_FORECAST' && !allowHistorical && <span className="block text-sand-400">Turn on the switch below to use the latest available readings.</span>}
        </div>
      )}
      {!compact && <Toggle checked={allowHistorical} onChange={setAllow} label="Use latest available readings (historical)" />}
      {sc.status === 'READY' && (
        <>
          {sc.historical && (
            <p className="mb-2 rounded-md bg-amber-300/15 px-2 py-1 text-[11.5px] font-medium text-amber-200">Based on historical readings</p>
          )}
          <RegionForecastChart scenario={sc} pollutant={pollutant} height={compact ? 150 : 190} />
          <RegionComparison scenario={sc} pollutant={pollutant} />
          {!compact && <RegionTable scenario={sc} highlight={pollutant} />}
          <p
            className="mt-3 text-[11.5px] leading-snug text-sand-500"
            title={`Baseline: trained model for ${sc.station.station_name}. Scenario effect from the prototype engine in zone ${sc.cellId ?? '—'}. AQI isn't shown for a single forecast point.`}
          >
            {sc.scenarioLimitation
              ? 'Scenario effect unavailable for this location.'
              : active
                ? `Baseline: trained model. Scenario “${active.params.name}”: hypothetical estimate.`
                : 'No scenario yet: change a setting below.'}
          </p>
        </>
      )}
    </div>
  );
}

