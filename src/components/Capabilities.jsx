import React, { useState } from 'react';
import { TrendingUp, Eye, Sliders, ShieldCheck } from 'lucide-react';

const FLASHCARDS = [
  {
    id: 'predict',
    title: 'PREDICT',
    desc: 'Forecast future air quality with spatiotemporal neural physics.',
    icon: TrendingUp,
    badge: '72H HORIZON',
    accentColor: '#38bdf8',
    telemetry: '99.4% NEURAL FIDELITY',
    visualSVG: (
      <svg className="w-full h-18 stroke-sky-400 fill-none" viewBox="0 0 200 65">
        <path d="M 10 46 Q 40 36, 75 42 T 135 25 T 190 13" strokeWidth="2" strokeLinecap="round" />
        <path d="M 135 25 Q 165 13, 190 6" strokeWidth="1.5" strokeDasharray="3 3" stroke="#2dd4bf" />
        <circle cx="135" cy="25" r="3.5" fill="#38bdf8" />
        <circle cx="190" cy="13" r="3.5" fill="#2dd4bf" />
        <line x1="135" y1="6" x2="135" y2="55" stroke="rgba(56,189,248,0.25)" strokeDasharray="2 2" />
      </svg>
    )
  },
  {
    id: 'understand',
    title: 'UNDERSTAND',
    desc: 'Identify pollution hotspots and source contributions in real time.',
    icon: Eye,
    badge: 'SOURCE APPORTIONMENT',
    accentColor: '#2dd4bf',
    telemetry: 'REAL-TIME TRACING',
    visualSVG: (
      <svg className="w-full h-18 stroke-teal-400 fill-none" viewBox="0 0 200 65">
        <circle cx="100" cy="32" r="24" stroke="rgba(45,212,191,0.2)" strokeWidth="1" />
        <circle cx="100" cy="32" r="14" stroke="rgba(45,212,191,0.4)" strokeWidth="1" />
        <circle cx="100" cy="32" r="4" fill="#2dd4bf" />
        <line x1="74" y1="32" x2="126" y2="32" stroke="rgba(45,212,191,0.3)" />
        <line x1="100" y1="8" x2="100" y2="56" stroke="rgba(45,212,191,0.3)" />
        <circle cx="111" cy="24" r="2.5" fill="#f59e0b" />
        <circle cx="87" cy="38" r="2.5" fill="#38bdf8" />
      </svg>
    )
  },
  {
    id: 'simulate',
    title: 'SIMULATE',
    desc: 'Test environmental "what-if" scenarios across urban micro-climates.',
    icon: Sliders,
    badge: 'DIGITAL TWIN',
    accentColor: '#818cf8',
    telemetry: 'LATENCY < 2 SECONDS',
    visualSVG: (
      <svg className="w-full h-18 stroke-indigo-400 fill-none" viewBox="0 0 200 65">
        <rect x="25" y="18" width="24" height="24" rx="5" stroke="#818cf8" strokeWidth="1.5" />
        <rect x="85" y="11" width="24" height="24" rx="5" stroke="#38bdf8" strokeWidth="1.5" />
        <rect x="145" y="22" width="24" height="24" rx="5" stroke="#2dd4bf" strokeWidth="1.5" />
        <path d="M 49 30 L 85 23" strokeWidth="1.5" strokeDasharray="3 3" />
        <path d="M 109 23 L 145 34" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
    )
  },
  {
    id: 'act',
    title: 'ACT',
    desc: 'Explore targeted mitigation and optimal civic intervention strategies.',
    icon: ShieldCheck,
    badge: 'OPTIMAL POLICY',
    accentColor: '#10b981',
    telemetry: 'EVIDENCE-BASED DISPATCH',
    visualSVG: (
      <svg className="w-full h-18 stroke-emerald-400 fill-none" viewBox="0 0 200 65">
        <polygon points="100,10 125,52 75,52" stroke="#10b981" strokeWidth="1.5" />
        <circle cx="100" cy="10" r="3" fill="#10b981" />
        <circle cx="125" cy="52" r="3" fill="#10b981" />
        <circle cx="75" cy="52" r="3" fill="#10b981" />
        <circle cx="100" cy="33" r="5.5" stroke="rgba(16,185,129,0.5)" strokeWidth="1" />
        <circle cx="100" cy="33" r="2.5" fill="#fff" />
      </svg>
    )
  }
];

