import { useMemo, type KeyboardEvent, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { KOTHRUD_ID, forecastKey, useTwin } from '../store/useTwinStore';
import {
  ALGORITHM_LABEL,
  API_POLLUTANT_LABEL,
  API_POLLUTANT_ORDER,
  AQI_CATEGORY_COLOR,
  MODEL_API_URL,
  MODEL_QUALITY_NOTE,
  WARNING_LABEL,
  aqiText,
  fmtTime,
  isMeasured,
  isPredicted,
  unitLabel,
  type ApiAqi,
  type ApiMeasured,
  type ApiPollutant,
  type ApiStation,
} from '../services/aeromatrixApi';
import { Button, DrawerHeader, SeverityChip, TABLE, Toggle } from './ui';
import { fmt } from '../utils/format';
import type { Pollutant } from '../types';
import { LIVE_POLLUTANTS } from '../services/openMeteo';
import { placePointId, placeRecord, stationLivePoint, stationPlaceRef, stationRecord } from '../services/liveData';
import { CurrentConditions, ForecastPanel, LiveStatusLine, RecordMeta, RecordValue, SourceBadge, recordTitle } from './LivePanels';
import { POLLUTANT_LABEL, POLLUTANT_UNIT } from '../utils/colors';

const digits = (p: string) => (p === 'co' ? 2 : 1);

function asMeasured(m: ApiMeasured | { status: 'UNAVAILABLE' } | undefined): ApiMeasured | null {
  return m && m.status === 'MEASURED' ? m : null;
}

function rowKeys(go: () => void) {
  return (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      go();
    }
  };
}

/** Connection states for the model service, kept separate from "data unavailable". */
function ServiceState() {
  const svc = useTwin((s) => s.modelService);
  const connect = useTwin((s) => s.connectModelService);
  if (svc.status === 'online') return null;
  if (svc.status === 'offline') {
    return (
      <div className="mx-5 mb-3 rounded-lg bg-sand-100/[0.05] px-3 py-2.5 text-[12.5px] text-sand-300 ring-1 ring-inset ring-sand-100/10">
        <div className="font-semibold text-sand-100">Model service not running</div>
        <p className="mt-0.5 leading-snug">
          Start it with <span className="font-semibold text-sand-100">RUN_AEROMATRIX.bat</span>, then retry. Expected at{' '}
          <span className="num">{MODEL_API_URL}</span>.
        </p>
        <Button className="mt-2" onClick={() => connect()}>
          <RefreshCw size={14} aria-hidden="true" /> Retry
        </Button>
      </div>
    );
  }
  return <p className="px-5 pb-3 text-[12.5px] text-sand-400">Connecting to the model service…</p>;
}

function EstimateAqiCell({ aqi }: { aqi: ApiAqi | undefined }) {
  if (!aqi || aqi.status === 'UNAVAILABLE' || aqi.value == null) return <span className="text-sand-500" title={aqi?.reason ?? 'AQI estimate unavailable'}>—</span>;
  return (
    <span className="inline-flex items-center justify-end gap-1.5" title={`${aqi.category ?? ''}. Estimated from model data with CPCB breakpoints; not an official station AQI.`}>
      <span className="h-2 w-2 rounded-full" style={{ background: AQI_CATEGORY_COLOR[aqi.category ?? ''] ?? '#998371' }} aria-hidden="true" />
      <span className="num font-semibold text-sand-50">{aqiText(aqi)}</span>
    </span>
  );
}

/**
 * Monitoring locations with the current value of the chosen pollutant, resolved by
 * services/pollutantData (recent reading, then model data at the station's area, then a
 * current forecast, else unavailable). Rows open the station in the details drawer.
 */
