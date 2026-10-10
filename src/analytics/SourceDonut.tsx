import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { SourceContribution } from '../types';
import { SOURCE_COLORS, SOURCE_LABELS } from '../utils/colors';
import { tooltipStyle } from './chartTheme';

export function SourceDonut({ value, size = 120, legend = true }: { value: SourceContribution; size?: number; legend?: boolean }) {
  const total = value.traffic + value.industry + value.background + value.other || 1;
  const data = (Object.keys(SOURCE_COLORS) as (keyof SourceContribution)[]).map((k) => ({
    key: k,
    name: SOURCE_LABELS[k],
    value: value[k],
    pct: (value[k] / total) * 100,
  }));
  const label = data.map((d) => `${d.name} ${d.pct.toFixed(0)}%`).join(', ');
  return (
    <div className="flex items-center gap-3">
      <div style={{ width: size, height: size }} className="shrink-0" role="img" aria-label={`Source contribution: ${label}`}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={size * 0.32} outerRadius={size * 0.48} stroke="none" paddingAngle={2} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.key} fill={SOURCE_COLORS[d.key]} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} cursor={false} formatter={(v, n) => [`${Number(v).toFixed(1)} µg/m³`, String(n)]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {legend && (
        <div className="min-w-0 flex-1 space-y-1">
          {data.map((d) => (
            <div key={d.key} className="flex items-center gap-1.5 text-[11.5px]">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: SOURCE_COLORS[d.key] }} />
              <span className="truncate text-sand-400">{d.name}</span>
              <span className="num ml-auto font-medium text-sand-100">{d.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
