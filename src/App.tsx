import { useEffect } from 'react';
import { PanelBottomClose, PanelBottomOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Header } from './components/Header';
import { NavRail } from './components/NavRail';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { BottomPanel } from './components/BottomPanel';
import { CesiumMap } from './map/CesiumMap';
import { useTwin } from './store/useTwinStore';

export function App() {
  const init = useTwin((s) => s.init);
  const loading = useTwin((s) => s.loading);
  const error = useTwin((s) => s.error);
  const rightOpen = useTwin((s) => s.rightOpen);
  const bottomOpen = useTwin((s) => s.bottomOpen);
  const setRightOpen = useTwin((s) => s.setRightOpen);
  const setBottomOpen = useTwin((s) => s.setBottomOpen);
  const section = useTwin((s) => s.section);

  useEffect(() => {
    init(10);
  }, [init]);

  return (
    <div className="flex h-full flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <aside key={section} className="panel-scroll w-[340px] shrink-0 border-r border-ink-700 bg-ink-900/70">
          {loading ? (
            <div className="p-4 text-[12px] text-slate-500">Loading demo data…</div>
          ) : error ? (
            <div className="p-4 text-[12px] text-rose-300">Failed to load data: {error}</div>
          ) : (
            <LeftPanel />
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <CesiumMap />
            <div className="absolute bottom-3 right-14 z-10 flex gap-1">
              <button
                onClick={() => setBottomOpen(!bottomOpen)}
                className="rounded-md bg-ink-900/90 p-1.5 text-slate-400 ring-1 ring-ink-700 hover:text-cyan-300"
                title={bottomOpen ? 'Hide charts' : 'Show charts'}
              >
                {bottomOpen ? <PanelBottomClose size={15} /> : <PanelBottomOpen size={15} />}
              </button>
              <button
                onClick={() => setRightOpen(!rightOpen)}
                className="rounded-md bg-ink-900/90 p-1.5 text-slate-400 ring-1 ring-ink-700 hover:text-cyan-300"
                title={rightOpen ? 'Hide details' : 'Show details'}
              >
                {rightOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
              </button>
            </div>
          </div>
          {bottomOpen && !loading && !error && (
            <div className="h-[236px] shrink-0 border-t border-ink-700 bg-ink-900">
              <BottomPanel />
            </div>
          )}
        </main>

        {rightOpen && !loading && !error && (
          <aside className="panel-scroll w-[330px] shrink-0 border-l border-ink-700 bg-ink-900/70">
            <RightPanel />
          </aside>
        )}
      </div>
    </div>
  );
}
