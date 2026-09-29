import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { SourceContribution } from '../types';
import { SOURCE_COLORS, SOURCE_LABELS } from '../utils/colors';

export function SourceDonut({ value, size = 120 }: { value: SourceContribution; size?: number }) {
  const total = value.traffic + value.industry + value.background + value.other || 1;
  const data = (Object.keys(SOURCE_COLORS) as (keyof SourceContribution)[]).map((k) => ({
    key: k,
    name: SOURCE_LABELS[k],
    value: value[k],
    pct: (value[k] / total) * 100,
  }));
  return (
    <div className="flex items-center gap-3">
      <div style={{ width: size, height: size }} className="shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={size * 0.3} outerRadius={size * 0.47} stroke="none" paddingAngle={2} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.key} fill={SOURCE_COLORS[d.key]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v, n) => [`${Number(v).toFixed(1)} µg/m³`, String(n)]}
              contentStyle={{ background: '#0e1524', border: '1px solid #2a3754', fontSize: 11, borderRadius: 6 }}
              itemStyle={{ color: '#e2e8f0' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {data.map((d) => (
          <div key={d.key} className="flex items-center gap-1.5 text-[11px]">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: SOURCE_COLORS[d.key] }} />
            <span className="truncate text-slate-400">{d.name}</span>
            <span className="num ml-auto font-medium text-slate-100">{d.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
