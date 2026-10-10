import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import { PUNE_LOCALITIES, searchLocalities, type Locality, type LocalityRegion } from '../data/geojson/puneLocalities';

const REGION_ORDER: LocalityRegion[] = ['Central', 'East', 'West', 'North', 'South', 'PCMC'];
const REGION_LABEL: Record<LocalityRegion, string> = {
  Central: 'Central Pune',
  East: 'East Pune',
  West: 'West Pune',
  North: 'North Pune',
  South: 'South Pune',
  PCMC: 'Pimpri-Chinchwad',
};

/** "Go to area" search: type or pick a Pune locality and the map flies there. */
export function PlaceSearch() {
  const goToPlace = useTwin((s) => s.goToPlace);
  const highlighted = useTwin((s) => s.highlightedPlace);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchLocalities(query), [query]);
  const grouped = !query.trim();
  // Flat order used for keyboard navigation (grouped view follows region order).
  const ordered: Locality[] = grouped ? REGION_ORDER.flatMap((r) => results.filter((l) => l.region === r)) : results;
  const current = PUNE_LOCALITIES.find((p) => p.id === highlighted);

  const choose = (l: Locality) => {
    goToPlace(l.id);
    setQuery('');
    setOpen(false);
    input.current?.blur();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(ordered.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      if (ordered[active]) choose(ordered[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      input.current?.blur();
    }
  };

  const item = (l: Locality, idx: number) => (
    <button
      key={l.id}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => choose(l)}
      onMouseEnter={() => setActive(idx)}
      className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] ${
        idx === active ? 'bg-accent-500/20 text-sand-50' : 'text-sand-200 hover:bg-sand-100/[0.06]'
      }`}
    >
      <MapPin size={12} className={l.id === highlighted ? 'text-accent-300' : 'text-sand-500'} />
      <span className="truncate">{l.name}</span>
      {!grouped && <span className="ml-auto text-[10px] text-sand-500">{REGION_LABEL[l.region]}</span>}
    </button>
  );

  return (
    // Centred in the free strip between the section sheet (left) and the Layers button (right).
    <div className="inset-left pointer-events-none absolute top-3 z-20 flex justify-center" style={{ right: 'calc(var(--right-inset) + 128px)' }}>
     <div className="pointer-events-auto w-full max-w-[320px]">
      <div className="float-surface flex h-9 items-center gap-2 rounded-xl px-3 focus-within:ring-2 focus-within:ring-accent-400/60">
        <Search size={15} className="shrink-0 text-sand-400" aria-hidden="true" />
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKey}
          placeholder={current ? `At ${current.name}. Search another area` : 'Search an area, e.g. Koregaon Park'}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-sand-100 outline-none placeholder:text-sand-500"
          aria-label="Go to area"
        />
        {current && (
          <button onClick={() => goToPlace(null)} className="shrink-0 rounded p-0.5 text-sand-500 hover:text-sand-200" title="Clear highlighted area">
            <X size={13} />
          </button>
        )}
      </div>
      {open && (
        <div className="float-surface mt-1.5 max-h-[340px] overflow-y-auto rounded-xl p-1.5">
          {ordered.length === 0 && <div className="px-2 py-2 text-[12px] text-sand-500">No area matches “{query}”.</div>}
          {grouped
            ? REGION_ORDER.map((r) => {
                const inRegion = ordered.filter((l) => l.region === r);
                if (!inRegion.length) return null;
                return (
                  <div key={r} className="mb-1">
                    <div className="px-2 pb-0.5 pt-1.5 text-[11px] font-semibold text-sand-400">{REGION_LABEL[r]}</div>
                    {inRegion.map((l) => item(l, ordered.indexOf(l)))}
                  </div>
                );
              })
            : ordered.map((l, i) => item(l, i))}
          <div className="border-t border-sand-100/10 px-2 pt-1.5 text-[11px] text-sand-500">{PUNE_LOCALITIES.length} areas, approximate centres</div>
        </div>
      )}
     </div>
    </div>
  );
}
