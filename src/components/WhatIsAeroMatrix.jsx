import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Layers, Cpu, Compass } from 'lucide-react';

export default function WhatIsAeroMatrix() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    let animId;
    let isVisible = true;

    // Three.js Atmospheric Vortex Scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 8.5);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Atmospheric Vortex Group
    const vortexGroup = new THREE.Group();
    scene.add(vortexGroup);

    // Inner Glowing Core
    const coreGeo = new THREE.SphereGeometry(1.2, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x071e3d,
      wireframe: true,
      transparent: true,
      opacity: 0.25
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    vortexGroup.add(coreMesh);

    // Dual Orbital Particle Rings (Airflow streams)
    const ringCount = 550;
    const ringGeo = new THREE.BufferGeometry();
    const ringPos = new Float32Array(ringCount * 3);
    const ringColors = new Float32Array(ringCount * 3);

    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 8;
      const radius = 1.4 + (i / ringCount) * 1.8;
      const height = (Math.sin(angle * 2) * 0.8) + (i / ringCount - 0.5) * 2;

      ringPos[i * 3] = Math.cos(angle) * radius;
      ringPos[i * 3 + 1] = height;
      ringPos[i * 3 + 2] = Math.sin(angle) * radius;

      // Color gradient from bright cyan to turquoise
      ringColors[i * 3] = 0.2 + (i / ringCount) * 0.1;
      ringColors[i * 3 + 1] = 0.75 + (i / ringCount) * 0.2;
      ringColors[i * 3 + 2] = 0.95;
    }

    ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
    ringGeo.setAttribute('color', new THREE.BufferAttribute(ringColors, 3));

    const ringMat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    const vortexParticles = new THREE.Points(ringGeo, ringMat);
    vortexGroup.add(vortexParticles);

    // Outer Atmospheric Volumetric Cloud Billboard
    const texLoader = new THREE.TextureLoader();
    const cloudTexture = texLoader.load('/textures/cloud1.jpg');
    const cloudMat = new THREE.MeshBasicMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const cloudMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), cloudMat);
    cloudMesh.position.set(0, 0, 0.2);
    vortexGroup.add(cloudMesh);

    // Hover Interaction
    let targetRotX = 0;
    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      targetRotX = y * 0.4;
    };
    container.addEventListener('mousemove', handleMouseMove);

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

      vortexGroup.rotation.y += 0.008;
      vortexGroup.rotation.x += (targetRotX - vortexGroup.rotation.x) * 0.05;
      vortexGroup.rotation.z = Math.sin(elapsed * 0.5) * 0.15;

      coreMesh.rotation.y -= 0.004;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
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
    <section id="what-is" className="section-wrapper cv-auto overflow-hidden">

      {/* Subtle background ambient glow */}
      <div
        className="bg-ambient-radial w-[500px] h-[500px] bg-sky-500/10 -left-48 top-1/4"
      />

      <div className="container-wide">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">

          {/* Text Content: Large Minimal Heading + Short Explanation */}
          <div className="lg:col-span-7 flex flex-col justify-center">

            {/* Label / Badge */}
            <div className="badge-telemetry w-fit mb-5">
              <span className="status-dot"></span>
              <span>Platform Genesis</span>
            </div>

            {/* Heading */}
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-5 leading-[1.15] font-display">
              Air. Data. <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-teal-300">Intelligence.</span>
            </h2>

            {/* Supporting Description */}
            <p className="text-base sm:text-lg text-slate-300 font-light leading-relaxed max-w-xl mb-14 sm:mb-16">
              Aero-Matrix connects environmental data, geospatial intelligence and AI to understand how urban pollution behaves.
            </p>

            {/* Three Information Cards with generous breathing room and separation */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-7 lg:gap-8 w-full max-w-xl lg:max-w-3xl">
              <div className="p-5 sm:p-5.5 rounded-xl bg-slate-900/70 border border-sky-500/20 backdrop-blur-xl hover:border-sky-400/40 transition-all flex flex-col justify-between min-h-[115px]">
                <Layers size={20} className="text-sky-400 mb-3" />
                <div>
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">Spatial Grid</div>
                  <div className="text-base sm:text-lg font-semibold text-white font-mono">10m Voxel</div>
                </div>
              </div>

              <div className="p-5 sm:p-5.5 rounded-xl bg-slate-900/70 border border-teal-500/20 backdrop-blur-xl hover:border-teal-400/40 transition-all flex flex-col justify-between min-h-[115px]">
                <Cpu size={20} className="text-teal-400 mb-3" />
                <div>
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">AI Physics</div>
                  <div className="text-base sm:text-lg font-semibold text-white font-mono">Real-time</div>
                </div>
              </div>

              <div className="p-5 sm:p-5.5 rounded-xl bg-slate-900/70 border border-cyan-500/20 backdrop-blur-xl hover:border-cyan-400/40 transition-all flex flex-col justify-between min-h-[115px]">
                <Compass size={20} className="text-cyan-400 mb-3" />
                <div>
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">Forecasting</div>
                  <div className="text-base sm:text-lg font-semibold text-white font-mono">72 Hours</div>
                </div>
              </div>
            </div>

          </div>

          {/* Visual Side: 3D Atmospheric Vortex Element */}
          <div className="lg:col-span-5 flex justify-center items-center relative mt-12 lg:mt-0">
            <div className="relative w-full max-w-[380px] sm:max-w-[420px] aspect-square flex items-center justify-center">

              {/* Outer decorative HUD rings */}
              <div className="absolute inset-0 rounded-full border border-sky-500/20 animate-spin" style={{ animationDuration: '40s' }} />
              <div className="absolute inset-4 rounded-full border border-dashed border-teal-500/20 animate-spin" style={{ animationDuration: '25s', animationDirection: 'reverse' }} />

              {/* WebGL 3D Canvas */}
              <div
                ref={canvasRef}
                className="w-full h-full cursor-grab active:cursor-grabbing"
                title="Interactive Atmospheric Vortex — Move cursor over to tilt"
              />

              {/* Floating micro-tag */}
              <div className="absolute bottom-2 px-3 py-1 rounded-full bg-slate-950/80 border border-sky-400/20 backdrop-blur-md text-[10px] font-mono text-sky-400 tracking-widest uppercase">
                Atmospheric Flow Vector
              </div>

            </div>
          </div>

        </div>
      </div>

    </section>
  );
}
