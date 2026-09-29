import React, { useState } from 'react';
import { Database, Cpu, Compass, Sliders, Zap } from 'lucide-react';

const PIPELINE_STAGES = [
  {
    step: '01',
    title: 'REAL WORLD DATA',
    desc: 'Satellite spectrometers, urban IoT sensor arrays, traffic flow & industrial telemetry.',
    icon: Database,
    telemetry: '14.8M INPUTS / HR',
    color: '#38bdf8'
  },
  {
    step: '02',
    title: 'AI / ML',
    desc: 'Physics-informed neural networks modeling atmospheric advection and dispersion chemistry.',
    icon: Cpu,
    telemetry: 'PINN SURROGATE v4.2',
    color: '#818cf8'
  },
  {
    step: '03',
    title: 'PREDICTION',
    desc: 'Spatiotemporal 72-hour particulate forecasting across 10-meter urban micro-grids.',
    icon: Compass,
    telemetry: '72H TRAJECTORY',
    color: '#2dd4bf'
  },
  {
    step: '04',
    title: 'SIMULATION',
    desc: 'Bifurcated scenario modeling: traffic bans, green filters, industrial emission caps.',
    icon: Sliders,
    telemetry: 'WHAT-IF RUNTIMES < 2s',
    color: '#f59e0b'
  },
  {
    step: '05',
    title: 'ACTION',
    desc: 'Algorithmic mitigation dispatch, targeted zoning alerts, and municipal policy guidance.',
    icon: Zap,
    telemetry: 'AUTOMATED DISPATCH',
    color: '#10b981'
  }
];

export default function DataPipeline() {
  const [activeStage, setActiveStage] = useState(2);

  return (
    <section id="pipeline" className="section-wrapper cv-auto overflow-hidden">

      {/* Background glow */}
      <div className="bg-ambient-radial w-[500px] h-[500px] bg-sky-500/10 left-1/3 top-1/2 pointer-events-none" />

      <div className="container-wide">

        {/* Section Header with comfortable breathing room */}
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto mb-12 md:mb-14 lg:mb-16">
          <div className="badge-telemetry mb-5">
            <span className="status-dot"></span>
            <span>Intelligent Pipeline</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight font-display mb-4 leading-[1.15]">
            From Data to Decision.
          </h2>
          <p className="text-base sm:text-lg text-slate-300/90 font-light leading-relaxed max-w-xl">
            A continuous closed-loop pipeline translating heterogeneous satellite and sensor feeds into targeted urban interventions.
          </p>
        </div>

        {/* Dynamic Animated Pipeline Track */}
        <div className="relative">

          {/* Connecting Conduit Line (Desktop) */}
          <div className="hidden lg:block absolute top-[44%] left-8 right-8 -translate-y-1/2 h-[2px] bg-slate-800/80 pointer-events-none z-0">
            {/* Animated Light Pulse traveling across stages */}
            <div
              className="h-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent w-56 animate-pulse"
              style={{
                animation: 'stream-flow 3s linear infinite'
              }}
            />
          </div>

          {/* 5 Stages Grid with larger, prominent boxes and aligned visual rhythm */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-5 lg:gap-5.5 relative z-10 items-stretch">
            {PIPELINE_STAGES.map((stg, idx) => {
              const Icon = stg.icon;
              const isActive = activeStage === idx;

              return (
                <div
                  key={stg.step}
                  onMouseEnter={() => setActiveStage(idx)}
                  className={`p-5 sm:p-6 rounded-2xl border backdrop-blur-xl transition-all duration-300 flex flex-col justify-between h-full min-h-[280px] sm:min-h-[300px] lg:min-h-[320px] cursor-pointer ${isActive
                    ? 'bg-slate-900/95 border-sky-400/80 shadow-[0_0_30px_rgba(56,189,248,0.22)] -translate-y-1.5'
                    : 'bg-slate-950/70 border-white/10 hover:border-white/20 hover:bg-slate-900/50'
                    }`}
                >
                  <div>
                    {/* Header: Step Number & Larger Icon */}
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-[11px] font-mono font-semibold tracking-wider text-slate-400 bg-slate-800/60 px-2.5 py-1 rounded border border-white/5">
                        STAGE {stg.step}
                      </span>
                      <div
                        className="p-2.5 rounded-xl border flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                        style={{
                          backgroundColor: `${stg.color}18`,
                          borderColor: `${stg.color}45`,
                          color: stg.color
                        }}
                      >
                        <Icon size={18} />
                      </div>
                    </div>

                    {/* Larger Title */}
                    <h3 className="text-base sm:text-lg font-bold text-white tracking-wide mb-2.5 font-display">
                      {stg.title}
                    </h3>

                    {/* Larger, Readable Description */}
                    <p className="text-xs sm:text-sm text-slate-300/80 leading-relaxed font-light mb-4">
                      {stg.desc}
                    </p>
                  </div>

                  {/* Telemetry pill */}
                  <div className="mt-auto pt-4 border-t border-white/10">
                    <span
                      className="text-[11px] font-mono tracking-wider font-semibold block"
                      style={{ color: stg.color }}
                    >
                      {stg.telemetry}
                    </span>
                  </div>

                </div>
              );
            })}
          </div>

        </div>

      </div>
    </section>
  );
}
