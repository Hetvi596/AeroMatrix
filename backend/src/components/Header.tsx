import { Box, Info, ArrowLeft } from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import { DataBadge, Segmented } from './ui';
import type { DisplayMode, Pollutant } from '../types';
import { POLLUTANT_LABEL } from '../utils/colors';

export function Header() {
  const mode = useTwin((s) => s.displayMode);
  const setMode = useTwin((s) => s.setDisplayMode);
  const pollutant = useTwin((s) => s.pollutant);
  const setPollutant = useTwin((s) => s.setPollutant);
  const result = useTwin((s) => s.activeResult);
  const clear = useTwin((s) => s.clearResult);
  const observedField = useTwin((s) => s.observedField);
  const forecastLayer = useTwin((s) => s.forecastLayer);
  const hasObservations = useTwin((s) => !!s.observations || !!s.weatherObs);

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-ink-700 bg-ink-900 px-4">
      <div className="flex items-center gap-2.5">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-cyan-400 to-emerald-500 text-ink-950">
          <Box size={16} strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold text-slate-100">Urban Environmental Digital Twin</div>
          <div className="text-[10.5px] text-slate-400">Pune · ENR01 · Prototype</div>
        </div>
      </div>

      <a
        href={import.meta.env.VITE_LANDING_URL || 'http://localhost:5173'}
        className="ml-2 hidden sm:flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-950/40 px-2.5 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-900/60 hover:text-white transition-colors"
        title="Return to Aero-Matrix Landing Page"
      >
        <ArrowLeft size={13} />
        <span>Landing Page</span>
      </a>

      <div className="ml-4 hidden items-center gap-1.5 lg:flex" title="Every value in this app is labelled with its provenance.">
        <Info size={12} className="text-slate-500" />
        <span className="text-[10.5px] text-slate-500">Provenance:</span>
        <DataBadge status="OBSERVED" className={hasObservations ? '' : 'opacity-40'} />
        <DataBadge status="MODEL_PREDICTION" className={forecastLayer ? '' : 'opacity-40'} />
        <DataBadge status="MODELED_SCENARIO" />
        <DataBadge status="DEMO" />
        <span className="text-[10px] text-slate-600">(dimmed = not yet connected)</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <select
          value={pollutant}
          onChange={(e) => setPollutant(e.target.value as Pollutant)}
          className="rounded-md bg-ink-800 px-2 py-1 text-[12px] text-slate-200 ring-1 ring-inset ring-ink-600 outline-none"
        >
          {(Object.keys(POLLUTANT_LABEL) as Pollutant[]).map((p) => (
            <option key={p} value={p}>
              {POLLUTANT_LABEL[p]}
            </option>
          ))}
        </select>
        <Segmented<DisplayMode>
          value={(mode === 'scenario' || mode === 'delta') && !result ? 'baseline' : mode}
          onChange={setMode}
          options={[
            { value: 'observed', label: 'Observed', disabled: !observedField },
            ...(forecastLayer ? [{ value: 'forecast' as const, label: `Forecast +${forecastLayer.horizonHours}h`, disabled: forecastLayer.pollutant !== pollutant }] : []),
            { value: 'baseline', label: 'Baseline' },
            { value: 'scenario', label: 'Scenario', disabled: !result },
            { value: 'delta', label: 'Δ Change', disabled: !result },
          ]}
        />
        {result && (
          <button onClick={clear} className="text-[11px] text-slate-500 hover:text-slate-300" title="Discard active scenario">
            clear
          </button>
        )}
      </div>
    </header>
  );
}
