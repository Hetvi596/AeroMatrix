import { useEffect, useRef } from 'react';
import { Layers, ListChecks, SlidersHorizontal, Wind, X } from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import type { Section } from '../types';
import { LogoMark, Wordmark } from './Brand';

const STEPS: { verb: string; icon: typeof Layers; text: string; section: Section }[] = [
  { verb: 'Understand', icon: Layers, text: 'Read the city zone by zone: pollution, traffic, industry and green cover in 3D.', section: 'overview' },
  { verb: 'Inspect', icon: Wind, text: 'Switch pollutants, find hotspots and see what drives each one.', section: 'air' },
  { verb: 'Simulate', icon: SlidersHorizontal, text: 'Change traffic, industry, trees or weather and run a what-if on the map.', section: 'simulator' },
  { verb: 'Act', icon: ListChecks, text: 'Compare reduction measures and candidate sites, then save the best scenario.', section: 'actions' },
];

/** First-visit guide. */
export function IntroOverlay() {
  const open = useTwin((s) => s.introOpen);
  const setOpen = useTwin((s) => s.setIntroOpen);
  const setSection = useTwin((s) => s.setSection);
  const setLeftOpen = useTwin((s) => s.setLeftOpen);
  const enter = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    enter.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;
  const go = (s: Section) => {
    setSection(s);
    setLeftOpen(true);
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-ink-950/[0.97] animate-fade" role="dialog" aria-modal="true" aria-label="AeroMatrix guide">
      <div className="flex items-center justify-between px-5 pt-5 sm:px-8 sm:pt-6">
        <div className="flex items-center gap-2.5 text-sand-50">
          <LogoMark size={26} />
          <Wordmark />
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-sand-200 ring-1 ring-inset ring-sand-100/20 hover:bg-sand-100/10"
        >
          <X size={14} aria-hidden="true" /> Close
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 py-10 sm:px-8">
        <h1 className="max-w-3xl text-[clamp(34px,4.6vw,60px)] font-bold leading-[1.04] tracking-[-0.03em] text-sand-50">
          Pune's air, as a working model of the city.
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-sand-300">
          A 3D digital twin for finding pollution hotspots, testing interventions and comparing sites. The data-source control in the
          header always tells you whether the map shows observations, predictions, modeled scenarios or demo values.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-sand-100/10 ring-1 ring-sand-100/10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ verb, icon: Icon, text, section }) => (
            <button
              key={verb}
              type="button"
              onClick={() => go(section)}
              className="group flex min-h-[168px] cursor-pointer flex-col bg-ink-900 p-5 text-left transition-colors duration-150 hover:bg-ink-800"
            >
              <Icon size={20} className="text-accent-300" aria-hidden="true" />
              <div className="mt-6">
                <div className="text-[22px] font-semibold tracking-[-0.02em] text-sand-50">{verb}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-sand-400 group-hover:text-sand-300">{text}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-8">
          <button
            ref={enter}
            type="button"
            onClick={() => setOpen(false)}
            className="cursor-pointer rounded-lg bg-accent-500 px-5 py-2.5 text-[14px] font-semibold text-white shadow-[0_12px_28px_-14px_rgba(107,23,41,0.95)] transition-colors hover:bg-accent-600"
          >
            Open the map
          </button>
        </div>
      </div>
    </div>
  );
}
