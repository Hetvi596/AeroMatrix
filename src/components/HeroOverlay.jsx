import React, { useState, useEffect } from 'react';
import { ArrowUpRight, Activity, Terminal, ExternalLink, Copy, Check, X, ShieldAlert } from 'lucide-react';
import { SYSTEM_CONFIG, checkSystemStatus } from '../utils/systemConfig';

export default function HeroOverlay() {
  const [status, setStatus] = useState({
    twinOnline: false,
    apiOnline: false,
    modelLoaded: false,
    checked: false,
  });
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const probe = async () => {
      const result = await checkSystemStatus();
      if (isMounted) {
        setStatus({ ...result, checked: true });
      }
    };

    probe();
    const interval = setInterval(probe, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleCopyCommand = (cmd) => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrimaryClick = (e) => {
    // If twin is not verified online, still allow opening, but show launch helper modal too
    if (!status.twinOnline) {
      // Open in background tab while showing guide if they need to start it
      setShowLaunchModal(true);
    }
  };

  return (
    <>
      <div className="relative z-10 w-full min-h-screen flex flex-col justify-center items-center px-6 pointer-events-none select-none text-center">

        {/* Unified Hero Composition: Centered Directly Over India Map */}
        <div className="flex flex-col items-center justify-center max-w-5xl mx-auto pt-10">

          {/* Dominant Hero Title: AERO-MATRIX */}
          <h1
            className="font-display text-6xl sm:text-8xl md:text-9xl lg:text-[10rem] font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-100 to-slate-400/70 drop-shadow-[0_15px_45px_rgba(0,0,0,0.95)] leading-none mb-5"
          >
            AERO-MATRIX
          </h1>

          {/* Highlighted Tagline: Intelligence for cleaner cities */}
          <p className="text-base sm:text-xl md:text-2xl font-medium tracking-wide max-w-xl mb-10 text-transparent bg-clip-text bg-gradient-to-r from-sky-200 via-white to-cyan-300 drop-shadow-[0_0_25px_rgba(56,189,248,0.45)]">
            Intelligence for cleaner cities.
          </p>

          {/* System Connection & Primary CTA Cluster */}
          <div className="pointer-events-auto flex flex-col items-center gap-4 mt-2">
            
            {/* Primary Action Button: Connects directly to Backend Twin */}
            <div className="flex items-center gap-3">
              <a
                href={SYSTEM_CONFIG.twinUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handlePrimaryClick}
                className="btn-primary group py-3.5 px-8 text-sm sm:text-base shadow-[0_6px_30px_rgba(56,189,248,0.25)] flex items-center gap-3"
                id="hero-primary-cta"
                title="Launch Urban Environmental Digital Twin System"
              >
                <span>Explore the System</span>
                <ArrowUpRight
                  size={18}
                  className="text-cyan-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
                />
              </a>
            </div>

            {/* Live Backend Telemetry Indicator */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLaunchModal(true)}
                className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/70 border border-sky-500/20 backdrop-blur-md text-[11px] font-mono text-slate-300 hover:border-cyan-400/40 hover:text-cyan-300 transition-all cursor-pointer"
                title="Click for System Connection & Launch Info"
              >
                {status.twinOnline ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-emerald-400 font-semibold">Twin System Online</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">:5174</span>
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
                    </span>
                    <span className="text-slate-300">Target: localhost:5174</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-cyan-400 hover:underline">Launch Guide</span>
                  </>
                )}
                {status.apiOnline && (
                  <span className="ml-1 text-[10px] text-teal-400 bg-teal-950/80 px-1.5 py-0.5 rounded border border-teal-500/30">
                    ML API :8000
                  </span>
                )}
              </button>
            </div>

          </div>

        </div>

        {/* Subtle Bottom Scroll Hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-auto opacity-60 hover:opacity-100 transition-opacity">
          <span className="text-[10px] font-mono tracking-widest uppercase text-slate-400">Scroll</span>
          <div className="w-4 h-7 rounded-full border border-slate-500/40 flex items-start justify-center p-1">
            <div className="w-1 h-2 rounded-full bg-cyan-400 animate-bounce" />
          </div>
        </div>

      </div>

      {/* High-Tech System Launch & Connection Modal */}
      {showLaunchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="relative w-full max-w-lg rounded-2xl bg-[#090d16] border border-cyan-500/30 shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-6 sm:p-8 text-left text-slate-200">
            
            {/* Close button */}
            <button
              onClick={() => setShowLaunchModal(false)}
              className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X size={18} />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-400">
                <Activity size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-display">Aero-Matrix Digital Twin System</h3>
                <p className="text-xs text-slate-400">Connection Portal & Runtime Configuration</p>
              </div>
            </div>

            {/* Live Endpoints Status Box */}
            <div className="mb-5 rounded-xl bg-slate-900/80 border border-sky-500/15 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">3D Digital Twin UI</span>
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${status.twinOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className={status.twinOnline ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                    {status.twinOnline ? 'Active (Ready)' : 'Ready on http://localhost:5174'}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono border-t border-slate-800/80 pt-2.5">
                <span className="text-slate-400">ML Forecast API</span>
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${status.apiOnline ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  <span className={status.apiOnline ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                    {status.apiOnline ? 'Serving on :8000' : 'Optional on http://localhost:8000'}
                  </span>
                </span>
              </div>
            </div>

            {/* Terminal Command Snippet */}
            <div className="mb-6">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span className="flex items-center gap-1.5 font-mono">
                  <Terminal size={14} className="text-cyan-400" />
                  Launch Command (Run from project root):
                </span>
                {copied && <span className="text-emerald-400 text-[11px] font-mono">Copied!</span>}
              </div>
              <div className="flex items-center justify-between bg-black/60 rounded-xl border border-sky-500/20 px-3.5 py-2.5 font-mono text-xs text-cyan-300">
                <code className="select-all">npm run dev:backend</code>
                <button
                  type="button"
                  onClick={() => handleCopyCommand('npm run dev:backend')}
                  className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors ml-2"
                  title="Copy command"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                Tip: Run <code className="text-cyan-400 font-mono">npm run dev:all</code> to start both Landing Page and Digital Twin together!
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setShowLaunchModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Close
              </button>
              <a
                href={SYSTEM_CONFIG.twinUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowLaunchModal(false)}
                className="btn-primary py-2 px-5 text-xs uppercase tracking-wider flex items-center gap-1.5"
              >
                <span>Open Digital Twin</span>
                <ExternalLink size={14} />
              </a>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
