import React from 'react';
import Navbar from './components/Navbar';
import HeroScene from './components/HeroScene';
import HeroOverlay from './components/HeroOverlay';
import WhatIsAeroMatrix from './components/WhatIsAeroMatrix';
import Capabilities from './components/Capabilities';
import DataPipeline from './components/DataPipeline';
import GeospatialSection from './components/GeospatialSection';
import CommunitySection from './components/CommunitySection';
import Footer from './components/Footer';

export default function App() {
  return (
    <div className="relative min-h-screen bg-[#030712] text-slate-100 selection:bg-sky-500/30 selection:text-white">
      
      {/* Fixed Futuristic Navigation */}
      <Navbar />

      <main>
        {/* HERO: Realistic 3D India Satellite Map + Centered AERO-MATRIX */}
        <section className="relative w-full min-h-screen overflow-hidden flex items-center justify-center">
          <HeroScene />
          <HeroOverlay />
        </section>

        {/* SECTION 1: Platform Genesis / Air. Data. Intelligence. */}
        <WhatIsAeroMatrix />

        <div className="chapter-separator" />

        {/* SECTION 2: Core Capabilities / Engineered for Precision */}
        <Capabilities />

        <div className="chapter-separator" />

        {/* SECTION 3: Intelligent Pipeline / From Data to Decision. */}
        <DataPipeline />

        <div className="chapter-separator" />

        {/* SECTION 4: Geospatial Intelligence / Pollution is spatial. */}
        <GeospatialSection />

        <div className="chapter-separator" />

        {/* SECTION 5: Civic Ecosystem / Built for better cities. */}
        <CommunitySection />
      </main>

      {/* MINIMAL FOOTER: Built by ByteVerse */}
      <Footer />

    </div>
  );
}
