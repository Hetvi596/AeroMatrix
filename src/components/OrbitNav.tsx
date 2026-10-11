import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ChevronDown, Factory, Grid3x3, LayoutDashboard, ListChecks, MapPinned, RadioTower, SlidersHorizontal, Wind, X, type LucideIcon } from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import type { Section } from '../types';
import { LogoMark } from './Brand';

interface NavItem {
  id: Section;
  label: string;
  icon: LucideIcon;
}

/** Features reachable from the launcher. Traffic, Green, Scenarios, Analytics and Data stay
 *  mounted in the app (deep links, in-panel links) but are not listed here. */
export const ORBIT_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'air', label: 'Air Quality', icon: Wind },
  { id: 'zones', label: 'Zones', icon: Grid3x3 },
  { id: 'industries', label: 'Industries', icon: Factory },
  { id: 'actions', label: 'Actions', icon: ListChecks },
  { id: 'simulator', label: 'What-If', icon: SlidersHorizontal },
  { id: 'locations', label: 'Sites', icon: MapPinned },
  { id: 'sensors', label: 'Sensors', icon: RadioTower },
];

/** Display names for every section, including the ones hidden from the launcher. */
export const SECTION_LABEL: Record<Section, string> = {
  overview: 'Overview',
  air: 'Air Quality',
  zones: 'Zones',
  traffic: 'Traffic',
  industries: 'Industries',
  green: 'Green cover',
  simulator: 'What-If',
  scenarios: 'Saved scenarios',
  actions: 'Actions',
  locations: 'Sites',
  sensors: 'Sensors',
  analytics: 'Analytics',
  data: 'Data',
};

// The launcher sits in the bottom-left corner, so the orbit opens over a quarter-plus arc:
// from just left of straight up (-100°) to just below horizontal (+10°).
const RADIUS = 170;
const ARC_FROM = -100;
const ARC_TO = 10;

function placement(i: number, n: number) {
  const deg = ARC_FROM + ((ARC_TO - ARC_FROM) * i) / Math.max(1, n - 1);
  const rad = (deg * Math.PI) / 180;
  return { deg, x: Math.round(RADIUS * Math.cos(rad)), y: Math.round(RADIUS * Math.sin(rad)) };
}

/** Launcher centre's distance from the left viewport edge (orbit-dock left + half the 56 px launcher). */
const DOCK_CENTRE_X = 28 + 28;

/**
 * Label position for an orbit item: pushed outward along the item's direction from the
 * launcher, so it sits in empty space beyond the ring instead of over neighbouring icons.
 * Items near the left screen edge align their label to the left so it can't be clipped.
 */
