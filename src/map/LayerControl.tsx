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
} from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import type { LayerId } from '../types';

const LAYERS: { id: LayerId; label: string; icon: typeof Layers; note?: string }[] = [
  { id: 'heatmap', label: 'Pollution heatmap', icon: Flame, note: 'demo' },
  { id: 'grid', label: 'Analysis grid', icon: Grid3x3 },
  { id: 'risk', label: 'Risk zones (3D columns)', icon: TriangleAlert, note: 'demo' },
  { id: 'roads', label: 'Roads', icon: Route },
  { id: 'traffic', label: 'Traffic corridors', icon: Car, note: 'demo' },
  { id: 'industries', label: 'Industries', icon: Factory, note: 'demo' },
  { id: 'green', label: 'Green cover', icon: Trees, note: 'approx.' },
  { id: 'buildings', label: '3D buildings', icon: Building2 },
  { id: 'terrain', label: 'Terrain (DEM)', icon: Mountain },
  { id: 'elevationTint', label: 'Elevation tint', icon: Palette },
  { id: 'satellite', label: 'Satellite imagery', icon: Satellite },
  { id: 'labels', label: 'Labels & boundaries', icon: Tags },
];

export function LayerControl() {
  const [open, setOpen] = useState(false);
  const layers = useTwin((s) => s.layers);
  const toggle = useTwin((s) => s.toggleLayer);
  const exag = useTwin((s) => s.terrainExaggeration);
  const setExag = useTwin((s) => s.setTerrainExaggeration);
  const status = useTwin((s) => s.mapStatus);

  return (
    <div className={`float-surface inset-right absolute top-3 z-20 flex max-h-[calc(100%-24px)] flex-col ${open ? 'w-60' : 'w-auto'} rounded-xl text-[12.5px]`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex h-9 w-full shrink-0 cursor-pointer items-center gap-2 px-3 text-sand-100 hover:text-white"
      >
        <Layers size={15} className="text-accent-300" aria-hidden="true" />
        <span className="font-semibold">Layers</span>
        <ChevronRight size={14} className={`ml-auto text-sand-500 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="panel-scroll min-h-0 border-t border-sand-100/10 px-2 pb-2 pt-1 animate-fade">
          {LAYERS.map(({ id, label, icon: Icon, note }) => (
            <label key={id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-[5px] hover:bg-sand-100/[0.06]">
              <input type="checkbox" checked={layers[id]} onChange={() => toggle(id)} className="accent-accent-400" />
              <Icon size={13} className={layers[id] ? 'text-accent-300' : 'text-sand-600'} />
              <span className={layers[id] ? 'text-sand-200' : 'text-sand-500'}>{label}</span>
              {note && (
                <span className={`ml-auto text-[10.5px] ${note === 'observed' ? 'text-emerald-300/90' : 'text-sand-500'}`}>
                  {note}
                </span>
              )}
            </label>
          ))}
          <div className="mt-1.5 px-1.5">
            <div className="flex justify-between text-[11px] text-sand-400">
              <span>Terrain exaggeration</span>
              <span className="num font-semibold text-accent-300">×{exag.toFixed(1)}</span>
            </div>
            <input type="range" min={1} max={4} step={0.5} value={exag} onChange={(e) => setExag(Number(e.target.value))} className="w-full disabled:opacity-30" />
          </div>
          <div className="mt-1 space-y-0.5 border-t border-sand-100/10 px-1.5 pt-1.5 text-[10.5px] leading-snug text-sand-500">
            <div><span className="text-sand-400">Terrain:</span> {status.terrain}</div>
            <div><span className="text-sand-400">Imagery:</span> {status.imagery}</div>
            <div><span className="text-sand-400">Buildings:</span> {status.buildings}</div>
          </div>
        </div>
      )}
    </div>
  );
}
