// Task 2 · Sensor Intelligence: next-hour PM2.5 and PM10 for a missing or unmonitored
// station from the trained models (backend/task2_model), plus an estimated PM-based AQI
// when 24 h data are sufficient. Results are historical replays of the 2025 test period.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Gauge, Play, RefreshCw, Wind, type LucideIcon } from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import { fmtTime } from '../services/aeromatrixApi';
import { pollutionColor, rgbToCss } from '../utils/colors';
import { fmt } from '../utils/format';
import { Block, Button, SectionHeader, Segmented, TABLE, Toggle } from '../components/ui';
import {
  T2_AQI_COLOR,
  T2_LABEL,
  T2_LOSS_LEVELS,
  T2_SEEDS,
  T2_UNIT,
  istCutoff,
  istParts,
  shiftHours,
  shortName,
  task2Api,
  type T2Cases,
  type T2Demo,
  type T2Donor,
  type T2Mode,
  type T2Pattern,
  type T2Pollutant,
  type T2PollutantResult,
  type T2Replay,
  type T2Request,
  type T2Stations,
} from '../services/task2Api';
import { Task2Planning } from './Task2Planning';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const POLS: T2Pollutant[] = ['pm25', 'pm10'];
const PATTERN_LABEL: Record<T2Pattern, string> = { random: 'Random', block12h: '12 h blocks', station: 'Whole stations' };
const DONOR_SHORT: Record<T2Donor['state'], string> = { USED: '', STALE: 'too old', NO_READING: 'no data', LOSS_MASKED: 'removed', OUTAGE_SIMULATED: 'off', OUT_OF_RANGE: 'out of range' };
const shortTime = (iso: string) => fmtTime(iso).replace(/, \d{4}/, '');

function Chip({ children, tone = 'text-sand-300', title }: { children: ReactNode; tone?: string; title?: string }) {
  return (
    <span title={title} className={`whitespace-nowrap rounded-md bg-sand-100/[0.07] px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {children}
    </span>
  );
}

function Dot({ p, v }: { p: T2Pollutant; v: number | null | undefined }) {
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: v == null ? '#8a7f7a' : rgbToCss(pollutionColor(p, v)) }} aria-hidden="true" />;
}

function Card({ icon: Icon, label, children, footer, className = '' }: { icon: LucideIcon; label: string; children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col rounded-xl bg-sand-100/[0.05] p-3.5 ring-1 ring-inset ring-sand-100/10 ${className}`}>
      <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-medium text-sand-400">
        <Icon className="h-3.5 w-3.5 shrink-0 text-accent-300" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 flex-1">{children}</div>
      {footer && <div className="mt-2 border-t hairline pt-1.5 text-[11px] leading-snug text-sand-500">{footer}</div>}
    </div>
  );
}

function PmCard({ p, r }: { p: T2Pollutant; r: T2PollutantResult }) {
  const pred = r.prediction;
  return (
    <Card
      icon={Wind}
      label={`Predicted ${T2_LABEL[p]}`}
      footer={
        r.reference.value != null ? (
          <span title="Measured later; not a model input">
            Recorded <span className="num text-sand-300">{fmt(r.reference.value, 1)}</span>
          </span>
        ) : (
          'Not recorded'
        )
      }
    >
      {pred.status === 'AVAILABLE' ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="num whitespace-nowrap font-display text-[28px] leading-tight text-sand-50">{fmt(pred.value, 1)}</span>
            <span className="whitespace-nowrap text-[11.5px] text-sand-400">{T2_UNIT}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-sand-400">
            <Dot p={p} v={pred.value} />
            Range {fmt(pred.interval[0], 0)}–{fmt(pred.interval[1], 0)}
          </div>
        </>
      ) : (
        <>
          <div className="text-[15px] font-semibold text-sand-200">No forecast</div>
          <div className="mt-1 text-[11.5px] leading-snug text-sand-400">Not enough nearby readings</div>
        </>
      )}
    </Card>
  );
}

