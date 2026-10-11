// Current air quality and the forward forecast, shared by the station, place and zone
// drawers. Every value comes from services/pollutantData.ts or services/forecast.ts;
// provenance (source, times, reference and grid point) is kept in tooltips.

import { useMemo, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import { AQI_CATEGORY_COLOR, aqiText, type ApiAqi } from '../services/aeromatrixApi';
import { KIND_LABEL, fmtIst, type PollutantRecord } from '../services/pollutantData';
import { refreshLiveData } from '../services/liveData';
import { dailyForecast, dayLabel, forecastDates } from '../services/forecast';
import type { LiveAirPoint } from '../services/openMeteo';
import { POLLUTANT_LABEL } from '../utils/colors';
import { fmt } from '../utils/format';
import { Button, DataBadge, SeverityChip } from './ui';
import type { Pollutant } from '../types';

const digits = (p: Pollutant) => (p === 'co' ? 2 : 1);

/** A value, or "—" with the reason in its tooltip. */
export function RecordValue({ r, compact }: { r: PollutantRecord; compact?: boolean }) {
  if (r.value == null) return <span className="text-sand-500" title={r.note ?? undefined}>—</span>;
  return (
    <span className="num font-semibold text-sand-50" title={recordTitle(r)}>
      {fmt(r.value, digits(r.pollutant))}
      {!compact && <span className="ml-1 text-[11px] font-normal text-sand-500">{r.unit}</span>}
    </span>
  );
}

export function recordTitle(r: PollutantRecord): string {
  if (r.value == null) return r.note ?? 'Unavailable';
  const parts = [`${KIND_LABEL[r.kind!]}: ${r.source}`, `valid ${fmtIst(r.time)} IST`, `reference ${r.place.reference}`];
  if (r.grid) parts.push(`model grid point ${r.grid[1].toFixed(2)}°N ${r.grid[0].toFixed(2)}°E`);
  if (r.retrievedAt) parts.push(`retrieved ${fmtIst(r.retrievedAt)}`);
  if (r.freshness === 'stale') parts.push('older than 3 h');
  return parts.join('; ');
}

/** Short status under a name: nothing when current, otherwise why the value is missing or old. */
export function RecordMeta({ r }: { r: PollutantRecord }) {
  const status = useTwin((s) => s.live.status);
  if (r.value == null) return <span className="text-sand-500">{shortReason(r.note, status)}</span>;
  if (r.freshness === 'stale') return <span className="text-amber-200">Not current: {fmtIst(r.time)}</span>;
  return null;
}

function shortReason(note: string | null, status: string): string {
  if (!note) return 'Unavailable';
  if (note.includes('No verified coordinates')) return 'Location not verified';
  if (note.includes('not loaded')) return status === 'error' ? 'Unavailable' : 'Loading…';
  return 'Unavailable';
}

/** "Model data · 22:30" badge with the full provenance in its tooltip. */
export function SourceBadge({ r }: { r: PollutantRecord | undefined }) {
  if (!r || r.value == null) return null;
  const status = r.kind === 'observation' ? 'OBSERVED' : r.kind === 'ml_prediction' ? 'MODEL_PREDICTION' : 'MODEL_DATA';
  return (
    <span className="inline-flex items-center gap-1.5" title={recordTitle(r)}>
      <DataBadge status={status} />
      <span className={`num text-[11px] ${r.freshness === 'stale' ? 'text-amber-200' : 'text-sand-500'}`}>{fmtIst(r.time)}</span>
    </span>
  );
}

export function EstimatedAqi({ aqi, size = 'lg' }: { aqi: ApiAqi | undefined | null; size?: 'lg' | 'sm' }) {
  if (!aqi || aqi.status === 'UNAVAILABLE' || aqi.value == null) return <p className="text-[12.5px] text-sand-400">AQI unavailable: insufficient data.</p>;
  const title = `${aqi.method ?? 'CPCB breakpoints'}${aqi.dominant_pollutant ? `. Dominant: ${POLLUTANT_LABEL[aqi.dominant_pollutant as Pollutant] ?? aqi.dominant_pollutant}` : ''}`;
  return (
    <div className="flex items-end justify-between gap-3" title={title}>
      <div>
        <div className="text-[11.5px] text-sand-400">AQI (estimated)</div>
        <div className={`num font-semibold leading-none tracking-[-0.02em] text-sand-50 ${size === 'lg' ? 'text-[30px]' : 'text-[20px]'}`}>{aqiText(aqi)}</div>
      </div>
      <SeverityChip color={AQI_CATEGORY_COLOR[aqi.category ?? ''] ?? '#998371'} label={aqi.status === 'LOWER_BOUND' ? 'Severe' : (aqi.category ?? '—')} />
    </div>
  );
}

export function LiveStatusLine() {
  const live = useTwin((s) => s.live);
  if (live.status === 'loading') return <p className="text-[12px] text-sand-400">Loading current air quality…</p>;
  if (live.status === 'error')
    return (
      <div className="flex items-center justify-between gap-2 text-[12px] text-accent-300" title={live.error ?? undefined}>
        <span>{live.updatedAt ? `Couldn’t refresh; showing data from ${fmtIst(live.updatedAt)}.` : 'Current air quality is unavailable right now.'}</span>
        <Button className="!min-h-7 shrink-0" onClick={() => void refreshLiveData()}>
          <RefreshCw size={13} aria-hidden="true" /> Retry
        </Button>
      </div>
    );
  return null;
}

/** All six pollutants for one place, with the estimated AQI. */
export function CurrentConditions({
  title = 'Current air quality',
  records,
  point,
  extraColumn,
  footer,
}: {
  title?: string;
  records: PollutantRecord[];
  point: LiveAirPoint | null;
  extraColumn?: { label: string; render: (r: PollutantRecord) => ReactNode };
  footer?: ReactNode;
}) {
  const pollutant = useTwin((s) => s.pollutant);
  const first = records.find((r) => r.value != null) ?? records[0];
  const anyModel = records.some((r) => r.kind === 'model_data');
  return (
    <section className="border-t hairline px-5 py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-sand-200">{title}</h3>
        <SourceBadge r={first} />
      </div>
      <LiveStatusLine />
      {first && first.value == null && !first.place.location ? (
        <p className="text-[12.5px] text-sand-400" title={first.note ?? undefined}>
          Location not verified: no current data.
        </p>
      ) : (
        <>
          {anyModel && point && <EstimatedAqi aqi={point.aqi} />}
          <table className="mt-3 w-full text-[12.5px]">
            {extraColumn && (
              <thead className="text-[11.5px] text-sand-500">
                <tr>
                  <th className="pb-1 text-left font-medium">
                    <span className="sr-only">Pollutant</span>
                  </th>
                  <th className="pb-1 text-right font-medium">Current</th>
                  <th className="pb-1 text-right font-medium">{extraColumn.label}</th>
                </tr>
              </thead>
            )}
            <tbody>
              {records.map((r) => (
                <tr key={r.pollutant} className={`border-t hairline first:border-t-0 ${r.pollutant === pollutant ? 'bg-accent-500/[0.07]' : ''}`}>
                  <td className="py-1.5 pl-1 text-sand-200">
                    <span className={r.pollutant === pollutant ? 'font-semibold text-sand-50' : 'font-medium'}>{POLLUTANT_LABEL[r.pollutant]}</span>{' '}
                    <span className="text-[11px] text-sand-500">{r.unit}</span>
                  </td>
                  <td className="py-1.5 text-right">
                    <RecordValue r={r} compact />
                  </td>
                  {extraColumn && <td className="py-1.5 pr-1 text-right">{extraColumn.render(r)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {first?.freshness === 'stale' && <p className="mt-2 text-[11.5px] text-amber-200">Not current: last updated {fmtIst(first.time)}.</p>}
          {footer}
        </>
      )}
    </section>
  );
}

/**
 * Forward forecast for a chosen day (tomorrow by default), from the hourly CAMS model
 * forecast at the same place as the current values. Only days the model run covers.
 */
export function ForecastPanel({ point, title = 'Forecast' }: { point: LiveAirPoint | null; title?: string }) {
  const pollutant = useTwin((s) => s.pollutant);
  const now = useMemo(() => Date.now(), [point]); // evaluated when the data changes
  const dates = useMemo(() => forecastDates(point, now), [point, now]);
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked && dates.includes(picked) ? picked : dates[0];
  const f = useMemo(() => (date ? dailyForecast(point, date, now) : null), [point, date, now]);

  return (
    <section className="border-t hairline px-5 py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-sand-200">{title}</h3>
        {f?.status === 'OK' && (
          <span title={`CAMS global model forecast via Open-Meteo, retrieved ${fmtIst(f.retrievedAt)} IST`}>
            <DataBadge status="MODEL_PREDICTION" />
          </span>
        )}
      </div>
      {!dates.length || !f || f.status !== 'OK' ? (
        <p className="text-[12.5px] text-sand-400">Forecast unavailable for this location.</p>
      ) : (
        <>
          <div role="radiogroup" aria-label="Forecast day" className="mb-3 flex flex-wrap gap-1.5">
            {dates.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={d === date}
                onClick={() => setPicked(d)}
                className={`cursor-pointer rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                  d === date ? 'bg-accent-500 text-white' : 'bg-sand-100/[0.06] text-sand-200 ring-1 ring-inset ring-sand-100/10 hover:bg-sand-100/[0.11]'
                }`}
              >
                {dayLabel(d, now)}
              </button>
            ))}
          </div>
          <EstimatedAqi aqi={f.aqi} size="sm" />
          <table className="mt-3 w-full text-[12.5px]">
            <thead className="text-[11.5px] text-sand-500">
              <tr>
                <th className="pb-1 text-left font-medium">
                  <span className="sr-only">Pollutant</span>
                </th>
                <th className="pb-1 text-right font-medium">Day mean</th>
                <th className="pb-1 text-right font-medium">Range</th>
              </tr>
            </thead>
            <tbody>
              {f.rows.map((r) => (
                <tr key={r.pollutant} className={`border-t hairline ${r.pollutant === pollutant ? 'bg-accent-500/[0.07]' : ''}`}>
                  <td className="py-1.5 pl-1 text-sand-200">
                    <span className={r.pollutant === pollutant ? 'font-semibold text-sand-50' : 'font-medium'}>{POLLUTANT_LABEL[r.pollutant]}</span>{' '}
                    <span className="text-[11px] text-sand-500">{r.unit}</span>
                  </td>
                  <td className="num py-1.5 text-right font-semibold text-sand-50">{fmt(r.mean, digits(r.pollutant))}</td>
                  <td className="num py-1.5 pr-1 text-right text-sand-300">
                    {fmt(r.min, digits(r.pollutant))}–{fmt(r.max, digits(r.pollutant))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11.5px] text-sand-500">
            For {dayLabel(f.date, now).replace('Tomorrow, ', '')}, generated {fmtIst(f.retrievedAt)}.
          </p>
        </>
      )}
    </section>
  );
}