export function StationTable({ pollutant, title = 'Monitoring locations' }: { pollutant: Pollutant; title?: string }) {
  const svc = useTwin((s) => s.modelService.status);
  const stations = useTwin((s) => s.stations);
  const measured = useTwin((s) => s.stationMeasured);
  const forecasts = useTwin((s) => s.forecasts);
  const live = useTwin((s) => s.live);
  const selected = useTwin((s) => s.selectedStationId);
  const select = useTwin((s) => s.selectStation);

  const rows = useMemo(() => {
    const st = { stationMeasured: measured, forecasts, live };
    const now = Date.now();
    const list = stations.map((station) => ({
      id: station.station,
      name: station.name,
      r: stationRecord(st, station, pollutant, now),
      aqi: stationLivePoint(st, station)?.aqi,
    }));
    list.push({ id: KOTHRUD_ID, name: 'Kothrud', r: placeRecord(st, 'kothrud', pollutant, now), aqi: live.points[placePointId('kothrud')]?.aqi });
    return list.sort((a, b) => (b.r.value ?? -Infinity) - (a.r.value ?? -Infinity) || a.name.localeCompare(b.name));
  }, [stations, measured, forecasts, live, pollutant]);

  const sample = rows.find((r) => r.r.value != null)?.r;

  return (
    <div className="pb-2">
      <div className="flex items-baseline justify-between gap-2 px-5 pb-1 pt-4">
        <h3 className="text-[13px] font-semibold text-sand-200">{title}</h3>
        <SourceBadge r={sample} />
      </div>
      <ServiceState />
      <div className="px-5 pb-2 empty:hidden">
        <LiveStatusLine />
      </div>
      {svc === 'online' && (
        <>
          <table className={TABLE.table}>
            <thead>
              <tr>
                <th className={`${TABLE.th} pl-5 text-left`}>Location</th>
                <th className={`${TABLE.th} text-right`}>
                  {POLLUTANT_LABEL[pollutant]} <span className="font-normal text-sand-500">{POLLUTANT_UNIT[pollutant]}</span>
                </th>
                <th className={`${TABLE.th} pr-5 text-right`} title="Estimated with CPCB breakpoints; not an official station AQI">
                  AQI
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ id, name, r, aqi }) => {
                const active = selected === id;
                const go = () => select(id);
                return (
                  <tr key={id} tabIndex={0} aria-selected={active} onClick={go} onKeyDown={rowKeys(go)} className={`${TABLE.row} ${active ? TABLE.rowActive : ''}`}>
                    <td className={`${TABLE.td} relative pl-5`}>
                      {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-accent-500" aria-hidden="true" />}
                      <span className="flex flex-col">
                        <span className="font-semibold text-sand-50">{name}</span>
                        <span className="text-[11.5px] text-sand-400">
                          <RecordMeta r={r} />
                        </span>
                      </span>
                    </td>
                    <td className={`${TABLE.td} text-right`} title={recordTitle(r)}>
                      <RecordValue r={r} compact />
                    </td>
                    <td className={`${TABLE.td} pr-5 text-right`}>{r.kind === 'model_data' ? <EstimateAqiCell aqi={aqi} /> : <span className="text-sand-500">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
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

function HistoricalChip() {
  return (
    <span className="rounded-md bg-amber-300/15 px-2 py-0.5 text-[11px] font-semibold text-amber-200" title="Bundled data from the source files, not a live feed">
      Historical
    </span>
  );
}

function MeasuredAqi({ aqi }: { aqi: ApiAqi }) {
  if (aqi.status === 'UNAVAILABLE' || aqi.value == null) return <p className="text-[12.5px] text-sand-400">Insufficient observations for this period.</p>;
  const severe = aqi.status === 'LOWER_BOUND';
  return (
    <>
      <div className="flex items-end justify-between gap-3" title={aqi.period_end ? `24 h window ending ${fmtTime(aqi.period_end)}` : undefined}>
        <div className="num text-[30px] font-semibold leading-none tracking-[-0.02em] text-sand-50">{aqiText(aqi)}</div>
        <SeverityChip color={AQI_CATEGORY_COLOR[aqi.category ?? ''] ?? '#998371'} label={severe ? 'Severe' : (aqi.category ?? '—')} />
      </div>
      {aqi.subindices && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(aqi.subindices).map(([p, si]) => (
            <span key={p} className="rounded-md bg-sand-100/[0.06] px-2 py-0.5 text-[11.5px] text-sand-300" title={`${si.averaging_hours} h mean ${fmt(si.concentration, 1)}`}>
              {API_POLLUTANT_LABEL[p as ApiPollutant] ?? p} <span className="num font-semibold text-sand-100">{si.value}</span>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** The trained station model's +24 h forecast. It needs recent station readings, so with the bundled (historical) data it is a review only. */
function TrainedForecast({ station }: { station: ApiStation }) {
  const allowHistorical = useTwin((s) => s.allowHistoricalForecast);
  const fc = useTwin((s) => s.forecasts[forecastKey(station.station, s.allowHistoricalForecast)]);
  const setAllow = useTwin((s) => s.setAllowHistoricalForecast);
  const mine = fc && fc.stationId === station.station ? fc : null;
  const data = mine?.data && 'pollutants' in mine.data ? mine.data : null;
  const entries = data ? API_POLLUTANT_ORDER.map((p) => [p, data.pollutants[p]] as const).filter(([, v]) => !!v) : [];
  const predicted = entries.filter(([, v]) => isPredicted(v));
  const first = predicted[0]?.[1];
  const quality = useTwin((s) => s.modelQuality);

  return (
    <details className="group border-t hairline px-5 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-semibold text-sand-200">
        Trained model forecast
        <span className="text-[11.5px] font-normal text-sand-500 group-open:hidden">Historical review</span>
      </summary>
      <div className="mt-2">
        <Toggle checked={allowHistorical} onChange={setAllow} label="Run on the latest station readings (historical)" />
        {mine?.loading && <p className="mt-2 text-[12.5px] text-sand-400">Running the trained models…</p>}
        {mine?.error && <p className="mt-2 text-[12.5px] text-accent-300">Model service unavailable.</p>}
        {!mine?.loading && !predicted.length && <p className="mt-2 text-[12.5px] text-sand-400">{allowHistorical ? 'Forecast unavailable for this station.' : 'Needs recent station readings; the bundled ones are historical.'}</p>}
        {predicted.length > 0 && first && isPredicted(first) && (
          <>
            <p className="mt-2 flex items-center gap-2 text-[12px] text-sand-400">
              Valid {fmtTime(first.valid_at)}
              {first.historical && <HistoricalChip />}
            </p>
            <table className="mt-2 w-full text-[12.5px]">
              <thead className="text-[11.5px] text-sand-500">
                <tr>
                  <th className="pb-1 text-left font-medium">
                    <span className="sr-only">Pollutant</span>
                  </th>
                  <th className="pb-1 text-right font-medium">Forecast</th>
                  <th className="pb-1 text-right font-medium" title="Empirical validation range, not a guaranteed confidence interval">
                    Range
                  </th>
                </tr>
              </thead>
              <tbody>
                {predicted.map(([p, v]) =>
                  isPredicted(v) ? (
                    <tr key={p} className="border-t hairline align-top">
                      <td className="py-1.5 text-sand-200" title={`${ALGORITHM_LABEL[v.model.algorithm] ?? v.model.algorithm}, test R² ${v.test_metrics.r2 == null ? 'n/a' : fmt(v.test_metrics.r2, 2)}`}>
                        <span className="font-medium">{API_POLLUTANT_LABEL[p]}</span> <span className="text-[11px] text-sand-500">{unitLabel(v.unit)}</span>
                        {quality[p] && quality[p] !== 'ok' && (
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-200" title={MODEL_QUALITY_NOTE[quality[p] as 'below_baseline' | 'baseline_only']}>
                            <AlertTriangle size={11} aria-hidden="true" /> {quality[p] === 'below_baseline' ? 'Weaker than a simple baseline' : 'Baseline only, low accuracy'}
                          </div>
                        )}
                        {v.reliability_warnings.length > 0 && (
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-200" title={v.reliability_warnings.map((w) => WARNING_LABEL[w] ?? w).join('; ')}>
                            <AlertTriangle size={11} aria-hidden="true" /> Limited data, lower confidence
                          </div>
                        )}
                      </td>
                      <td className="num py-1.5 text-right font-semibold text-sand-50">{fmt(v.value, digits(p))}</td>
                      <td className="num py-1.5 text-right text-sand-300">
                        {fmt(v.lower, digits(p))}–{fmt(v.upper, digits(p))}
                      </td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          </>
        )}
      </div>
    </details>
  );
}

function AqiHistorySection({ id }: { id: string }) {
  const hist = useTwin((s) => s.stationAqiHistory[id]);
  if (!hist) return null;
  if (hist.status !== 'SOURCE_REPORTED_AQI') return null;
  const last = hist.records[hist.records.length - 1];
  if (!last) return null;
  return (
    <Section title="Source-reported AQI" right={<HistoricalChip />}>
      <div className="flex items-end justify-between gap-3">
        <div className="num text-[26px] font-semibold leading-none text-sand-50">{last.aqi}</div>
        <SeverityChip color={AQI_CATEGORY_COLOR[last.category] ?? '#998371'} label={last.category} />
      </div>
      <p className="mt-2 text-[12px] text-sand-400">
        Last record {fmtTime(last.time)}.
      </p>
    </Section>
  );
}

/** Identifiers and file names for troubleshooting, out of the way. */
function TechnicalDetails({ rows }: { rows: [string, string][] }) {
  return (
    <details className="border-t hairline px-5 py-3 text-[12px] text-sand-400">
      <summary className="cursor-pointer list-none font-medium text-sand-400 hover:text-sand-200">Technical details</summary>
      <dl className="mt-1.5 space-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt>{k}</dt>
            <dd className="max-w-[230px] truncate text-right text-sand-300" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Details drawer for a monitoring station (or Kothrud's AQI history). */
export function StationCard({ id }: { id: string }) {
  const stations = useTwin((s) => s.stations);
  const measured = useTwin((s) => s.stationMeasured[id]);
  const measuredAll = useTwin((s) => s.stationMeasured);
  const forecasts = useTwin((s) => s.forecasts);
  const live = useTwin((s) => s.live);
  const select = useTwin((s) => s.selectStation);
  const setRightOpen = useTwin((s) => s.setRightOpen);
  const close = () => {
    select(null);
    setRightOpen(false);
  };

  if (id === KOTHRUD_ID) {
    return (
      <>
        <DrawerHeader kicker="Region" title="Kothrud" subtitle="MIT-Kothrud (IITM) AQI records, 2017–2023" onClose={close} />
        <CurrentConditions records={LIVE_POLLUTANTS.map((p) => placeRecord({ live }, 'kothrud', p))} point={live.points[placePointId('kothrud')] ?? null} />
        <ForecastPanel point={live.points[placePointId('kothrud')] ?? null} />
        <AqiHistorySection id={id} />
        <Section title="Station readings">
          <p className="text-[12.5px] text-sand-400">No concentration history for Kothrud.</p>
        </Section>
      </>
    );
  }

  const station = stations.find((s) => s.station === id);
  const m = asMeasured(measured);
  const liveState = { stationMeasured: measuredAll, forecasts, live };
  if (!station) return null;
  const rows = m ? API_POLLUTANT_ORDER.map((p) => [p, m.pollutants[p]] as const).filter(([, v]) => !!v) : [];

  return (
    <>
      <DrawerHeader kicker="Monitoring station" title={station.name} subtitle={station.station_name} onClose={close} right={m?.historical ? <HistoricalChip /> : undefined} />

      <CurrentConditions
        records={LIVE_POLLUTANTS.map((p) => stationRecord(liveState, station, p))}
        point={stationLivePoint(liveState, station)}
      />
      <ForecastPanel point={stationLivePoint(liveState, station)} />

      <Section title="Last station reading, AQI" right={<HistoricalChip />}>
        {m ? <MeasuredAqi aqi={m.aqi} /> : <p className="text-[12.5px] text-sand-400">No station readings.</p>}
      </Section>

      {rows.length > 0 && (
        <Section title="Last station readings" right={<HistoricalChip />}>
          <table className="w-full text-[12.5px]">
            <tbody>
              {rows.map(([p, v]) => (
                <tr key={p} className="border-t hairline first:border-t-0">
                  <td className="py-1.5 text-sand-200">
                    <span className="font-medium">{API_POLLUTANT_LABEL[p]}</span>{' '}
                    {isMeasured(v) && <span className="text-[11px] text-sand-500">{unitLabel(v.unit)}</span>}
                  </td>
                  <td className="num py-1.5 text-right font-semibold text-sand-50">{isMeasured(v) ? fmt(v.value, digits(p)) : '—'}</td>
                  <td className="num py-1.5 pl-3 text-right text-[11.5px] text-sand-500">{isMeasured(v) ? fmtTime(v.time) : 'Insufficient data'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11.5px] text-sand-500">Hourly means.</p>
        </Section>
      )}

      <TrainedForecast station={station} />
      <AqiHistorySection id={id} />
      <TechnicalDetails
        rows={[
          ['Station ID', station.station],
          ['Source file', station.source_files],
          ['Reference point', stationPlaceRef(station).reference],
        ]}
      />
    </>
  );
}