function AqiCard({ replay }: { replay: T2Replay }) {
  const d = replay.aqi_detail;
  const span = 'col-span-2 @xl:col-span-1';
  if (replay.aqi_status !== 'estimated' || replay.aqi == null) {
    const why = Object.entries(d.excluded)
      .map(([k, v]) => `${T2_LABEL[k as T2Pollutant]}: ${String(v).replace(/^Only (\d+) of 24 hourly values \((\d+) needed\)$/, '$1 of 24 h ($2 needed)')}`)
      .join(' · ');
    return (
      <Card icon={Gauge} label="Predicted AQI" footer={why || undefined} className={span}>
        <div className="text-[15px] font-semibold text-sand-200">AQI unavailable</div>
        <div className="mt-1 text-[11.5px] leading-snug text-sand-400">Insufficient pollutant data</div>
      </Card>
    );
  }
  const color = T2_AQI_COLOR[replay.aqi_category ?? ''] ?? '#8a7f7a';
  const avg = (POLS.filter((p) => d.subindices[p]) as T2Pollutant[]).map((p) => `${T2_LABEL[p]} ${fmt(d.subindices[p]!.concentration_24h, 0)}`).join(' · ');
  return (
    <Card
      icon={Gauge}
      label="Estimated AQI · PM-based"
      className={span}
      footer={<span title="CPCB breakpoints on 24 h means: the recorded hours plus this forecast. Only PM2.5 and PM10 are available, so this is not an official CPCB AQI.">24 h avg {avg} {T2_UNIT} · not official</span>}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="num whitespace-nowrap font-display text-[28px] leading-tight text-sand-50">
          {d.aqi_bounded ? '≥' : ''}
          {replay.aqi}
        </span>
        <span className="whitespace-nowrap rounded-md px-2 py-0.5 text-[11.5px] font-semibold text-ink-950" style={{ background: color }}>
          {replay.aqi_category}
        </span>
      </div>
      {d.dominant_pollutant && <div className="mt-1 whitespace-nowrap text-[11.5px] text-sand-400">Led by {T2_LABEL[d.dominant_pollutant]}</div>}
    </Card>
  );
}

function DonorCell({ d }: { d?: T2Donor }) {
  if (!d) return <span className="text-sand-500">—</span>;
  if (d.state === 'USED') return <span className="num text-sand-200">{fmt(d.value ?? NaN, 0)}</span>;
  return <span className={`text-[11px] ${d.state === 'OUTAGE_SIMULATED' ? 'text-accent-300' : 'text-sand-500'}`}>{DONOR_SHORT[d.state]}</span>;
}

