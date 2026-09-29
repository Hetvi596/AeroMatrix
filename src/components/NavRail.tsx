import {
  LayoutDashboard,
  Wind,
  Grid3x3,
  Car,
  Factory,
  Trees,
  SlidersHorizontal,
  GitCompare,
  ListChecks,
  MapPinned,
  BarChart3,
  Database,
} from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import type { Section } from '../types';

export const NAV: { id: Section; label: string; icon: typeof Wind }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'air', label: 'Air Quality', icon: Wind },
  { id: 'zones', label: 'Zones', icon: Grid3x3 },
  { id: 'traffic', label: 'Traffic', icon: Car },
  { id: 'industries', label: 'Industries', icon: Factory },
  { id: 'green', label: 'Green', icon: Trees },
  { id: 'simulator', label: 'What-If', icon: SlidersHorizontal },
  { id: 'scenarios', label: 'Scenarios', icon: GitCompare },
  { id: 'actions', label: 'Actions', icon: ListChecks },
  { id: 'locations', label: 'Sites', icon: MapPinned },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'data', label: 'Data', icon: Database },
];

export function NavRail() {
  const section = useTwin((s) => s.section);
  const setSection = useTwin((s) => s.setSection);
  return (
    <nav className="flex w-[68px] shrink-0 flex-col items-stretch gap-0.5 border-r border-ink-700 bg-ink-900 py-2">
      {NAV.map(({ id, label, icon: Icon }) => {
        const active = section === id;
        return (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`relative mx-1.5 flex flex-col items-center gap-1 rounded-md py-2 text-[9.5px] font-medium transition-colors ${
              active ? 'bg-ink-700 text-cyan-300' : 'text-slate-400 hover:bg-ink-800 hover:text-slate-200'
            }`}
          >
            {active && <span className="absolute -left-1.5 top-2 bottom-2 w-0.5 rounded-r bg-cyan-400" />}
            <Icon size={17} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
