import type { ReactNode } from 'react';
import type { DataStatus } from '../types';

const STATUS_STYLE: Record<DataStatus, { label: string; cls: string; title: string }> = {
  OBSERVED: {
    label: 'OBSERVED',
    cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
    title: 'Measured data from an external source (e.g. CPCB, ERA5).',
  },
  MODEL_PREDICTION: {
    label: 'MODEL PREDICTION',
    cls: 'bg-sky-500/15 text-sky-300 ring-sky-400/30',
    title: 'Output of a trained, validated ML model.',
  },
  MODELED_SCENARIO: {
    label: 'MODELED SCENARIO',
    cls: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
    title: 'What-if estimate from the prototype rule-based model. Not calibrated.',
  },
  DEMO: {
    label: 'DEMO / SIMULATED',
    cls: 'bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-400/30',
    title: 'Deterministic demo values. Not real observations.',
  },
};

export function DataBadge({ status, className = '' }: { status: DataStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      title={s.title}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wider ring-1 ring-inset whitespace-nowrap ${s.cls} ${className}`}
    >
      <span className="h-1 w-1 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

export function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-ink-700/70 px-4 pb-3 pt-4">
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold tracking-wide text-slate-100">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Block({ title, right, children, className = '' }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`border-b border-ink-700/50 px-4 py-3 ${className}`}>
      {title && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({ label, value, unit, sub, tone }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] text-slate-400">{label}</div>
      <div className={`num text-lg font-semibold leading-tight ${tone ?? 'text-slate-100'}`}>
        {value}
        {unit && <span className="ml-1 text-[10.5px] font-normal text-slate-500">{unit}</span>}
      </div>
      {sub && <div className="text-[10.5px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
}) {
  return (
    <label className="block py-1.5">
      <div className="flex items-baseline justify-between text-[11.5px]">
        <span className="text-slate-300">{label}</span>
        <span className="num font-mono text-[11px] text-cyan-300">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        className="mt-1 w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
    </label>
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  className = '',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const v = {
    default: 'bg-ink-700 hover:bg-ink-600 text-slate-100 ring-1 ring-inset ring-white/5',
    primary: 'bg-cyan-500 hover:bg-cyan-400 text-ink-950 font-semibold',
    ghost: 'hover:bg-ink-700 text-slate-300',
    danger: 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 ring-1 ring-inset ring-rose-400/30',
  }[variant];
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${v} ${className}`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
}: {
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'xs';
}) {
  return (
    <div className="inline-flex rounded-md bg-ink-900 p-0.5 ring-1 ring-inset ring-ink-700">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`rounded px-2 ${size === 'xs' ? 'py-0.5 text-[10.5px]' : 'py-1 text-[11.5px]'} transition-colors disabled:opacity-30 ${
            value === o.value ? 'bg-ink-700 text-cyan-300 shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 py-1 text-[12px] text-slate-300">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-4 w-7 rounded-full transition-colors ${checked ? 'bg-cyan-500' : 'bg-ink-600'}`}
      >
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${checked ? 'left-3.5' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

export function Disclaimer({ children }: { children: ReactNode }) {
  return <p className="text-[10.5px] leading-snug text-slate-500">{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-ink-600 px-3 py-4 text-center text-[11.5px] text-slate-500">{children}</div>;
}

export function DeltaText({ value, digits = 1, unit = '', invert = false }: { value: number; digits?: number; unit?: string; invert?: boolean }) {
  const good = invert ? value > 0 : value < 0;
  const tone = Math.abs(value) < 0.05 ? 'text-slate-400' : good ? 'text-sky-300' : 'text-rose-300';
  return (
    <span className={`num ${tone}`}>
      {value > 0 ? '+' : ''}
      {value.toFixed(digits)}
      {unit}
    </span>
  );
}
