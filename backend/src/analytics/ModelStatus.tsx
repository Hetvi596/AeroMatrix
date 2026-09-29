import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Block, Button, DataBadge, Disclaimer } from '../components/ui';
import { API_URL, backendClient, type BackendHealth, type BackendMetrics, type StationForecast } from '../services/predictionService';
import { useTwin } from '../store/useTwinStore';
import { refreshForecastLayer } from './forecastLayer';
import { fmt } from '../utils/format';

type State =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'no-model' }
  | { kind: 'ready'; health: BackendHealth; metrics: BackendMetrics; forecasts: StationForecast[] };

const MODEL_LABEL: Record<string, string> = {
  persistence: 'Persistence baseline',
  random_forest: 'Random Forest',
  xgboost: 'XGBoost',
  lightgbm: 'LightGBM',
};

/** Forecast + validation blocks. Shows real numbers only when backend/api serves a model trained on real data. */
export function ModelStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const layer = useTwin((s) => s.forecastLayer);
  const mode = useTwin((s) => s.displayMode);
  const setMode = useTwin((s) => s.setDisplayMode);
  const setPollutant = useTwin((s) => s.setPollutant);

  const load = async () => {
    setState({ kind: 'loading' });
    try {
      const res = await refreshForecastLayer();
      if (!res) return setState({ kind: 'offline' });
      const { health, forecasts } = res;
      if (!health.model_loaded || !health.model) return setState({ kind: 'no-model' });
      const metrics = await backendClient.metrics();
      setState({ kind: 'ready', health, metrics, forecasts });
    } catch {
      setState({ kind: 'offline' });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const refresh = (
    <button onClick={load} className="text-slate-500 hover:text-cyan-300" title="Re-check backend">
      <RefreshCw size={12} className={state.kind === 'loading' ? 'animate-spin' : ''} />
    </button>
  );

  if (state.kind !== 'ready') {
    const msg =
      state.kind === 'loading'
        ? 'Checking prediction service…'
        : state.kind === 'offline'
          ? `Backend not running at ${API_URL}. Start it with: uvicorn backend.api.main:app --port 8000`
          : 'Backend is running but no model is trained yet — run python -m backend.ml.train on real CPCB data.';
    return (
      <>
        <Block title="PM2.5 forecast" right={<div className="flex items-center gap-2">{refresh}<DataBadge status="MODEL_PREDICTION" className="opacity-50" /></div>}>
          <div className="rounded-md border border-dashed border-sky-400/30 bg-sky-500/5 px-3 py-3 text-[11.5px] text-slate-300">
            <div className="font-semibold text-sky-300">No forecast shown — model not trained</div>
            <div className="mt-1 text-slate-400">{msg}</div>
          </div>
        </Block>
        <Block title="Validation (hold-out test period)">
          <table className="w-full text-[11px]">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left font-medium">Model</th>
                <th className="text-right font-medium">RMSE</th>
                <th className="text-right font-medium">MAE</th>
                <th className="text-right font-medium">R²</th>
              </tr>
            </thead>
            <tbody className="text-slate-500">
              {Object.values(MODEL_LABEL).map((m) => (
                <tr key={m} className="border-t border-ink-800">
                  <td className="py-1 text-slate-400">{m}</td>
                  <td className="text-right">—</td>
                  <td className="text-right">—</td>
                  <td className="text-right">—</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Disclaimer>Populated automatically from the backend after training on real data. The model is chosen by validation RMSE.</Disclaimer>
        </Block>
      </>
    );
  }

  const { health, metrics, forecasts } = state;
  const m = health.model!;
  const rows = Object.entries(metrics.results).sort(([, a], [, b]) => a.test.rmse - b.test.rmse);
  return (
    <>
      <Block title={`${m.target.toUpperCase()} forecast · +${m.horizon_hours} h`} right={<div className="flex items-center gap-2">{refresh}<DataBadge status="MODEL_PREDICTION" /></div>}>
        <div className="space-y-1">
          {forecasts.map((f) => (
            <div key={f.station} className="flex items-center gap-2 text-[11.5px]">
              <span className="truncate text-slate-200">{f.station}</span>
              <span className="ml-auto text-[10px] text-slate-500">valid {f.valid_at.slice(0, 16)}</span>
              <span className="num w-12 text-right font-semibold text-sky-200">{fmt(f.value, 0)}</span>
            </div>
          ))}
        </div>
        {layer ? (
          <Button
            variant={mode === 'forecast' ? 'primary' : 'default'}
            className="mt-2 w-full"
            onClick={() => {
              setPollutant(layer.pollutant);
              setMode(mode === 'forecast' ? 'baseline' : 'forecast');
            }}
          >
            {mode === 'forecast' ? 'Showing forecast map — back to model' : 'Show forecast on map'}
          </Button>
        ) : (
          <Disclaimer>Station coordinates are needed to map forecasts — train with --stations or load observations with coordinates.</Disclaimer>
        )}
        <Disclaimer>
          {MODEL_LABEL[m.chosen_model] ?? m.chosen_model} trained on {m.data_period[0].slice(0, 10)} → {m.data_period[1].slice(0, 10)}. Issued from the
          latest observation per station.
        </Disclaimer>
      </Block>
      <Block title="Validation (hold-out test period)">
        <table className="w-full text-[11px]">
          <thead className="text-slate-500">
            <tr>
              <th className="text-left font-medium">Model</th>
              <th className="text-right font-medium">RMSE</th>
              <th className="text-right font-medium">MAE</th>
              <th className="text-right font-medium">R²</th>
            </tr>
          </thead>
          <tbody className="num">
            {rows.map(([name, r]) => (
              <tr key={name} className={`border-t border-ink-800 ${name === metrics.chosen_model ? 'text-sky-200' : 'text-slate-300'}`}>
                <td className="py-1">
                  {MODEL_LABEL[name] ?? name}
                  {name === metrics.chosen_model && <span className="ml-1 text-[9px] font-semibold text-sky-300">CHOSEN</span>}
                </td>
                <td className="text-right">{fmt(r.test.rmse, 2)}</td>
                <td className="text-right">{fmt(r.test.mae, 2)}</td>
                <td className="text-right">{fmt(r.test.r2, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Disclaimer>Test period starts {metrics.split.test_start.slice(0, 10)} (unseen during selection; selection used validation from {metrics.split.val_start.slice(0, 10)}).</Disclaimer>
        {metrics.shap_group_importance && (
          <div className="mt-2 space-y-1">
            <div className="text-[10.5px] text-slate-400">SHAP importance by feature group</div>
            {Object.entries(metrics.shap_group_importance).map(([g, v]) => (
              <div key={g} className="flex items-center gap-2 text-[11px]">
                <span className="w-20 text-slate-400">{g}</span>
                <div className="h-1.5 flex-1 rounded-full bg-ink-700">
                  <div className="h-1.5 rounded-full bg-sky-400" style={{ width: `${v * 100}%` }} />
                </div>
                <span className="num w-9 text-right text-slate-300">{(v * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        )}
      </Block>
    </>
  );
}
