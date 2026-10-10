// AeroMatrix identity: a diamond lattice (the analysis grid — "matrix") crossed
// by a tilted orbit with a single sensor point (the atmosphere — "aero").

export function LogoMark({ size = 24, className = '', dot = 'var(--color-accent-400)' }: { size?: number; className?: string; dot?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M12 4.6 19.4 12 12 19.4 4.6 12Z" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8.3 8.3 15.7 15.7M15.7 8.3 8.3 15.7" stroke="currentColor" strokeWidth="1.1" strokeOpacity="0.7" />
      <ellipse cx="12" cy="12" rx="10.6" ry="4.1" transform="rotate(-24 12 12)" stroke="currentColor" strokeWidth="1.3" strokeOpacity="0.85" />
      <circle cx="18.9" cy="6.3" r="1.85" fill={dot} />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`select-none text-[17px] font-bold leading-none tracking-[-0.02em] ${className}`}>
      Aero<span className="font-medium text-sand-300">Matrix</span>
    </span>
  );
}
