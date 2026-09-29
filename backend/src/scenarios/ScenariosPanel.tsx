import type { ReactNode } from 'react';
import { Eye, Trash2, Wand2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTwin } from '../store/useTwinStore';
import { Block, Button, DataBadge, DeltaText, Disclaimer, Empty, SectionHeader } from '../components/ui';
import { defaultParams, makeScenarioIndustry, scenarioService } from '../services/scenarioService';
import { fmt, fmtInt } from '../utils/format';
import { SOURCE_COLORS, SOURCE_LABELS } from '../utils/colors';
import { axisProps, gridProps, tooltipStyle } from '../analytics/chartTheme';
import type { ScenarioParams } from '../types';

export function ScenariosPanel() {
  const base = useTwin((s) => s.base)!;
  const saved = useTwin((s) => s.saved);
  const compareIds = useTwin((s) => s.compareIds);
  const toggleCompare = useTwin((s) => s.toggleCompare);
  const loadSaved = useTwin((s) => s.loadSaved);
  const deleteSaved = useTwin((s) => s.deleteSaved);
  const applyResult = useTwin((s) => s.applyResult);
  const saveActive = useTwin((s) => s.saveActive);
  const active = useTwin((s) => s.activeResult);

  const generateExamples = () => {
    const site: [number, number] = [73.835, 18.585]; // north-west, upwind of the core under WNW winds
    const d = defaultParams(base);
    const list: ScenarioParams[] = [
      { ...d, name: 'A · Current traffic' },
      { ...d, name: 'B · Traffic +30%', trafficMultiplier: 1.3 },
      { ...d, name: 'C · Traffic restriction −20%', trafficMultiplier: 0.8 },
      { ...d, name: 'D · New industry', addedIndustries: [makeScenarioIndustry(site, 'Chemical', 80)] },
      { ...d, name: 'E · New industry + green buffer', addedIndustries: [makeScenarioIndustry(site, 'Chemical', 80)], greenBuffer: true },
    ];
    for (const p of list) {
      applyResult(scenarioService.run(base, p));
      saveActive();
    }
  };

  const compared = saved.filter((s) => compareIds.includes(s.id));
  const chartData = compared.map((s) => ({
    name: s.params.name.length > 18 ? s.params.name.slice(0, 17) + '…' : s.params.name,
    Baseline: +s.summary.meanBaseline.toFixed(1),
    Scenario: +s.summary.meanScenario.toFixed(1),
  }));
  const srcData = compared.map((s) => ({
    name: s.params.name.length > 12 ? s.params.name.slice(0, 11) + '…' : s.params.name,
    traffic: +s.sourceContribution.scenario.traffic.toFixed(1),
    industry: +s.sourceContribution.scenario.industry.toFixed(1),
    other: +s.sourceContribution.scenario.other.toFixed(1),
    background: +s.sourceContribution.scenario.background.toFixed(1),
  }));

  return (
    <>
      <SectionHeader title="Scenarios" subtitle="Saved what-if scenarios and side-by-side comparison" right={<DataBadge status="MODELED_SCENARIO" />} />
      <Block>
        <div className="flex gap-1.5">
          <Button className="flex-1" onClick={generateExamples}>
            <Wand2 size={13} /> Generate example set A–E
          </Button>
          {active && !saved.some((s) => s.id === active.id) && (
            <Button variant="primary" onClick={() => saveActive()}>
              Save active
            </Button>
          )}
        </div>
        <Disclaimer>Scenarios are stored locally in this browser (parameters only; results are recomputed deterministically).</Disclaimer>
      </Block>

      <Block title={`Saved (${saved.length})`} right={<span className="text-[10px] text-slate-500">☑ = compare (max 4)</span>}>
        {saved.length === 0 ? (
          <Empty>No saved scenarios yet. Run one in the What-If simulator and click Save, or generate the example set.</Empty>
        ) : (
          <div className="space-y-1">
            {saved.map((s) => (
              <div key={s.id} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] ${active?.id === s.id ? 'bg-amber-500/10 ring-1 ring-amber-400/30' : 'hover:bg-ink-800'}`}>
                <input type="checkbox" checked={compareIds.includes(s.id)} onChange={() => toggleCompare(s.id)} className="accent-cyan-400" />
                <span className="truncate text-slate-200">{s.params.name}</span>
                <span className="ml-auto text-[11px]">
                  <DeltaText value={s.summary.meanDelta} />
                </span>
                <button title="Show on map" onClick={() => loadSaved(s.id)} className="text-slate-500 hover:text-cyan-300">
                  <Eye size={13} />
                </button>
                <button title="Delete" onClick={() => deleteSaved(s.id)} className="text-slate-500 hover:text-rose-300">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Block>

      {compared.length > 0 && (
        <>
          <Block title="Comparison">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1 text-left font-medium">Metric</th>
                    {compared.map((s) => (
                      <th key={s.id} className="px-1 text-right font-medium" title={s.params.name}>
                        {s.params.name.split('·')[0].trim().slice(0, 10)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="num">
                  {[
                    ['Mean PM2.5', (s: (typeof compared)[number]) => fmt(s.summary.meanScenario)],
                    ['Δ mean', (s: (typeof compared)[number]) => <DeltaText value={s.summary.meanDelta} />],
                    ['Δ %', (s: (typeof compared)[number]) => <DeltaText value={s.summary.meanDeltaPct} unit="%" />],
                    ['Max ↑', (s: (typeof compared)[number]) => fmt(s.summary.maxIncrease)],
                    ['Affected', (s: (typeof compared)[number]) => s.summary.affectedCount],
                    ['High-risk', (s: (typeof compared)[number]) => s.summary.highRiskScenario],
                    ['Pop. worse', (s: (typeof compared)[number]) => fmtInt(s.summary.exposedPopulation / 1000) + 'k'],
                  ].map(([label, f]) => (
                    <tr key={label as string} className="border-t border-ink-800">
                      <td className="py-1 text-slate-400">{label as string}</td>
                      {compared.map((s) => (
                        <td key={s.id} className="px-1 text-right text-slate-200">
                          {(f as (s: (typeof compared)[number]) => ReactNode)(s)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>
          <Block title="Mean PM2.5 — baseline vs scenario">
            <div className="h-44">
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="name" {...axisProps} tick={{ fill: '#64748b', fontSize: 9 }} interval={0} />
                  <YAxis {...axisProps} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="Baseline" fill="#475569" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Scenario" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Block>
          <Block title="Source mix per scenario (µg/m³, demo)">
            <div className="h-44">
              <ResponsiveContainer>
                <BarChart data={srcData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="name" {...axisProps} tick={{ fill: '#64748b', fontSize: 9 }} interval={0} />
                  <YAxis {...axisProps} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {(['traffic', 'industry', 'other', 'background'] as const).map((k) => (
                    <Bar key={k} dataKey={k} name={SOURCE_LABELS[k]} stackId="s" fill={SOURCE_COLORS[k]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Block>
        </>
      )}
    </>
  );
}
