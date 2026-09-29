import { useTwin } from '../store/useTwinStore';
import { POLLUTANT_LABEL, POLLUTANT_RANGE, POLLUTANT_UNIT, deltaColor, pollutionColor, rgbToCss } from '../utils/colors';
import { DataBadge } from '../components/ui';

export function MapLegend() {
  const pollutant = useTwin((s) => s.pollutant);
  const mode = useTwin((s) => s.displayMode);
  const result = useTwin((s) => s.activeResult);
  const layers = useTwin((s) => s.layers);
  const field = useTwin((s) => s.observedField);
  const aggWindow = useTwin((s) => s.aggWindow);
  const isDelta = mode === 'delta' && result;
  const showScenario = (mode === 'scenario' || mode === 'delta') && result;
  const isObserved = mode === 'observed' && field;
  const forecast = useTwin((s) => s.forecastLayer);
  const isForecast = mode === 'forecast' && forecast;

  const [lo, hi] = POLLUTANT_RANGE[pollutant];
  const stops = Array.from({ length: 12 }, (_, i) => i / 11);
  let gradient: string;
  let ticks: string[];
  if (isDelta) {
    const scale = Math.max(1, ...Object.values(result!.delta).map((d) => Math.abs(d[pollutant])));
    gradient = stops.map((t) => rgbToCss(deltaColor((t * 2 - 1) * scale, scale))).join(',');
    ticks = [`−${scale.toFixed(1)}`, '0', `+${scale.toFixed(1)}`];
  } else {
    gradient = stops.map((t) => rgbToCss(pollutionColor(pollutant, lo + t * (hi - lo)))).join(',');
    ticks = [String(lo), String(Math.round((lo + hi) / 2)), `${hi}+`];
  }

  return (
    <div className="absolute bottom-3 left-3 z-10 w-64 rounded-lg bg-ink-900/92 p-3 text-[11px] shadow-xl ring-1 ring-ink-700 backdrop-blur">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-200">
          {isDelta ? 'Δ ' : ''}
          {POLLUTANT_LABEL[pollutant]} <span className="font-normal text-slate-500">{POLLUTANT_UNIT[pollutant]}</span>
        </span>
        <DataBadge status={isForecast ? 'MODEL_PREDICTION' : isObserved ? 'OBSERVED' : showScenario ? 'MODELED_SCENARIO' : 'DEMO'} />
      </div>
      <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${gradient})` }} />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      {isObserved && (
        <div className="mt-1 text-[10px] text-emerald-300/80">
          IDW interpolation of {field!.stationCount} station mean(s) · {aggWindow === 'last24h' ? 'last 24 h' : 'whole period'}
        </div>
      )}
      {isForecast && (
        <div className="mt-1 text-[10px] text-sky-300/80">
          {forecast!.model} forecast valid {forecast!.validAt.slice(0, 16)} · IDW of {forecast!.stations.length} station forecast(s)
        </div>
      )}
      {!isDelta && pollutant === 'pm25' && (
        <div className="mt-1.5 grid grid-cols-4 gap-1 text-center text-[9.5px] text-slate-400">
          <span className="rounded bg-green-500/15 py-0.5">LOW ≤30</span>
          <span className="rounded bg-yellow-500/15 py-0.5">MOD ≤60</span>
          <span className="rounded bg-orange-500/15 py-0.5">HIGH ≤90</span>
          <span className="rounded bg-red-500/15 py-0.5">V.HIGH</span>
        </div>
      )}
      {isDelta && <div className="mt-1 text-[10px] text-slate-500">Blue = modeled decrease · Red = modeled increase</div>}
      {showScenario && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-400">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed border-rose-400" /> affected zones (|Δ PM2.5| ≥ 0.5)
        </div>
      )}
      {layers.traffic && (
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400">
          Traffic:
          {[
            ['#22c55e', 'Low'],
            ['#facc15', 'Med'],
            ['#f97316', 'High'],
            ['#ef4444', 'V.High'],
          ].map(([c, l]) => (
            <span key={l} className="flex items-center gap-0.5">
              <span className="inline-block h-1 w-3 rounded" style={{ background: c }} />
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
