export const tooltipStyle = {
  contentStyle: { background: '#0e1524', border: '1px solid #2a3754', fontSize: 11, borderRadius: 6, padding: '6px 8px' },
  itemStyle: { color: '#e2e8f0', padding: 0 },
  labelStyle: { color: '#94a3b8', marginBottom: 2 },
  cursor: { fill: 'rgba(148,163,184,0.08)' },
};

export const axisProps = {
  tick: { fill: '#64748b', fontSize: 10 },
  axisLine: { stroke: '#1c2740' },
  tickLine: false,
} as const;

export const gridProps = { stroke: '#1c2740', strokeDasharray: '3 3', vertical: false } as const;
