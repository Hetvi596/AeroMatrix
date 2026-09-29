import { useEffect, useRef, useState } from 'react';
import {
  Compass,
  Home,
  Minus,
  MousePointerClick,
  Plus,
  RotateCcw,
  RotateCw,
  ChevronUp,
  ChevronDown,
  Square,
  AlertTriangle,
  X,
} from 'lucide-react';
import { TwinMap, type MapClick } from './TwinMap';
import { bindMapToStore } from './mapSync';
import { useTwin } from '../store/useTwinStore';
import { cellAt } from '../services/scenarioService';
import type { LonLat } from '../types';
import { LayerControl } from './LayerControl';
import { MapLegend } from './MapLegend';

function handleClick(e: MapClick) {
  const s = useTwin.getState();
  if (!s.base) return;
  const { interaction } = s;
  if (interaction === 'add-industry') {
    if (e.lonlat) s.setPendingIndustry({ location: e.lonlat });
    return;
  }
  if (interaction === 'pick-candidate') {
    if (e.lonlat) s.addCandidate(e.lonlat);
    return;
  }
  const cell = e.lonlat ? cellAt(s.base, e.lonlat) : undefined;
  if (interaction === 'select-area') {
    if (cell) s.toggleAreaCell(cell.id);
    return;
  }
  if (e.entityId?.startsWith('industry:')) {
    s.selectIndustry(e.entityId.split(':')[1]);
    return;
  }
  s.selectCell(cell ? cell.id : null);
}

const MODE_HINT: Record<string, string> = {
  'add-industry': 'Click on the map to place the proposed industry',
  'select-area': 'Click grid cells to add / remove them from the scenario area',
  'pick-candidate': 'Click on the map to add candidate sites (A, B, C…)',
};

export function CesiumMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<TwinMap | null>(null);
  const [hover, setHover] = useState<{ ll: LonLat; h: number } | null>(null);
  const status = useTwin((s) => s.mapStatus);
  const interaction = useTwin((s) => s.interaction);
  const setInteraction = useTwin((s) => s.setInteraction);
  const base = useTwin((s) => s.base);

  useEffect(() => {
    if (!container.current) return;
    const map = new TwinMap(container.current, {
      onClick: handleClick,
      onHover: (ll, h) => setHover(ll && h !== null ? { ll, h } : null),
      onStatus: (p) => useTwin.getState().setMapStatus(p),
    });
    mapRef.current = map;
    let unbind: (() => void) | null = null;
    let cancelled = false;
    map.init().then(() => {
      if (!cancelled && map.viewer) unbind = bindMapToStore(map);
    });
    return () => {
      cancelled = true;
      unbind?.();
      map.destroy();
      mapRef.current = null;
    };
  }, []);

  const hoverCell = hover && base ? cellAt(base, hover.ll) : undefined;
  const m = () => mapRef.current;
  const tb = 'grid h-8 w-8 place-items-center text-slate-300 hover:bg-ink-700 hover:text-cyan-300 transition-colors';

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-950">
      <div ref={container} className={`absolute inset-0 ${interaction !== 'select' ? 'cursor-crosshair' : ''}`} />

      {status.viewer === 'loading' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="rounded-lg bg-ink-900/90 px-4 py-3 text-[12px] text-slate-300 ring-1 ring-ink-700">Initialising 3D digital twin…</div>
        </div>
      )}
      {status.viewer === 'error' && (
        <div className="absolute inset-0 grid place-items-center bg-ink-950 p-6">
          <div className="max-w-md rounded-xl bg-ink-900 p-5 ring-1 ring-rose-400/30">
            <div className="flex items-center gap-2 text-rose-300">
              <AlertTriangle size={16} /> <span className="text-sm font-semibold">3D map unavailable</span>
            </div>
            <p className="mt-2 text-[12px] text-slate-400">{status.error}</p>
            <p className="mt-2 text-[12px] text-slate-400">
              The simulator, scenarios and analytics panels still work. Try a WebGL-capable browser (Chrome / Edge / Firefox) with hardware acceleration enabled.
            </p>
          </div>
        </div>
      )}

      {/* Interaction mode banner */}
      {interaction !== 'select' && (
        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink-900/95 py-1.5 pl-3 pr-1.5 text-[12px] text-slate-200 shadow-lg ring-1 ring-cyan-400/40 backdrop-blur">
          <MousePointerClick size={14} className="text-cyan-300" />
          {MODE_HINT[interaction]}
          <button onClick={() => setInteraction('select')} className="ml-1 rounded-full p-1 hover:bg-ink-700" title="Done">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Camera toolbar */}
      <div className="absolute left-3 top-3 z-10 flex flex-col overflow-hidden rounded-lg bg-ink-900/90 shadow-xl ring-1 ring-ink-700 backdrop-blur">
        <button className={tb} title="Zoom in" onClick={() => m()?.zoom(0.55)}><Plus size={15} /></button>
        <button className={tb} title="Zoom out" onClick={() => m()?.zoom(1.8)}><Minus size={15} /></button>
        <div className="h-px bg-ink-700" />
        <button className={tb} title="Rotate left" onClick={() => m()?.rotate(-30)}><RotateCcw size={15} /></button>
        <button className={tb} title="Rotate right" onClick={() => m()?.rotate(30)}><RotateCw size={15} /></button>
        <button className={tb} title="Tilt up (more oblique)" onClick={() => m()?.tilt(10)}><ChevronUp size={15} /></button>
        <button className={tb} title="Tilt down (more top-down)" onClick={() => m()?.tilt(-10)}><ChevronDown size={15} /></button>
        <div className="h-px bg-ink-700" />
        <button className={tb} title="Top-down view" onClick={() => m()?.topDown()}><Square size={14} /></button>
        <button className={tb} title="Reset view" onClick={() => m()?.flyHome()}><Home size={15} /></button>
      </div>

      <LayerControl />
      <MapLegend />

      {/* Cursor readout */}
      <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-md bg-ink-900/85 px-2.5 py-1 font-mono text-[10.5px] text-slate-400 ring-1 ring-ink-700 backdrop-blur">
        <Compass size={11} className="-mt-0.5 mr-1 inline text-slate-500" />
        {hover ? (
          <>
            {hover.ll[1].toFixed(4)}°N {hover.ll[0].toFixed(4)}°E · elev {Math.round(hover.h)} m
            {hoverCell && <span className="text-cyan-300"> · zone {hoverCell.id}</span>}
          </>
        ) : (
          'drag: pan · right-drag/scroll: zoom · ctrl/middle-drag: rotate & tilt'
        )}
      </div>
    </div>
  );
}
