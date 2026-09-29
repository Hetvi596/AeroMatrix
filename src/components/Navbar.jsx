import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { toggleAmbientAudio } from '../utils/audio';
import { SYSTEM_CONFIG } from '../utils/systemConfig';

export default function Navbar() {
  const [audioOn, setAudioOn] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleAudioClick = () => {
    const active = toggleAmbientAudio();
    setAudioOn(active);
  };

  return (
    <header
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${scrolled
          ? 'py-3 bg-slate-950/80 backdrop-blur-xl border-b border-sky-500/10 shadow-[0_4px_30px_rgba(0,0,0,0.6)]'
          : 'py-5 bg-transparent'
        }`}
    >
      <div className="container-wide flex items-center justify-between">

        {/* Brand Logo */}
        <a href="#" className="flex items-center gap-3 group text-decoration-none">
          <div className="relative w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-400/30 flex items-center justify-center group-hover:border-cyan-400 transition-colors">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#38bdf8] group-hover:scale-125 transition-transform" />
            <div className="absolute inset-0 border border-teal-400/30 rounded-lg animate-ping opacity-25" />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-bold text-lg tracking-wider text-white group-hover:text-cyan-300 transition-colors">
              AERO-MATRIX
            </span>
            <span className="text-[9px] font-mono tracking-widest text-slate-400 -mt-1 uppercase">
              Environmental Twin
            </span>
          </div>
        </a>

        {/* Minimal Nav Anchors */}
        <nav className="hidden md:flex items-center gap-8">
          <a href="#what-is" className="text-sm font-medium text-slate-300 hover:text-cyan-300 transition-colors tracking-wide">
            Concept
          </a>
          <a href="#capabilities" className="text-sm font-medium text-slate-300 hover:text-cyan-300 transition-colors tracking-wide">
            Capabilities
          </a>
          <a href="#pipeline" className="text-sm font-medium text-slate-300 hover:text-cyan-300 transition-colors tracking-wide">
            Pipeline
          </a>
          <a href="#geospatial" className="text-sm font-medium text-slate-300 hover:text-cyan-300 transition-colors tracking-wide">
            Spatial Grid
          </a>
        </nav>

        {/* Actions: Ambient Audio & Primary CTA */}
        <div className="flex items-center gap-4">

          {/* Ambient Audio Synthesizer Toggle */}
          <button
            onClick={handleAudioClick}
            className={`p-2.5 rounded-lg border transition-all flex items-center gap-2 cursor-pointer ${audioOn
                ? 'bg-sky-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(56,189,248,0.3)]'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20'
              }`}
            title={audioOn ? 'Mute Atmospheric Audio' : 'Play Atmospheric Audio Pad'}
            aria-label="Toggle ambient atmospheric audio"
          >
            {audioOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span className="hidden lg:inline text-xs font-mono uppercase tracking-wider">
              {audioOn ? 'Audio: ON' : 'Ambient'}
            </span>
          </button>

          {/* Primary CTA */}
          <a
            href={SYSTEM_CONFIG.twinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-xs py-2 px-4 uppercase tracking-wider"
            title="Launch Aero-Matrix Twin System"
          >
            <span>Enter Aero-Matrix</span>
          </a>

        </div>

      </div>
    </header>
  );
}
