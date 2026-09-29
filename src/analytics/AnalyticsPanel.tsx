import { useEffect, useState } from 'react';
import { ArrowDown, CircleDashed, CircleCheck, CircleDot } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDisplayedStates, useTwin } from '../store/useTwinStore';
import { Block, DataBadge, Disclaimer, SectionHeader } from '../components/ui';
import { SourceDonut } from './SourceDonut';
import { meanContribution } from '../services/pollutionModel';
import { FUTURE_MODEL_FEATURES, predictionService, type ForecastResult } from '../services/predictionService';
import { SOURCE_COLORS, SOURCE_LABELS } from '../utils/colors';
import { axisProps, gridProps, tooltipStyle } from './chartTheme';

const PIPELINE = [
  'Data ingestion (CPCB, ERA5, OSM, traffic, industry, DEM, land use)',
  'Cleaning & QA (gaps, outliers, station metadata)',
  'Feature engineering (lags, rolling stats, meteorology, spatial)',
  'Spatial-temporal grid creation',
  'Training (baseline RF/XGBoost → LightGBM → temporal if justified)',
  'Validation on held-out historical periods',
  'Forecast (PM2.5 first; PM10/NO₂ next)',
  'Explainability (SHAP) → source attribution',
  'Scenario simulation via ScenarioService',
];

const SOURCES: { name: string; state: 'connected' | 'demo' | 'planned'; note: string }[] = [
  { name: 'CPCB CAAQMS air quality', state: 'planned', note: 'OBSERVED — not connected' },
  { name: 'ERA5 meteorology', state: 'planned', note: 'REANALYSIS — not connected' },
  { name: 'Traffic volumes', state: 'demo', note: 'demo corridors' },
  { name: 'Industrial registry / emissions', state: 'demo', note: 'fictional demo records' },
  { name: 'Green cover / land use', state: 'demo', note: 'approximate polygons' },
  { name: 'DEM elevation', state: 'connected', note: 'AWS Terrarium (display + seating)' },
  { name: 'Base map, roads, labels', state: 'connected', note: 'Esri / OSM / CARTO tiles (display only)' },
];

export function AnalyticsPanel() {
  const states = useDisplayedStates();
  const result = useTwin((s) => s.activeResult);
  const mode = useTwin((s) => s.displayMode);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const contrib = meanContribution(states);
  const isScn = !!result && mode !== 'baseline';

  useEffect(() => {
    predictionService.forecast('city', 'pm25', 48).then(setForecast);
  }, []);

  const top = [...states].sort((a, b) => b.pm25 - a.pm25).slice(0, 10).map((s) => ({
    name: s.cellId,
    traffic: +s.contributionAbs.traffic.toFixed(1),
    industry: +s.contributionAbs.industry.toFixed(1),
    other: +s.contributionAbs.other.toFixed(1),
    background: +s.contributionAbs.background.toFixed(1),
  }));

  return (
    <>
      <SectionHeader title="Analytics" subtitle="Source contribution, forecasting & validation readiness" right={<DataBadge status={isScn ? 'MODELED_SCENARIO' : 'DEMO'} />} />
      <Block title="City source contribution" right={<span className="text-[9.5px] font-semibold tracking-wider text-fuchsia-300">DEMO SOURCE CONTRIBUTION</span>}>
        <SourceDonut value={contrib} size={120} />
        {isScn && (
          <div className="mt-2 text-[10.5px] text-slate-500">
            Baseline traffic share {((result!.sourceContribution.baseline.traffic / Object.values(result!.sourceContribution.baseline).reduce((a, b) => a + b, 0)) * 100).toFixed(0)}% →
            scenario {((contrib.traffic / Object.values(contrib).reduce((a, b) => a + b, 0)) * 100).toFixed(0)}%
          </div>
        )}
      </Block>
      <Block title="Hotspot source breakdown (µg/m³)">
        <div className="h-48">
          <ResponsiveContainer>
            <BarChart data={top} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="name" {...axisProps} tick={{ fill: '#64748b', fontSize: 9 }} interval={0} angle={-35} textAnchor="end" height={34} />
              <YAxis {...axisProps} />
              <Tooltip {...tooltipStyle} />
              {(['traffic', 'industry', 'other', 'background'] as const).map((k) => (
                <Bar key={k} dataKey={k} name={SOURCE_LABELS[k]} stackId="s" fill={SOURCE_COLORS[k]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Disclaimer>From the prototype rule model. Final attribution will use a trained model + SHAP on real data.</Disclaimer>
      </Block>
      <Block title="PM2.5 forecast" right={<DataBadge status="MODEL_PREDICTION" className="opacity-50" />}>
        <div className="rounded-md border border-dashed border-sky-400/30 bg-sky-500/5 px-3 py-3 text-[11.5px] text-slate-300">
          <div className="font-semibold text-sky-300">No forecast shown — model not trained</div>
          <div className="mt-1 text-slate-400">{forecast?.reason ?? 'Checking prediction service…'}</div>
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
            {['Persistence baseline', 'Random Forest', 'XGBoost (lags)', 'LightGBM'].map((m) => (
              <tr key={m} className="border-t border-ink-800">
                <td className="py-1 text-slate-400">{m}</td>
                <td className="text-right">—</td>
                <td className="text-right">—</td>
                <td className="text-right">—</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Disclaimer>Populated after training on real data. Final model is chosen by validation performance, not assumption.</Disclaimer>
      </Block>
      <Block title="Future ML pipeline">
        <div className="space-y-0.5">
          {PIPELINE.map((p, i) => (
            <div key={p}>
              <div className="rounded bg-ink-800/60 px-2 py-1 text-[11px] text-slate-300">{p}</div>
              {i < PIPELINE.length - 1 && <ArrowDown size={10} className="mx-auto text-slate-600" />}
            </div>
          ))}
        </div>
      </Block>
      <Block title="Planned model features">
        <div className="space-y-1 text-[10.5px]">
          {Object.entries(FUTURE_MODEL_FEATURES).map(([k, v]) => (
            <div key={k}>
              <span className="text-slate-400">{k}: </span>
              <span className="font-mono text-slate-500">{v.join(', ')}</span>
            </div>
          ))}
        </div>
      </Block>
      <Block title="Data sources">
        <div className="space-y-1">
          {SOURCES.map((s) => (
            <div key={s.name} className="flex items-center gap-2 text-[11px]">
              {s.state === 'connected' ? (
                <CircleCheck size={12} className="text-emerald-400" />
              ) : s.state === 'demo' ? (
                <CircleDot size={12} className="text-fuchsia-400" />
              ) : (
                <CircleDashed size={12} className="text-slate-600" />
              )}
              <span className="text-slate-300">{s.name}</span>
              <span className="ml-auto text-[10px] text-slate-500">{s.note}</span>
            </div>
          ))}
        </div>
      </Block>
    </>
  );
}
