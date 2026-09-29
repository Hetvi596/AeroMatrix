import { useState } from 'react';
import {
  Layers,
  Flame,
  Grid3x3,
  Route,
  Car,
  Factory,
  Trees,
  Building2,
  Mountain,
  Satellite,
  TriangleAlert,
  Tags,
  Palette,
  ChevronRight,
  RadioTower,
} from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import type { LayerId } from '../types';

const LAYERS: { id: LayerId; label: string; icon: typeof Layers; note?: string }[] = [
  { id: 'heatmap', label: 'Pollution heatmap', icon: Flame, note: 'demo' },
  { id: 'stations', label: 'Monitoring stations', icon: RadioTower, note: 'observed' },
  { id: 'grid', label: 'Analysis grid', icon: Grid3x3 },
  { id: 'risk', label: 'Risk zones (3D columns)', icon: TriangleAlert, note: 'demo' },
  { id: 'roads', label: 'Roads', icon: Route },
  { id: 'traffic', label: 'Traffic corridors', icon: Car, note: 'demo' },
  { id: 'industries', label: 'Industries', icon: Factory, note: 'demo' },
  { id: 'green', label: 'Green cover', icon: Trees, note: 'approx.' },
  { id: 'buildings', label: 'Buildings', icon: Building2 },
  { id: 'terrain', label: 'Terrain (DEM)', icon: Mountain },
  { id: 'elevationTint', label: 'Elevation tint', icon: Palette },
  { id: 'satellite', label: 'Satellite imagery', icon: Satellite },
  { id: 'labels', label: 'Labels & boundaries', icon: Tags },
];

export function LayerControl() {
  const [open, setOpen] = useState(true);
  const layers = useTwin((s) => s.layers);
  const toggle = useTwin((s) => s.toggleLayer);
  const exag = useTwin((s) => s.terrainExaggeration);
  const setExag = useTwin((s) => s.setTerrainExaggeration);
  const status = useTwin((s) => s.mapStatus);

  return (
    <div className="absolute right-3 top-3 z-10 w-56 rounded-lg bg-ink-900/92 text-[12px] shadow-xl ring-1 ring-ink-700 backdrop-blur">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-slate-200">
        <Layers size={14} className="text-cyan-300" />
        <span className="font-semibold">Layers</span>
        <ChevronRight size={14} className={`ml-auto text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-ink-700 px-2 pb-2 pt-1">
          {LAYERS.map(({ id, label, icon: Icon, note }) => (
            <label key={id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-[3px] hover:bg-ink-800">
              <input type="checkbox" checked={layers[id]} onChange={() => toggle(id)} className="accent-cyan-400" />
              <Icon size={13} className={layers[id] ? 'text-cyan-300' : 'text-slate-600'} />
              <span className={layers[id] ? 'text-slate-200' : 'text-slate-500'}>{label}</span>
              {note && (
                <span className={`ml-auto text-[9px] uppercase tracking-wide ${note === 'observed' ? 'text-emerald-300/80' : 'text-fuchsia-300/70'}`}>
                  {note}
                </span>
              )}
            </label>
          ))}
          <div className="mt-1.5 px-1.5">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Terrain exaggeration</span>
              <span className="font-mono text-cyan-300">×{exag.toFixed(1)}</span>
            </div>
            <input type="range" min={1} max={4} step={0.5} value={exag} onChange={(e) => setExag(Number(e.target.value))} className="w-full" />
          </div>
          <div className="mt-1 space-y-0.5 border-t border-ink-700 px-1.5 pt-1.5 text-[10px] leading-snug text-slate-500">
            <div><span className="text-slate-400">Terrain:</span> {status.terrain}</div>
            <div><span className="text-slate-400">Imagery:</span> {status.imagery}</div>
            <div><span className="text-slate-400">Buildings:</span> {status.buildings}</div>
          </div>
        </div>
      )}
    </div>
  );
}
