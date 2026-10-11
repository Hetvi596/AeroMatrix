import { createContext, type CSSProperties, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { DataStatus } from '../types';

// ---------------------------------------------------------------------------
// Data source marker. Every value still carries its provenance, but quietly:
// a coloured dot and a plain label, with the full meaning in the tooltip.
// ---------------------------------------------------------------------------
export const STATUS_STYLE: Record<DataStatus, { label: string; dot: string; title: string }> = {
  OBSERVED: {
    label: 'Observed',
    dot: 'bg-emerald-400',
    title: 'Measured data from an imported source (e.g. CPCB, ERA5).',
  },
  MODEL_DATA: {
    label: 'Model data',
    dot: 'bg-violet-300',
    title: 'Air-quality model data from Open-Meteo (CAMS global model) for the place’s coordinates. Not a station measurement.',
  },
  MODEL_PREDICTION: {
    label: 'Model prediction',
    dot: 'bg-sky-300',
    title: 'Output of a trained, validated ML model.',
  },
  MODELED_SCENARIO: {
    label: 'Modeled scenario',
    dot: 'bg-amber-300',
    title: 'What-if estimate from the prototype rule-based model. Not calibrated.',
  },
  DEMO: {
    label: 'Demo values',
    dot: 'bg-sand-500',
    title: 'Deterministic demo values from the prototype model. Not real observations.',
  },
};

export function DataBadge({ status, className = '' }: { status: DataStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span title={s.title} className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-sand-400 ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// Retained for compatibility with screens that still provide it; no longer rendered.
export const EyebrowContext = createContext<string | null>(null);

export function DisplayTitle({ text, className = '' }: { text: string; className?: string }) {
  return <span className={`font-display ${className}`}>{text.replace(/\.$/, '')}</span>;
}

/** Screen heading for the section sheet. */
export function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode; eyebrow?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 pl-5 pr-14 pt-5">
      <div className="min-w-0">
        <h2 className="font-display text-[21px] leading-tight text-sand-50">{title}</h2>
        {subtitle && <p className="mt-1 text-[12.5px] leading-snug text-sand-400">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0 pt-1">{right}</div>}
    </div>
  );
}

export function Block({ title, right, children, className = '' }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`border-t hairline px-5 py-4 ${className}`}>
      {title && (
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h3 className="text-[12.5px] font-semibold text-sand-300">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, unit, sub, tone }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11.5px] text-sand-400">{label}</div>
      <div className={`num text-[19px] font-semibold leading-tight tracking-[-0.01em] ${tone ?? 'text-sand-50'}`}>
        {value}
        {unit && <span className="ml-1 text-[11px] font-medium text-sand-500">{unit}</span>}
      </div>
      {sub && <div className="text-[11px] text-sand-500">{sub}</div>}
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
  const fill = `${((value - min) / (max - min || 1)) * 100}%`;
  return (
    <label className="block py-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
        <span className="text-sand-200">{label}</span>
        <span className="num shrink-0 text-[12px] font-semibold text-accent-300">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        className="mt-1 w-full"
        style={{ '--fill': fill } as CSSProperties}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <div className="text-[11px] text-sand-500">{hint}</div>}
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
  variant?: 'default' | 'primary' | 'outline' | 'ghost' | 'danger';
  disabled?: boolean;
  className?: string;
  title?: string;
  /** Deprecated; buttons no longer draw an arrow. */
  arrow?: boolean;
}) {
  const v = {
    default: 'bg-sand-100/[0.06] text-sand-100 ring-1 ring-inset ring-sand-100/12 hover:bg-sand-100/[0.11]',
    primary: 'bg-accent-500 font-semibold text-white hover:bg-accent-600 shadow-[0_6px_16px_-10px_rgba(107,23,41,0.9)]',
    outline: 'text-accent-300 ring-1 ring-inset ring-accent-400/55 hover:bg-accent-500/10',
    ghost: 'text-sand-300 hover:bg-sand-100/[0.07] hover:text-sand-100',
    danger: 'bg-accent-500/10 text-accent-300 ring-1 ring-inset ring-accent-400/30 hover:bg-accent-500/18',
  }[variant];
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-8 cursor-pointer items-center whitespace-nowrap justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${v} ${className}`}
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
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'xs';
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-sand-100/[0.06] p-0.5 ring-1 ring-inset ring-sand-100/10">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`cursor-pointer rounded-md ${size === 'xs' ? 'px-2.5 py-0.5 text-[11.5px]' : 'px-3 py-1 text-[12px]'} whitespace-nowrap font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30 ${
            value === o.value ? 'bg-accent-500 text-white shadow-[0_2px_8px_-4px_rgba(107,23,41,0.9)]' : 'text-sand-300 enabled:hover:text-sand-50'
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
    <div className="flex items-center justify-between gap-2 py-1.5 text-[12.5px] text-sand-200">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : undefined}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-150 ${checked ? 'bg-accent-500' : 'bg-sand-100/20'}`}
      >
        <span className={`absolute top-[3px] h-3.5 w-3.5 rounded-full bg-white shadow transition-[left] duration-150 ${checked ? 'left-[19px]' : 'left-[3px]'}`} />
      </button>
    </div>
  );
}

export function Disclaimer({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-[11px] leading-relaxed text-sand-500">{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-sand-100/18 px-4 py-5 text-center text-[12px] leading-relaxed text-sand-400">
      {children}
    </div>
  );
}

/** Signed change: green = improvement, cherry = worsening (matches the Δ map). */
export function DeltaText({ value, digits = 1, unit = '', invert = false }: { value: number; digits?: number; unit?: string; invert?: boolean }) {
  const good = invert ? value > 0 : value < 0;
  const tone = Math.abs(value) < 0.05 ? 'text-sand-400' : good ? 'text-emerald-300' : 'text-accent-300';
  return (
    <span className={`num ${tone}`}>
      {Math.abs(value) < 0.5 * 10 ** -digits ? '' : value > 0 ? '+' : '−'}
      {Math.abs(value).toFixed(digits)}
      {unit}
    </span>
  );
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'crimson' | 'green' }) {
  const cls = {
    neutral: 'bg-sand-100/[0.07] text-sand-300',
    crimson: 'bg-accent-500 text-white',
    green: 'bg-emerald-500 text-white',
  }[tone];
  return <span className={`inline-flex items-center rounded-md px-2 py-[3px] text-[11px] font-semibold ${cls}`}>{children}</span>;
}

/** Title bar for the contextual details drawer. */
export function DrawerHeader({ kicker, title, subtitle, onClose, right }: { kicker?: string; title: ReactNode; subtitle?: ReactNode; onClose?: () => void; right?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-5 pb-3 pt-4">
      <div className="min-w-0 flex-1">
        {kicker && <div className="text-[11.5px] font-medium text-accent-400">{kicker}</div>}
        <div className="truncate text-[19px] font-semibold leading-tight tracking-[-0.01em] text-sand-50">{title}</div>
        {subtitle && <div className="mt-0.5 text-[12px] text-sand-400">{subtitle}</div>}
      </div>
      {right}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="-mr-1.5 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-sand-400 transition-colors hover:bg-sand-100/[0.08] hover:text-sand-50"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/** Label / value row used across the drawer. */
export function MetricRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[5px] text-[12.5px]">
      <span className="text-sand-400">{label}</span>
      <span className="num text-right font-medium text-sand-100">{children}</span>
    </div>
  );
}

/** Severity chip: coloured dot, dark text — legible on cream and on cherry. */
export function SeverityChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-sand-100/[0.07] px-2 py-0.5 text-[11.5px] font-semibold text-sand-100">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Shared styling for compact, row-selectable data tables. */
export const TABLE = {
  table: 'w-full border-separate border-spacing-0 text-[12.5px]',
  th: 'sticky top-0 z-[1] bg-ink-950 py-2 text-[11.5px] font-medium text-sand-400 border-b hairline',
  row: 'cursor-pointer transition-colors duration-100 hover:bg-sand-100/[0.05] focus-visible:outline-none focus-visible:bg-accent-500/10',
  rowActive: 'bg-accent-500/[0.09] hover:bg-accent-500/[0.12]',
  td: 'border-b hairline py-2',
};