function tipPlacement(deg: number, x: number): CSSProperties {
  const rad = (deg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const nearLeftEdge = DOCK_CENTRE_X + x < 96;
  const tx = ux < -0.35 ? (nearLeftEdge ? -20 : -100) : ux > 0.35 || nearLeftEdge ? 0 : -50;
  const ty = uy < -0.35 ? -100 : uy > 0.35 ? 0 : -50;
  return {
    left: `calc(50% + ${Math.round(ux * 28)}px)`,
    top: `calc(50% + ${Math.round(uy * 28)}px)`,
    translate: `${tx}% ${ty}%`,
    '--tip-from': `translate(${Math.round(-ux * 5)}px, ${Math.round(-uy * 5)}px)`,
  } as CSSProperties;
}

export function OrbitNav() {
  const section = useTwin((s) => s.section);
  const setSection = useTwin((s) => s.setSection);
  const leftOpen = useTwin((s) => s.leftOpen);
  const setLeftOpen = useTwin((s) => s.setLeftOpen);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) launcher.current?.focus();
  }, []);

  // Outside click / Escape close the orbit.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    // Move focus into the orbit, starting at the active feature.
    const start = Math.max(0, ORBIT_ITEMS.findIndex((i) => i.id === section));
    const t = window.setTimeout(() => items.current[start]?.focus(), 30);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
    // `section` is deliberately read only when the orbit opens.
  }, [open, close]);

  const choose = (id: Section) => {
    setSection(id);
    setLeftOpen(true);
    close(true);
  };

  const onItemKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = ORBIT_ITEMS.length;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else if (e.key === 'Tab') {
      // Keep Tab inside the open orbit; it closes with Escape or a selection.
      e.preventDefault();
      next = e.shiftKey ? (i - 1 + n) % n : (i + 1) % n;
    }
    if (next >= 0) {
      e.preventDefault();
      items.current[next]?.focus();
    }
  };

  const current = ORBIT_ITEMS.find((i) => i.id === section);
  const CurrentIcon = current?.icon;

  return (
    <div ref={root} className="orbit orbit-dock absolute z-40" data-open={open} style={{ '--orbit-r': `${RADIUS}px` } as CSSProperties}>
      <div className="relative h-14 w-14">
        <div className="orbit-ring" />

        <div id="orbit-menu" role="menu" aria-label="Features" aria-orientation="horizontal" inert={!open}>
          {ORBIT_ITEMS.map((item, i) => {
            const { deg, x, y } = placement(i, ORBIT_ITEMS.length);
            const active = item.id === section;
            const tip = tipPlacement(deg, x);
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                ref={(el) => {
                  items.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                aria-label={item.label}
                tabIndex={open ? 0 : -1}
                onClick={() => choose(item.id)}
                onKeyDown={(e) => onItemKey(e, i)}
                className={`orbit-item group grid cursor-pointer place-items-center rounded-full ring-1 transition-colors duration-150 focus-visible:outline-offset-4 ${
                  active
                    ? 'bg-accent-500 text-white ring-accent-300/60 shadow-[0_8px_20px_-10px_rgba(163,38,63,0.95)]'
                    : 'bg-ink-900 text-sand-200 ring-sand-100/15 hover:bg-ink-700 hover:text-sand-50'
                }`}
                style={{ '--x': `${x}px`, '--y': `${y}px`, '--i': i } as CSSProperties}
              >
                <Icon size={18} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                <span
                  className="orbit-tip float-surface rounded-md px-2 py-1 text-[12px] font-semibold text-sand-50"
                  style={tip}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        <button
          ref={launcher}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls="orbit-menu"
          aria-label={open ? 'Close features' : 'Open features'}
          onClick={() => setOpen((o) => !o)}
          className="relative z-10 grid h-14 w-14 cursor-pointer place-items-center rounded-full bg-accent-500 text-sand-50 shadow-[0_14px_30px_-12px_rgba(107,23,41,0.95)] ring-1 ring-accent-300/40 transition-[background-color,transform] duration-150 hover:bg-accent-600 active:scale-95"
        >
          <span className="orbit-launcher-mark absolute inset-0 grid place-items-center">
            <LogoMark size={30} dot="#fbf5e9" />
          </span>
          <span className="orbit-launcher-close absolute inset-0 grid place-items-center">
            <X size={20} strokeWidth={2.2} />
          </span>
        </button>
      </div>

      {/* Persistent indicator of the open feature; also folds the sheet away. */}
      <button
        type="button"
        onClick={() => setLeftOpen(!leftOpen)}
        aria-expanded={leftOpen}
        title={leftOpen ? 'Hide panel' : 'Show panel'}
        className={`float-surface absolute left-[68px] top-1/2 flex -translate-y-1/2 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full py-1.5 pl-2.5 pr-2 text-[12.5px] font-semibold text-sand-50 transition-opacity duration-150 hover:text-white ${
          open ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      >
        {CurrentIcon && <CurrentIcon size={14} className="text-accent-300" aria-hidden="true" />}
        {SECTION_LABEL[section]}
        <ChevronDown size={14} className={`text-sand-400 transition-transform duration-200 ${leftOpen ? '' : 'rotate-180'}`} aria-hidden="true" />
      </button>
    </div>
  );
}