export default function Capabilities() {
  const [activeTilt, setActiveTilt] = useState({});

  const handleMouseMove = (id, e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;

    // Smooth, subtle 3D tilt angles
    const rotX = -(y / rect.height) * 4;
    const rotY = (x / rect.width) * 4;

    setActiveTilt(prev => ({
      ...prev,
      [id]: { x: rotX, y: rotY }
    }));
  };

  const handleMouseLeave = (id) => {
    setActiveTilt(prev => ({
      ...prev,
      [id]: { x: 0, y: 0 }
    }));
  };

  return (
    <section
      id="capabilities"
      className="section-wrapper cv-auto overflow-hidden"
    >

      {/* Background ambient lighting */}
      <div className="bg-ambient-radial w-[500px] h-[500px] bg-teal-500/10 right-0 top-1/3 pointer-events-none" />

      <div className="container-wide">

        {/* Section Header with comfortable, professional breathing room */}
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto mb-16 md:mb-20 lg:mb-22">
          <div className="badge-telemetry mb-5">
            <span className="status-dot"></span>
            <span>Core Capabilities</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight font-display mb-5 leading-[1.15]">
            Engineered for Precision
          </h2>

        </div>

        {/* Floating Dynamic Flashcards Grid with generous gaps and aligned cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-7 md:gap-8 lg:gap-9 items-stretch">
          {FLASHCARDS.map((card) => {
            const tilt = activeTilt[card.id] || { x: 0, y: 0 };
            const Icon = card.icon;
            const isHovered = tilt.x !== 0 || tilt.y !== 0;

            return (
              <div
                key={card.id}
                onMouseMove={(e) => handleMouseMove(card.id, e)}
                onMouseLeave={() => handleMouseLeave(card.id)}
                className="relative group p-6 sm:p-7 lg:p-7.5 rounded-2xl bg-gradient-to-b from-slate-900/80 to-slate-950/90 border border-sky-500/20 backdrop-blur-2xl flex flex-col justify-between cursor-pointer h-full"
                style={{
                  transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(${isHovered ? -5 : 0}px)`,
                  transformStyle: 'preserve-3d',
                  transition: 'transform 0.65s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.65s ease, border-color 0.4s ease',
                  willChange: 'transform',
                  boxShadow: isHovered
                    ? `0 20px 40px -10px rgba(0, 0, 0, 0.7), 0 0 25px 0 ${card.accentColor}20`
                    : `0 10px 25px -10px rgba(0, 0, 0, 0.5)`
                }}
              >
                {/* Glowing Corner Accents */}
                <div className="absolute top-0 left-0 w-3.5 h-3.5 border-t-2 border-l-2 border-sky-400/40 rounded-tl-lg pointer-events-none" />
                <div className="absolute bottom-0 right-0 w-3.5 h-3.5 border-b-2 border-r-2 border-teal-400/40 rounded-br-lg pointer-events-none" />

                <div>
                  {/* Top Bar: Icon + Badge */}
                  <div className="flex items-center justify-between mb-6">
                    <div
                      className="p-3 rounded-xl border flex items-center justify-center transition-transform duration-500 group-hover:scale-110"
                      style={{
                        backgroundColor: `${card.accentColor}15`,
                        borderColor: `${card.accentColor}35`,
                        color: card.accentColor
                      }}
                    >
                      <Icon size={20} />
                    </div>
                    <span className="text-[10px] font-mono tracking-widest uppercase text-slate-400 bg-slate-800/60 px-2.5 py-1 rounded border border-white/5">
                      {card.badge}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-xl font-bold tracking-wider text-white mb-3 font-display">
                    {card.title}
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed font-light mb-7">
                    {card.desc}
                  </p>
                </div>

                {/* Holographic Micro-Visualization */}
                <div className="pt-5 border-t border-white/5 opacity-80 group-hover:opacity-100 transition-opacity duration-500">
                  {card.visualSVG}
                  <div className="mt-3.5 text-[10px] font-mono tracking-wider font-semibold text-right" style={{ color: card.accentColor }}>
                    {card.telemetry}
                  </div>
                </div>

              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
