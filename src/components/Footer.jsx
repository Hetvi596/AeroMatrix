import React from 'react';
import { SYSTEM_CONFIG } from '../utils/systemConfig';

export default function Footer() {
  return (
    <footer className="relative border-t border-sky-500/10 py-12 bg-slate-950/90 text-slate-400">
      <div className="container-wide flex flex-col md:flex-row items-center justify-between gap-6">

        {/* Brand & Built by */}
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6">
          <span className="font-display font-bold text-lg tracking-wider text-white">
            AERO-MATRIX
          </span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <a
            href={SYSTEM_CONFIG.twinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Launch Twin System →
          </a>
        </div>

        {/* Essential Navigation Links */}
        <div className="flex items-center gap-8 text-xs font-medium tracking-wide">
          <span className="hidden sm:inline text-slate-700">|</span>
          <span className="text-xs font-mono text-slate-400 tracking-wider">
            Built by <span className="text-cyan-400 font-semibold">Byte Busters</span>
          </span>
        </div>

      </div>
    </footer>
  );
}
