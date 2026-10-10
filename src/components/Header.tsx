import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CircleHelp, Columns2, Info, Upload, X } from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import { STATUS_STYLE, Segmented } from './ui';
import { LogoMark, Wordmark } from './Brand';
import type { DataStatus, DisplayMode, Pollutant } from '../types';
import { POLLUTANT_LABEL } from '../utils/colors';

/** Optional link back to the marketing site (set VITE_LANDING_URL in .env). */
const LANDING_URL = (import.meta.env.VITE_LANDING_URL as string | undefined)?.trim();

/** Which source the map is currently drawing from. */
export function useMapSource(): DataStatus {
  return useTwin((s) => {
    if (s.displayMode === 'observed' && s.observedField) return 'OBSERVED';
    if (s.displayMode === 'forecast' && s.forecastLayer) return 'MODEL_PREDICTION';
    if ((s.displayMode === 'scenario' || s.displayMode === 'delta') && s.activeResult) return 'MODELED_SCENARIO';
    return 'DEMO';
  });
}

/** Compact source information: what the map shows now, and what each source means. */
function DataSourcesMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasObs = useTwin((s) => !!s.observations || !!s.weatherObs);
  const forecast = useTwin((s) => !!s.forecastLayer);
  const scenario = useTwin((s) => !!s.activeResult);
  const setSection = useTwin((s) => s.setSection);
  const setLeftOpen = useTwin((s) => s.setLeftOpen);
  const now = useMapSource();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const rows: { s: DataStatus; on: boolean; text: string }[] = [
    { s: 'OBSERVED', on: hasObs, text: hasObs ? 'Imported CPCB or weather files are in use.' : 'Available after importing CPCB or weather files.' },
    { s: 'MODEL_PREDICTION', on: forecast, text: forecast ? 'Forecasts from the trained model are loaded.' : 'Available once a model is trained on real data.' },
    { s: 'MODELED_SCENARIO', on: scenario, text: 'What-if results from the prototype rule model, uncalibrated.' },
    { s: 'DEMO', on: true, text: 'Deterministic values from the prototype model, not measurements.' },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Data sources. Map shows ${STATUS_STYLE[now].label.toLowerCase()}`}
        title="Data sources"
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-sand-300 ring-1 ring-inset ring-sand-100/10 transition-colors hover:text-sand-50 hover:ring-sand-100/25"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLE[now].dot}`} aria-hidden="true" />
        <Info size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="float-surface absolute right-0 top-10 z-50 w-[292px] rounded-xl p-4 animate-rise">
          <div className="text-[13px] font-semibold text-sand-50">Data sources</div>
          <div className="mt-0.5 text-[12px] text-sand-400">
            The map currently shows <span className="font-semibold text-sand-200">{STATUS_STYLE[now].label.toLowerCase()}</span>.
          </div>
          <ul className="mt-3 space-y-2.5">
            {rows.map((r) => (
              <li key={r.s} className={`flex gap-2.5 ${r.on ? '' : 'opacity-55'}`}>
                <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${STATUS_STYLE[r.s].dot}`} aria-hidden="true" />
                <div>
                  <div className="text-[12.5px] font-semibold text-sand-100">{STATUS_STYLE[r.s].label}</div>
                  <div className="text-[11.5px] leading-snug text-sand-400">{r.text}</div>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              setSection('data');
              setLeftOpen(true);
              setOpen(false);
            }}
            className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-medium text-sand-200 ring-1 ring-inset ring-sand-100/15 hover:bg-sand-100/[0.06] hover:text-sand-50"
          >
            <Upload size={13} aria-hidden="true" /> Import data
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const mode = useTwin((s) => s.displayMode);
  const setMode = useTwin((s) => s.setDisplayMode);
  const pollutant = useTwin((s) => s.pollutant);
  const setPollutant = useTwin((s) => s.setPollutant);
  const result = useTwin((s) => s.activeResult);
  const clear = useTwin((s) => s.clearResult);
  const observedField = useTwin((s) => s.observedField);
  const forecastLayer = useTwin((s) => s.forecastLayer);
  const compareOn = useTwin((s) => s.compareOn);
  const setCompare = useTwin((s) => s.setCompare);
  const setIntroOpen = useTwin((s) => s.setIntroOpen);

  return (
    <header className="relative z-30 flex h-[52px] shrink-0 items-center gap-3 border-b hairline bg-ink-950 px-3 sm:gap-4 sm:px-5">
      <div className="flex shrink-0 items-center gap-2.5 text-sand-50">
        <LogoMark size={26} className="text-sand-50" />
        <Wordmark className="max-[380px]:hidden" />
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-2.5">
        {/* View — Observed / Baseline / Scenario / Change */}
        <div className="hidden items-center gap-2 md:flex">
          <span className="text-[11.5px] font-medium text-sand-400">View</span>
          <Segmented<DisplayMode>
            label="Map view"
            value={(mode === 'scenario' || mode === 'delta') && !result ? 'baseline' : mode}
            onChange={(m) => {
              setMode(m);
              if (m !== 'scenario') setCompare(false);
            }}
            options={[
              ...(observedField ? [{ value: 'observed' as const, label: 'Observed' }] : []),
              ...(forecastLayer ? [{ value: 'forecast' as const, label: `Forecast +${forecastLayer.horizonHours}h`, disabled: forecastLayer.pollutant !== pollutant }] : []),
              { value: 'baseline', label: 'Baseline' },
              { value: 'scenario', label: 'Scenario', disabled: !result },
              { value: 'delta', label: 'Δ Change', disabled: !result },
            ]}
          />
          {result && (
            <>
              <button
                type="button"
                onClick={() => setCompare(!compareOn)}
                aria-pressed={compareOn}
                className={`flex h-[30px] cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium ring-1 ring-inset transition-colors ${
                  compareOn ? 'bg-emerald-500 text-white ring-emerald-400/50' : 'text-sand-200 ring-sand-100/15 hover:ring-sand-100/30'
                }`}
                title="Swipe between baseline and scenario on the map"
              >
                <Columns2 size={14} aria-hidden="true" /> Compare
              </button>
              <button
                type="button"
                onClick={clear}
                className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-sand-400 hover:bg-sand-100/10 hover:text-sand-100"
                title="Discard active scenario"
                aria-label="Discard active scenario"
              >
                <X size={14} />
              </button>
            </>
          )}
        </div>

        <span className="mx-0.5 hidden h-5 w-px bg-sand-100/12 md:block" aria-hidden="true" />

        {/* Indicator — pollutant selector */}
        <label className="flex h-8 items-center gap-2 rounded-lg pl-2.5 pr-1 text-[12px] ring-1 ring-inset ring-sand-100/12">
          <span className="hidden text-[11.5px] font-medium text-sand-400 sm:inline">Indicator</span>
          <select
            value={pollutant}
            onChange={(e) => setPollutant(e.target.value as Pollutant)}
            aria-label="Indicator"
            className="cursor-pointer rounded-md bg-accent-500/20 px-2 py-0.5 text-[12.5px] font-semibold text-accent-100 outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            {(Object.keys(POLLUTANT_LABEL) as Pollutant[]).map((p) => (
              <option key={p} value={p} className="bg-ink-900 text-sand-100">
                {POLLUTANT_LABEL[p]}
              </option>
            ))}
          </select>
        </label>

        <DataSourcesMenu />
        <button
          type="button"
          onClick={() => setIntroOpen(true)}
          className="hidden h-8 w-8 cursor-pointer place-items-center rounded-lg text-sand-400 ring-1 ring-inset ring-sand-100/10 hover:text-sand-50 sm:grid"
          title="Guide"
          aria-label="Open guide"
        >
          <CircleHelp size={15} />
        </button>
        {LANDING_URL && (
          <a
            href={LANDING_URL}
            className="hidden h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium text-accent-200 ring-1 ring-inset ring-accent-400/55 hover:bg-accent-500/10 lg:flex"
          >
            <ArrowLeft size={13} /> Back to site
          </a>
        )}
      </div>
    </header>
  );
}
