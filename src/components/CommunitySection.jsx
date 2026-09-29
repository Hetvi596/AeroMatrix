import React from 'react';
import { Microscope, Compass, GraduationCap, ShieldAlert, Landmark } from 'lucide-react';

const STAKEHOLDERS = [
  {
    title: 'Researchers',
    desc: 'Atmospheric physics & sensor calibration',
    icon: Microscope,
    color: '#38bdf8'
  },
  {
    title: 'Planners',
    desc: 'Ventilation corridors & green buffers',
    icon: Compass,
    color: '#2dd4bf'
  },
  {
    title: 'Students',
    desc: 'Open air science & climate literacy',
    icon: GraduationCap,
    color: '#818cf8'
  },
  {
    title: 'Environmental Teams',
    desc: 'Industrial monitoring & compliance',
    icon: ShieldAlert,
    color: '#f59e0b'
  },
  {
    title: 'Urban Decision-Makers',
    desc: 'Evidence-backed policy intervention',
    icon: Landmark,
    color: '#10b981'
  }
];

export default function CommunitySection() {
  return (
    <section className="relative py-12 md:py-16 cv-auto">

      <div className="container-wide">

        {/* Section Header with comfortable, balanced internal spacing */}
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto mb-14 md:mb-18">
          <div className="badge-telemetry mb-5">
            <span className="status-dot"></span>
            <span>Civic Ecosystem</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight font-display leading-[1.15]">
            Built for better cities.
          </h2>
        </div>

        {/* Minimal Clean Stakeholder Badges with generous horizontal & vertical breathing room */}
        <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-6 lg:gap-7 max-w-5xl mx-auto">
          {STAKEHOLDERS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="flex items-center gap-3.5 px-5 py-3.5 sm:px-6 sm:py-4 rounded-xl bg-slate-900/60 border border-sky-500/15 backdrop-blur-md hover:border-sky-400/40 hover:bg-slate-900/80 transition-all duration-300"
              >
                <div
                  className="p-2.5 rounded-lg border flex-shrink-0"
                  style={{
                    backgroundColor: `${item.color}15`,
                    borderColor: `${item.color}30`,
                    color: item.color
                  }}
                >
                  <Icon size={18} />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-white font-display mb-0.5">
                    {item.title}
                  </span>
                  <span className="text-xs text-slate-400 font-light">
                    {item.desc}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
