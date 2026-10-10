import { useEffect } from 'react';
import { ChevronsLeft } from 'lucide-react';
import { Header } from './components/Header';
import { OrbitNav, SECTION_LABEL } from './components/OrbitNav';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { BottomPanel } from './components/BottomPanel';
import { IntroOverlay } from './components/IntroOverlay';
import { CesiumMap } from './map/CesiumMap';
import { useTwin } from './store/useTwinStore';
import { refreshForecastLayer } from './analytics/forecastLayer';
import { applyDeepLink } from './deepLink';

export function App() {
  const init = useTwin((s) => s.init);
  const loading = useTwin((s) => s.loading);
  const error = useTwin((s) => s.error);
  const section = useTwin((s) => s.section);
  const leftOpen = useTwin((s) => s.leftOpen);
  const setLeftOpen = useTwin((s) => s.setLeftOpen);
  const bottomOpen = useTwin((s) => s.bottomOpen);
  const inspectorOpen = useTwin(
    (s) => s.rightOpen && (!!s.selectedCellId || !!s.selectedIndustryId || !!s.selectedCandidateId || !!s.activeResult),
  );
  const ready = !loading && !error;
  const drawerOpen = inspectorOpen && ready;

  useEffect(() => {
    init(10).then(() => {
      // Links from the landing page (e.g. "Model in AeroMatrix →") land on the right screen.
      applyDeepLink();
      // If the backend is running with a trained model, pick up its forecast layer quietly.
      refreshForecastLayer().catch(() => undefined);
    });
  }, [init]);

  return (
    <div className="flex h-full flex-col bg-ink-950">
      <Header />
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Map stage: the 3D map fills it; sheets float above and controls step aside via CSS insets. */}
        <div
          className="map-stage relative min-h-0 flex-1"
          data-left={leftOpen ? '1' : '0'}
          data-right={drawerOpen ? '1' : '0'}
          data-sheet={drawerOpen ? '2' : leftOpen ? '1' : '0'}
        >
          <CesiumMap />

          {leftOpen && (
            <aside
              aria-label={SECTION_LABEL[section]}
              className="theme-cream sheet-surface absolute inset-x-0 bottom-0 z-20 flex h-[46dvh] flex-col overflow-hidden rounded-t-2xl animate-sheet-up md:inset-x-auto md:bottom-[100px] md:left-3 md:top-3 md:h-auto md:w-[332px] md:rounded-2xl md:animate-rise xl:w-[380px]"
            >
              <button
                type="button"
                onClick={() => setLeftOpen(false)}
                className="absolute right-3 top-4 z-10 grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-sand-400 transition-colors hover:bg-sand-100/[0.07] hover:text-sand-50"
                title="Hide panel"
                aria-label="Hide panel"
              >
                <ChevronsLeft size={16} className="-rotate-90 md:rotate-0" />
              </button>
              <div key={section} className="panel-scroll min-h-0 flex-1 animate-fade">
                {loading ? (
                  <div className="p-6 text-[13px] text-sand-400">Loading the city…</div>
                ) : error ? (
                  <div className="p-6 text-[13px] text-accent-300">Couldn't load the city data: {error}</div>
                ) : (
                  <LeftPanel />
                )}
              </div>
            </aside>
          )}

          {drawerOpen && (
            <aside
              aria-label="Details"
              className="theme-cream sheet-surface panel-scroll absolute inset-x-0 bottom-0 z-30 h-[60dvh] rounded-t-2xl animate-sheet-up md:inset-x-auto md:bottom-3 md:right-3 md:top-3 md:h-auto md:w-[344px] md:rounded-2xl md:animate-slide-in xl:w-[392px]"
            >
              <RightPanel />
            </aside>
          )}

          <OrbitNav />
        </div>

        {ready && (
          <div className={`hidden shrink-0 border-t hairline bg-ink-950 transition-[height] duration-300 md:block ${bottomOpen ? 'h-[248px]' : 'h-10'}`}>
            <BottomPanel />
          </div>
        )}
      </div>
      <IntroOverlay />
    </div>
  );
}
