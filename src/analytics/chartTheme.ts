// Chart styling that reads on both the Cherry Cola chrome and Vanilla Cream sheets:
// cream tooltip with cola ink, mid-tone warm axes and a faint rose grid.
export const tooltipStyle = {
  contentStyle: {
    background: '#fbf5e9',
    border: '1px solid rgba(42,15,23,0.14)',
    fontSize: 12,
    borderRadius: 8,
    padding: '6px 9px',
    boxShadow: '0 8px 20px -12px rgba(28,10,16,0.6)',
  },
  itemStyle: { color: '#2a0f17', padding: 0 },
  labelStyle: { color: '#6c5152', marginBottom: 2 },
  cursor: { fill: 'rgba(163,38,63,0.08)' },
};

export const axisProps = {
  tick: { fill: '#9c8580', fontSize: 10.5 },
  axisLine: { stroke: 'rgba(156,133,128,0.35)' },
  tickLine: false,
} as const;

export const gridProps = { stroke: 'rgba(156,133,128,0.22)', strokeDasharray: '3 3', vertical: false } as const;

/** Series colours: baseline (warm grey), scenario (cherry), observed/clean (green). */
export const SERIES = {
  baseline: '#9c8580',
  scenario: '#c84a62',
  observed: '#2fae8b',
  demo: '#d9adb1',
} as const;
