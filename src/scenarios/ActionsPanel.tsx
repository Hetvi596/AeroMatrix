import { useMemo } from 'react';
import { Eye, Save } from 'lucide-react';
import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTwin } from '../store/useTwinStore';
import { Block, Button, DataBadge, DeltaText, Disclaimer, SectionHeader } from '../components/ui';
import { evaluateActions } from './actions';
import { axisProps, tooltipStyle } from '../analytics/chartTheme';

export function ActionsPanel() {
  const base = useTwin((s) => s.base)!;
  const applyResult = useTwin((s) => s.applyResult);
  const saveActive = useTwin((s) => s.saveActive);
  const active = useTwin((s) => s.activeResult);
  const rows = useMemo(() => evaluateActions(base), [base]);
  const ranked = [...rows].sort((a, b) => a.result.summary.meanDelta - b.result.summary.meanDelta);
  const chart = ranked.map((r) => ({ name: r.action.name, delta: +r.result.summary.meanDelta.toFixed(2), core: r.action.core }));

  return (
    <>
      <SectionHeader title="Pollution-reduction actions" subtitle="Each action evaluated against the same baseline" right={<DataBadge status="MODELED_SCENARIO" />} />
      <Block title="Modeled Δ mean PM2.5 (µg/m³)">
        <div className="h-48">
          <ResponsiveContainer>
            <BarChart data={chart} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1c2740" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                {...axisProps}
                domain={[(min: number) => Math.floor(Math.min(0, min)), (max: number) => Math.ceil(Math.max(0, max))]}
              />
              <YAxis type="category" dataKey="name" width={118} {...axisProps} tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Tooltip {...tooltipStyle} formatter={(v) => [`${v} µg/m³`, 'Δ mean PM2.5']} />
              <Bar dataKey="delta" radius={[0, 3, 3, 0]}>
                {chart.map((c) => (
                  <Cell key={c.name} fill={c.delta < 0 ? (c.core ? '#38bdf8' : '#0ea5e9aa') : '#fb7185'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Block>
      <Block title="Action results">
        <div className="space-y-2">
          {ranked.map(({ action, implementation, result }, i) => {
            const isActive = active?.params.name === result.params.name;
            return (
              <div key={action.id} className={`rounded-md p-2.5 ring-1 ring-inset ${isActive ? 'bg-amber-500/10 ring-amber-400/30' : 'bg-ink-800/60 ring-ink-700'}`}>
                <div className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded bg-ink-700 text-[10px] font-semibold text-slate-300">{i + 1}</span>
                  <span className="text-[12px] font-semibold text-slate-100">{action.name}</span>
                  {action.core && <span className="rounded bg-cyan-500/15 px-1 text-[9px] font-semibold tracking-wide text-cyan-300">ENR01 CORE</span>}
                  <span className="ml-auto text-[12px]">
                    <DeltaText value={result.summary.meanDelta} digits={2} />
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">{implementation}</div>
                <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10.5px] text-slate-500">
                  <span>
                    Δ% <DeltaText value={result.summary.meanDeltaPct} unit="%" />
                  </span>
                  <span>Affected <span className="num text-slate-300">{result.summary.affectedCount}</span></span>
                  <span>
                    High-risk <span className="num text-slate-300">{result.summary.highRiskBaseline}→{result.summary.highRiskScenario}</span>
                  </span>
                </div>
                <div className="mt-2 flex gap-1.5">
                  <Button className="flex-1 !py-1 text-[11px]" onClick={() => applyResult(result)}>
                    <Eye size={12} /> Show on map
                  </Button>
                  <Button
                    className="flex-1 !py-1 text-[11px]"
                    onClick={() => {
                      applyResult(result);
                      saveActive();
                    }}
                  >
                    <Save size={12} /> Save
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Block>
      <Block>
        <Disclaimer>
          Ranking is by modeled mean PM2.5 change from an uncalibrated prototype model on demo inputs. Magnitudes are illustrative and
          must be re-estimated once real data and a validated model are available.
        </Disclaimer>
      </Block>
    </>
  );
}