export function SensorsPanel() {
  const flyTo = useTwin((s) => s.requestFlyTo);
  const [meta, setMeta] = useState<T2Stations | null>(null);
  const [demos, setDemos] = useState<T2Demo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [req, setReq] = useState<T2Request | null>(null);
  const [ran, setRan] = useState<T2Request | null>(null);
  const [cases, setCases] = useState<T2Cases | null>(null);
  const [replay, setReplay] = useState<T2Replay | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jumpHour = useRef(false); // after a station change, move to its first offline hour with AQI data

  const run = (r: T2Request) => {
    setBusy(true);
    setError(null);
    setRan(r);
    task2Api
      .replay(r)
      .then(setReplay)
      .catch((e: Error) => (setError(e.message), setReplay(null)))
      .finally(() => setBusy(false));
  };

  // Station list and examples; open on an hour when the first example station's sensor was offline.
  useEffect(() => {
    let live = true;
    setLoadError(null);
    Promise.all([task2Api.stations(), task2Api.demos()])
      .then(async ([s, d]) => {
        const first = d.demos[0];
        const c = await task2Api.cases(first.station, 'pm25').catch(() => null);
        if (!live) return;
        setMeta(s);
        setDemos(d.demos);
        if (!req) {
          const r: T2Request = { station: first.station, pollutant: 'pm25', cutoff: c?.missing[0] ?? first.cutoff, mode: 'network', outage: [], target_offline: false, loss_level: 0, loss_pattern: 'random', seed: 17 };
          setReq(r);
          run(r);
        }
      })
      .catch((e: Error) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!req) return;
    let live = true;
    task2Api
      .cases(req.station, 'pm25')
      .then((c) => {
        if (!live) return;
        setCases(c);
        if (jumpHour.current && c.missing[0]) setReq((r) => (r && r.station === c.station ? { ...r, cutoff: c.missing[0] } : r));
        jumpHour.current = false;
      })
      .catch(() => live && setCases(null));
    return () => {
      live = false;
    };
  }, [req?.station]); // eslint-disable-line react-hooks/exhaustive-deps

  const verified = useMemo(() => meta?.stations.filter((s) => s.verified) ?? [], [meta]);
  const unsupported = (meta?.stations.length ?? 0) - verified.length;
  const station = verified.find((s) => s.station === req?.station);

  if (loadError)
    return (
      <>
        <SectionHeader title="Sensor Intelligence" />
        <Block>
          <p className="text-[12.5px] text-sand-300">{loadError}</p>
          <Button className="mt-2" onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
          </Button>
        </Block>
      </>
    );
  if (!meta || !req || !station) return <SectionHeader title="Sensor Intelligence" subtitle="Loading…" />;

  const set = (patch: Partial<T2Request>) => setReq({ ...req, ...patch });
  const chooseStation = (id: string) => {
    const s = verified.find((x) => x.station === id);
    if (id !== req.station) jumpHour.current = true;
    set({ station: id, outage: req.outage.filter((o) => o !== id) });
    if (s?.longitude != null && s.latitude != null) flyTo([s.longitude, s.latitude], 6000);
  };
  const loadDemo = (d: T2Demo) => {
    const c = d.configuration;
    const r: T2Request = { station: d.station, pollutant: 'pm25', cutoff: d.cutoff, mode: d.excluded_station ? 'unseen' : 'network', outage: [], target_offline: false, loss_level: c.loss_level, loss_pattern: c.pattern, seed: c.seed };
    setReq(r);
    run(r);
  };

  const { date, hour } = istParts(req.cutoff);
  const unseen = req.mode === 'unseen';
  const stale = !!ran && JSON.stringify(ran) !== JSON.stringify(req);
  const quick: [string, string[]][] = unseen ? [['Test hours', cases?.unseen ?? []]] : [['Sensor offline', cases?.missing ?? []], ['Other hours', cases?.with_aqi ?? []]];

  // Reliability across both pollutants: the weaker of the two.
  const preds = replay ? POLS.map((p) => replay.pollutants[p].prediction) : [];
  const avail = preds.filter((p) => p.status === 'AVAILABLE');
  const low = avail.some((p) => p.status === 'AVAILABLE' && p.reliability.status === 'LOW');
  const donors = avail.length ? Math.min(...avail.map((p) => (p.status === 'AVAILABLE' ? p.reliability.donor_count : 0))) : null;
  const nearest = avail.length ? Math.min(...avail.map((p) => (p.status === 'AVAILABLE' ? p.reliability.nearest_km : Infinity))) : null;
  const outOfRange = avail.some((p) => p.status === 'AVAILABLE' && p.reliability.out_of_training_bounds.length > 0);
  const resultStation = replay ? verified.find((s) => s.station === replay.request.station) : null;
  const donorRows = replay ? replay.pollutants.pm25.donors.map((d) => ({ d, pm10: replay.pollutants.pm10.donors.find((x) => x.station === d.station) })) : [];

  return (
    <>
      <SectionHeader title="Sensor Intelligence" subtitle="Next-hour air quality for a missing or unmonitored sensor." right={<Chip tone="text-amber-200" title="Recorded 2025 data, replayed. Not live.">Historical replay</Chip>} />

      <Block title="Sensor">
        <table className={TABLE.table}>
          <tbody>
            {verified.map((s) => {
              const active = s.station === req.station;
              return (
                <tr
                  key={s.station}
                  tabIndex={0}
                  aria-selected={active}
                  className={`${TABLE.row} ${active ? TABLE.rowActive : ''}`}
                  onClick={() => chooseStation(s.station)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), chooseStation(s.station))}
                >
                  <td className={`${TABLE.td} font-semibold text-sand-50`}>{shortName(s.name)}</td>
                  <td className={`${TABLE.td} text-right text-[11px] text-sand-500`}>{s.station}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {unsupported > 0 && <p className="mt-1.5 text-[11px] text-sand-500">{unsupported} other stations lack verified coordinates and aren’t supported.</p>}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Segmented<T2Mode>
            size="xs"
            label="Scenario"
            value={req.mode}
            onChange={(v) => set({ mode: v, target_offline: false })}
            options={[
              { value: 'network', label: 'Missing sensor' },
              { value: 'unseen', label: 'Unseen location' },
            ]}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button variant="ghost" title="One hour earlier" onClick={() => set({ cutoff: shiftHours(req.cutoff, -1) })}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">One hour earlier</span>
          </Button>
          <label className="sr-only" htmlFor="t2-date">
            Date
          </label>
          <input
            id="t2-date"
            type="date"
            min={istParts(meta.test_start).date}
            max={istParts(meta.data_end).date}
            value={date}
            onChange={(e) => e.target.value && set({ cutoff: istCutoff(e.target.value, hour) })}
            className="rounded-md bg-sand-100/[0.06] px-2 py-1 text-[12.5px] text-sand-100 ring-1 ring-inset ring-sand-100/12 [color-scheme:dark]"
          />
          <label className="sr-only" htmlFor="t2-hour">
            Hour (IST)
          </label>
          <select id="t2-hour" value={hour} onChange={(e) => set({ cutoff: istCutoff(date, Number(e.target.value)) })} className="rounded-md bg-sand-100/[0.06] px-2 py-1 text-[12.5px] text-sand-100 ring-1 ring-inset ring-sand-100/12 [color-scheme:dark]">
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
          <Button variant="ghost" title="One hour later" onClick={() => set({ cutoff: shiftHours(req.cutoff, 1) })}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">One hour later</span>
          </Button>
        </div>
        {quick
          .filter(([, xs]) => xs.length)
          .map(([label, xs]) => (
            <div key={label} className="mt-2 flex flex-wrap items-center gap-1 text-[11.5px] text-sand-400">
              <span className="mr-1">{label}:</span>
              {xs.map((c) => (
                <button key={c} type="button" onClick={() => set({ cutoff: c })} className={`cursor-pointer rounded px-1.5 py-0.5 hover:bg-sand-100/[0.08] ${c === req.cutoff ? 'bg-accent-500/20 text-sand-50' : 'text-accent-300'}`}>
                  {shortTime(c)}
                </button>
              ))}
            </div>
          ))}
        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" onClick={() => run(req)} disabled={busy}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" /> {busy ? 'Running…' : 'Run prediction'}
          </Button>
          {stale && !busy && <span className="text-[11.5px] text-sand-400">Settings changed</span>}
        </div>
      </Block>

      <Block title={replay && resultStation ? `${shortName(resultStation.name)} · ${shortTime(replay.target_time)}` : 'Prediction'}>
        {error && <p className="text-[12.5px] text-accent-300">{error}</p>}
        {!error && !replay && <p className="text-[12.5px] text-sand-400">Running…</p>}
        {replay && (
          <div className={`@container ${busy || stale ? 'opacity-60 transition-opacity' : 'transition-opacity'}`}>
            <div className="grid grid-cols-2 gap-2 @xl:grid-cols-3">
              <PmCard p="pm25" r={replay.pollutants.pm25} />
              <PmCard p="pm10" r={replay.pollutants.pm10} />
              <AqiCard replay={replay} />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {!replay.target_reading_at_cutoff.recorded && !unseen && <Chip tone="text-amber-200">Sensor reading missing</Chip>}
              {avail.length > 0 ? (
                <>
                  <Chip tone={low ? 'text-accent-300' : 'text-amber-200'}>Reliability: {low ? 'low' : 'caution'}</Chip>
                  <Chip>{donors} nearby sensors</Chip>
                  <Chip>nearest {fmt(nearest ?? NaN, 1)} km</Chip>
                </>
              ) : (
                <Chip tone="text-accent-300">Model abstained</Chip>
              )}
            </div>
            {outOfRange && <p className="mt-1.5 text-[11.5px] text-amber-200">Some inputs are outside the model’s training range.</p>}
          </div>
        )}
      </Block>

      {replay && (
        <Block title="Sensor failure simulation">
          <table className="w-full text-[12.5px]">
            <thead className="text-[11px] text-sand-500">
              <tr>
                <th className="pb-1 text-left font-medium">Nearby sensor</th>
                <th className="pb-1 text-right font-medium">km</th>
                <th className="pb-1 text-right font-medium">PM2.5</th>
                <th className="pb-1 text-right font-medium">PM10</th>
                <th className="pb-1 text-right font-medium">
                  <span className="sr-only">Switch</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {donorRows.map(({ d, pm10 }) => {
                const off = req.outage.includes(d.station);
                return (
                  <tr key={d.station} className="border-t hairline">
                    <td className="py-1.5 text-sand-200">{shortName(d.name)}</td>
                    <td className="num py-1.5 text-right text-sand-400">{fmt(d.distance_km, 1)}</td>
                    <td className="py-1.5 text-right">
                      <DonorCell d={d} />
                    </td>
                    <td className="py-1.5 text-right">
                      <DonorCell d={pm10} />
                    </td>
                    <td className="py-1.5 pl-2 text-right">
                      <button
                        type="button"
                        aria-pressed={off}
                        aria-label={`${shortName(d.name)} sensor ${off ? 'switched off' : 'on'}`}
                        onClick={() => set({ outage: off ? req.outage.filter((x) => x !== d.station) : [...req.outage, d.station] })}
                        className={`cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${off ? 'bg-accent-500 text-white ring-accent-500' : 'text-sand-300 ring-sand-100/15 hover:bg-sand-100/[0.08]'}`}
                      >
                        {off ? 'Off' : 'On'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!unseen && <Toggle checked={req.target_offline} onChange={(v) => set({ target_offline: v })} label={`${shortName(station.name)} sensor offline`} />}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Segmented<string> size="xs" label="Readings lost" value={String(req.loss_level)} onChange={(v) => set({ loss_level: Number(v) })} options={T2_LOSS_LEVELS.map((l) => ({ value: String(l), label: `${Math.round(l * 100)}%` }))} />
            {req.loss_level > 0 && (
              <>
                <Segmented<T2Pattern> size="xs" label="Loss pattern" value={req.loss_pattern} onChange={(v) => set({ loss_pattern: v })} options={(Object.keys(PATTERN_LABEL) as T2Pattern[]).map((k) => ({ value: k, label: PATTERN_LABEL[k] }))} />
                <Segmented<string> size="xs" label="Seed" value={String(req.seed)} onChange={(v) => set({ seed: Number(v) })} options={T2_SEEDS.map((s) => ({ value: String(s), label: String(s) }))} />
              </>
            )}
          </div>
          {stale && (
            <Button className="mt-2" variant="outline" onClick={() => run(req)} disabled={busy}>
              <Play className="h-3.5 w-3.5" aria-hidden="true" /> Run prediction
            </Button>
          )}
        </Block>
      )}

      {replay && (
        <Block>
          <details className="text-[12px]">
            <summary className="cursor-pointer font-semibold text-sand-300 hover:text-sand-100">All monitoring stations at {shortTime(replay.cutoff)}</summary>
            <table className="mt-2 w-full">
              <thead className="text-[11px] text-sand-500">
                <tr>
                  <th className="pb-1 text-left font-medium">Station</th>
                  <th className="pb-1 text-right font-medium">PM2.5</th>
                  <th className="pb-1 text-right font-medium">PM10</th>
                </tr>
              </thead>
              <tbody>
                {replay.network_status.map((s) => (
                  <tr key={s.station} className="border-t hairline">
                    <td className={`py-1 ${s.verified ? 'text-sand-200' : 'text-sand-500'}`}>{shortName(s.name)}</td>
                    {POLS.map((p) => {
                      const r = s.readings[p];
                      return (
                        <td key={p} className={`py-1 text-right ${r.state === 'REPORTING' ? 'num text-sand-200' : r.state === 'LATE' ? 'text-[11px] text-amber-200' : 'text-[11px] text-accent-300'}`}>
                          {r.state === 'REPORTING' ? fmt(r.value ?? NaN, 0) : r.state === 'LATE' ? `${fmt(r.age_hours ?? NaN, 0)} h ago` : 'missing'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Block>
      )}

      {demos.length > 0 && (
        <Block title="Examples">
          <div className="flex flex-wrap gap-1.5">
            {demos.map((d) => (
              <Button key={d.scenario} variant="default" onClick={() => loadDemo(d)}>
                {d.scenario.replace(/^[A-D]_/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}
              </Button>
            ))}
          </div>
        </Block>
      )}

      {replay && ran && (
        <Block title="Intervention sensitivity" right={<Chip tone="text-amber-200">Hypothetical</Chip>}>
          <Task2Planning request={ran} station={verified.find((s) => s.station === ran.station) ?? station} available={replay.pollutants.pm25.prediction.status === 'AVAILABLE'} />
        </Block>
      )}
    </>
  );
}
