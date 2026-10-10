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
} from 'lucide-react';
import { TwinMap, type MapClick } from './TwinMap';
import { bindMapToStore } from './mapSync';
import { useTwin } from '../store/useTwinStore';
import { cellAt } from '../services/scenarioService';
import type { LonLat } from '../types';
import { LayerControl } from './LayerControl';
import { MapLegend } from './MapLegend';
import { PlaceSearch } from './PlaceSearch';

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
  if (e.entityId?.startsWith('place:')) {
    s.goToPlace(e.entityId.slice('place:'.length));
    return;
  }
  if (e.entityId?.startsWith('station:')) {
    const sid = e.entityId.slice('station:'.length);
    const summary = s.stationSummaries.find((x) => x.station.id === sid);
    if (summary?.cellId) {
      s.selectCell(summary.cellId);
      return;
    }
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
    if (import.meta.env.DEV) (window as unknown as { __twin?: TwinMap }).__twin = map; // dev-only debugging hook
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
  const tb = 'grid h-9 w-9 cursor-pointer place-items-center text-sand-300 transition-colors hover:bg-ink-700 hover:text-sand-50';

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-950">
      <div ref={container} className={`absolute inset-0 ${interaction !== 'select' ? 'cursor-crosshair' : ''}`} />

      {status.viewer === 'loading' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="float-surface flex items-center gap-2.5 rounded-xl px-4 py-3 text-[12.5px] text-sand-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent-400" aria-hidden="true" />
            Loading the 3D city…
          </div>
        </div>
      )}
      {status.viewer === 'error' && (
        <div className="absolute inset-0 grid place-items-center bg-ink-950 p-6">
          <div className="max-w-md rounded-xl bg-ink-900 p-5 ring-1 ring-accent-400/30">
            <div className="flex items-center gap-2 text-accent-300">
              <AlertTriangle size={16} /> <span className="text-sm font-semibold">3D map unavailable</span>
            </div>
            <p className="mt-2 text-[12px] text-sand-400">{status.error}</p>
            <p className="mt-2 text-[12px] text-sand-400">
              The simulator, scenarios and analytics panels still work. Try a WebGL-capable browser (Chrome / Edge / Firefox) with hardware acceleration enabled.
            </p>
          </div>
        </div>
      )}

      {/* Interaction mode banner */}
      {interaction !== 'select' && (
        <div className="inset-left inset-right pointer-events-none absolute top-16 z-10 flex justify-center">
          <div role="status" className="float-surface pointer-events-auto flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 text-[12.5px] text-sand-100 ring-1 ring-accent-400/40">
            <MousePointerClick size={14} className="shrink-0 text-accent-300" aria-hidden="true" />
            {MODE_HINT[interaction]}
            <button onClick={() => setInteraction('select')} className="ml-1 cursor-pointer rounded-full px-2 py-0.5 text-[12px] font-semibold text-sand-50 hover:bg-ink-700">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Camera toolbar */}
      <div role="toolbar" aria-label="Camera" className="float-surface inset-right absolute top-[60px] z-10 flex flex-col overflow-hidden rounded-xl max-md:[&>.cam-extra]:hidden">
        <button className={tb} title="Zoom in" aria-label="Zoom in" onClick={() => m()?.zoom(0.55)}><Plus size={15} /></button>
        <button className={tb} title="Zoom out" aria-label="Zoom out" onClick={() => m()?.zoom(1.8)}><Minus size={15} /></button>
        <div className="cam-extra h-px bg-sand-100/10" />
        <button className={`${tb} cam-extra`} title="Rotate left" aria-label="Rotate left" onClick={() => m()?.rotate(-30)}><RotateCcw size={15} /></button>
        <button className={`${tb} cam-extra`} title="Rotate right" aria-label="Rotate right" onClick={() => m()?.rotate(30)}><RotateCw size={15} /></button>
        <button className={`${tb} cam-extra`} title="Tilt up (more oblique)" aria-label="Tilt up" onClick={() => m()?.tilt(10)}><ChevronUp size={15} /></button>
        <button className={`${tb} cam-extra`} title="Tilt down (more top-down)" aria-label="Tilt down" onClick={() => m()?.tilt(-10)}><ChevronDown size={15} /></button>
        <div className="h-px bg-sand-100/10" />
        <button className={`${tb} cam-extra`} title="Top-down view" aria-label="Top-down view" onClick={() => m()?.topDown()}><Square size={14} /></button>
        <button className={tb} title="Reset view" aria-label="Reset view" onClick={() => m()?.flyHome()}><Home size={15} /></button>
      </div>

      <PlaceSearch />
      <LayerControl />
      <MapLegend />

      {/* Cursor readout */}
      <div className="float-surface inset-right pointer-events-none absolute bottom-7 z-10 hidden rounded-lg px-2.5 py-1 text-[11px] text-sand-300 lg:block">
        <Compass size={11} className="-mt-0.5 mr-1 inline text-sand-500" aria-hidden="true" />
        {hover ? (
          <>
            <span className="num">{hover.ll[1].toFixed(4)}°N {hover.ll[0].toFixed(4)}°E, {Math.round(hover.h)} m</span>
            {hoverCell && <span className="ml-1.5 font-semibold text-sand-50">Zone {hoverCell.id}</span>}
          </>
        ) : (
          'Drag to pan, scroll to zoom, Ctrl-drag to tilt'
        )}
      </div>
    </div>
  );
}
