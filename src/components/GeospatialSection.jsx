import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Layers, MapPin, Eye, Wind, Shield } from 'lucide-react';

const LAYERS = [
  { id: 'all', label: 'All Spatial Layers', icon: Layers, color: '#38bdf8' },
  { id: 'hotspots', label: 'Pollution Hotspots', icon: Eye, color: '#f59e0b' },
  { id: 'traffic', label: 'Traffic Corridors', icon: Wind, color: '#00f2fe' },
  { id: 'industrial', label: 'Industrial Zones', icon: MapPin, color: '#f43f5e' },
  { id: 'buffers', label: 'Green Buffers', icon: Shield, color: '#10b981' }
];

export default function GeospatialSection() {
  const [activeLayer, setActiveLayer] = useState('all');
  const [selectedCell] = useState({
    id: 'GRID-DEL-04',
    coords: '28.6139° N, 77.2090° E',
    canopy: '12% Low',
    retention: 'Elevated (Canyon Trap)',
    aqi: 178
  });
  const mountRef = useRef(null);
  const activeLayerRef = useRef('all');

  useEffect(() => {
    activeLayerRef.current = activeLayer;
  }, [activeLayer]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let animId;
    let isVisible = true;

    // Three.js Spatial Hexagonal / Voxel Grid
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030712, 0.04);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 11, 13);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Grid Matrix Group
    const gridMaster = new THREE.Group();
    scene.add(gridMaster);

    // Create 12x12 3D Spatial Voxel Columns
    const ROWS = 10;
    const COLS = 10;
    const SPACING = 1.05;
    const cells = [];

    const boxGeo = new THREE.BoxGeometry(0.85, 1, 0.85);

    for (let r = -ROWS / 2; r < ROWS / 2; r++) {
      for (let c = -COLS / 2; c < COLS / 2; c++) {
        const distFromCenter = Math.sqrt(r * r + c * c);

        // Assign zones
        let zoneType = 'normal';
        let baseHeight = 0.4 + Math.sin(r * 0.5) * Math.cos(c * 0.5) * 0.3;
        let hexColor = 0x0f244a;

        if (distFromCenter < 2.0) {
          zoneType = 'hotspots';
          baseHeight = 1.8 + Math.random() * 0.8;
          hexColor = 0xf59e0b; // Hotspot amber
        } else if (Math.abs(r) === 1 || Math.abs(c) === 1) {
          zoneType = 'traffic';
          baseHeight = 0.8 + Math.random() * 0.4;
          hexColor = 0x00f2fe; // Traffic cyan
        } else if (r > 2 && c > 2) {
          zoneType = 'industrial';
          baseHeight = 2.2 + Math.random() * 0.6;
          hexColor = 0xf43f5e; // Industrial rose
        } else if (r < -2 && c < -2) {
          zoneType = 'buffers';
          baseHeight = 0.5;
          hexColor = 0x10b981; // Green buffer
        }

        const mat = new THREE.MeshStandardMaterial({
          color: hexColor,
          roughness: 0.4,
          metalness: 0.6,
          transparent: true,
          opacity: 0.85
        });

        const mesh = new THREE.Mesh(boxGeo, mat);
        mesh.position.set(c * SPACING, baseHeight / 2, r * SPACING);
        mesh.scale.set(1, baseHeight, 1);
        gridMaster.add(mesh);

        // Wireframe border
        const edges = new THREE.EdgesGeometry(boxGeo);
        const edgeLine = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.3 })
        );
        mesh.add(edgeLine);

        cells.push({
          mesh,
          zoneType,
          originalColor: hexColor,
          baseHeight,
          r,
          c
        });
      }
    }

    // Atmospheric Grid Particles
    const pCount = 200;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 12;
      pPos[i * 3 + 1] = 0.5 + Math.random() * 3;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.08,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });
    const pSystem = new THREE.Points(pGeo, pMat);
    gridMaster.add(pSystem);

    // Lights
    const ambLight = new THREE.AmbientLight(0x0c1e3d, 1.8);
    scene.add(ambLight);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 2.0);
    dirLight.position.set(5, 12, 8);
    scene.add(dirLight);

    // Performance Observer
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        isVisible = entry.isIntersecting;
      });
    }, { threshold: 0.1 });
    observer.observe(container);

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Animate
    const startTime = performance.now();
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isVisible) return;

      const elapsed = (performance.now() - startTime) * 0.001;
      gridMaster.rotation.y = elapsed * 0.05;

      const current = activeLayerRef.current;

      // Filter layer heights and opacities
      cells.forEach(cell => {
        if (current === 'all' || cell.zoneType === current) {
          cell.mesh.material.opacity = 0.85;
          const pulse = Math.sin(elapsed * 2 + cell.r + cell.c) * 0.15;
          cell.mesh.scale.y = cell.baseHeight + pulse;
          cell.mesh.position.y = (cell.baseHeight + pulse) / 2;
        } else {
          cell.mesh.material.opacity = 0.15;
          cell.mesh.scale.y = 0.2;
          cell.mesh.position.y = 0.1;
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      cancelAnimationFrame(animId);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <section id="geospatial" className="section-wrapper cv-auto overflow-hidden">

      {/* Background ambient lighting */}
      <div className="bg-ambient-radial w-[500px] h-[500px] bg-sky-500/10 -left-32 top-1/3 pointer-events-none" />

      <div className="container-wide">

        {/* Section Header with comfortable, professional breathing room */}
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto mb-12 md:mb-16">
          <div className="badge-telemetry mb-5">
            <span className="status-dot"></span>
            <span>Geospatial Intelligence</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight font-display mb-5 leading-[1.15]">
            Pollution is spatial.
          </h2>

        </div>

        {/* Layer Controls Bar with comfortable tag breathing room */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-3.5 mb-12 md:mb-16">
          {LAYERS.map((layer) => {
            const Icon = layer.icon;
            const isSelected = activeLayer === layer.id;
            return (
              <button
                key={layer.id}
                onClick={() => setActiveLayer(layer.id)}
                className={`flex items-center gap-2.5 px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl border text-xs font-mono tracking-wider uppercase transition-all cursor-pointer ${isSelected
                  ? 'bg-slate-900 border-sky-400 text-sky-300 shadow-[0_0_20px_rgba(56,189,248,0.25)]'
                  : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20'
                  }`}
              >
                <Icon size={14} style={{ color: layer.color }} />
                <span>{layer.label}</span>
              </button>
            );
          })}
        </div>

        {/* 3D Spatial Grid Viewport */}
        <div className="relative w-full aspect-[4/3] sm:aspect-[16/9] max-w-5xl mx-auto rounded-2xl border border-sky-500/20 bg-slate-950/80 overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.85)]">

          <div ref={mountRef} className="w-full h-full" />

          {/* Floating Spatial Cell Telemetry Badge */}
          <div className="absolute top-6 left-6 p-4 rounded-xl bg-slate-950/85 border border-sky-500/25 backdrop-blur-md max-w-xs pointer-events-none">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest flex items-center justify-between">
              <span>Selected Voxel</span>
              <span className="text-sky-400">{selectedCell.id}</span>
            </div>
            <div className="text-sm font-semibold text-white font-mono mt-1">
              {selectedCell.coords}
            </div>
            <div className="mt-3 pt-2.5 border-t border-white/10 grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div>
                <span className="text-slate-400">Canopy:</span>
                <span className="text-slate-200 ml-1">{selectedCell.canopy}</span>
              </div>
              <div>
                <span className="text-slate-400">AQI:</span>
                <span className="text-amber-400 ml-1">{selectedCell.aqi}</span>
              </div>
            </div>
          </div>

          <div className="absolute bottom-6 right-6 text-[10px] font-mono text-slate-400 bg-slate-950/70 px-3 py-1.5 rounded-lg border border-white/10 pointer-events-none">
            3D SPATIAL DISPERSION MESH
          </div>

        </div>

      </div>
    </section>
  );
}
