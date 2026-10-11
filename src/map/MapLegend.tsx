import { useTwin } from '../store/useTwinStore';
import { POLLUTANT_LABEL, POLLUTANT_RANGE, POLLUTANT_UNIT, RISK_COLOR, TRAFFIC_COLORS, deltaColor, pollutionColor, rgbToCss } from '../utils/colors';
import { DataBadge } from '../components/ui';
import { useCurrentField } from '../services/liveData';
import { fmtIst } from '../services/pollutantData';

export function MapLegend() {
  const pollutant = useTwin((s) => s.pollutant);
  const preview = useTwin((s) => s.previewResult);
  const displayMode = useTwin((s) => s.displayMode);
  const active = useTwin((s) => s.activeResult);
  const result = preview ?? active;
  const mode = preview ? (displayMode === 'delta' ? 'delta' : 'scenario') : displayMode;
  const layers = useTwin((s) => s.layers);
  const field = useTwin((s) => s.observedField);
  const aggWindow = useTwin((s) => s.aggWindow);
  const isDelta = mode === 'delta' && result;
  const showScenario = (mode === 'scenario' || mode === 'delta') && result;
  const isObserved = mode === 'observed' && field;
  const forecast = useTwin((s) => s.forecastLayer);
  const isForecast = mode === 'forecast' && forecast;
  const current = useCurrentField(pollutant);
  const isCurrent = mode === 'current' && !preview && current;

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
    <div
      className="map-legend float-surface absolute z-10 w-52 rounded-xl px-3 py-2.5 text-[11.5px] md:w-60"
      aria-label="Map legend"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-semibold text-sand-100">
          {isDelta ? 'Δ ' : ''}
          {POLLUTANT_LABEL[pollutant]} <span className="font-normal text-sand-500">{POLLUTANT_UNIT[pollutant]}</span>
        </span>
        <DataBadge status={isCurrent ? 'MODEL_DATA' : isForecast ? 'MODEL_PREDICTION' : isObserved ? 'OBSERVED' : showScenario ? 'MODELED_SCENARIO' : 'DEMO'} />
      </div>
      <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${gradient})` }} />
      <div className="num mt-1 flex justify-between text-[10.5px] text-sand-400">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      {isObserved && (
        <div className="mt-1 text-[10.5px] text-emerald-300/90">
          {field!.stationCount} station{field!.stationCount === 1 ? '' : 's'} · {aggWindow === 'last24h' ? 'last 24 h' : 'whole period'}
        </div>
      )}
      {isCurrent && <div className="mt-1 text-[10.5px] text-sand-400">Current · {fmtIst(current!.time)} IST</div>}
      {!isCurrent && !isObserved && !isForecast && !showScenario && <div className="mt-1 text-[10.5px] text-sand-400">What-If baseline</div>}
      {isForecast && (
        <div className="mt-1 text-[10.5px] text-sky-300/90">
          Forecast valid {forecast!.validAt.slice(0, 16)}
        </div>
      )}
      {!isDelta && pollutant === 'pm25' && (
        <div className="mt-2 hidden grid-cols-4 gap-1 text-[10.5px] text-sand-400 md:grid">
          {(
            [
              ['LOW', 'Low', '≤30'],
              ['MODERATE', 'Mod.', '≤60'],
              ['HIGH', 'High', '≤90'],
              ['VERY_HIGH', 'V. high', '>90'],
            ] as const
          ).map(([k, l, r]) => (
            <span key={k} className="flex flex-col gap-0.5">
              <span className="h-1 rounded-full" style={{ background: RISK_COLOR[k] }} />
              <span>
                {l} <span className="num text-sand-500">{r}</span>
              </span>
            </span>
          ))}
        </div>
      )}
      {isDelta && <div className="mt-1 text-[10.5px] text-sand-400">Blue is a modeled decrease, red an increase.</div>}
      {showScenario && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-sand-400">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed border-[#fb7185]" /> Affected zones (|Δ PM2.5| ≥ 0.5)
        </div>
      )}
      {layers.traffic && (
        <div className="mt-1.5 hidden items-center gap-2 text-[10.5px] text-sand-400 md:flex">
          Traffic
          {[
            [TRAFFIC_COLORS[0], 'Low'],
            [TRAFFIC_COLORS[1], 'Med'],
            [TRAFFIC_COLORS[2], 'High'],
            [TRAFFIC_COLORS[3], 'V. high'],
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
