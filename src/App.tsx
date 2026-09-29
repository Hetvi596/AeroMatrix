import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Viewer,
  Terrain,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Ion,
  EllipsoidTerrainProvider,
  ArcGisMapServerImageryProvider,
  OpenStreetMapImageryProvider,
  ImageryLayer,
  createWorldImageryAsync,
  IonWorldImageryStyle,
  createOsmBuildingsAsync,
  Cesium3DTileset,
  Cesium3DTileStyle,
} from 'cesium';

// Ensure base URL is set for Cesium static workers & assets
if (typeof window !== 'undefined' && !(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL) {
  (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium/';
}

// Pune Geographic Reference Coordinates (Latitude: 18.5204, Longitude: 73.8567)
// High/medium altitude starting view covering the entire Pune metropolitan area
const PUNE_CENTER = {
  name: 'Pune Metro Overview',
  longitude: 73.8567,
  latitude: 18.5204,
  height: 24000, // 24 km altitude overview
  pitch: -52,
  heading: 0,
};

interface PunePreset {
  id: string;
  name: string;
  label: string;
  description: string;
  altitudeDesc: string;
  longitude: number;
  latitude: number;
  height: number;
  pitch: number;
  heading: number;
}

const PUNE_PRESETS: PunePreset[] = [
  {
    id: 'metro-overview',
    name: 'Pune Metro Overview',
    label: 'Overview',
    description: 'Whole Pune Urban Agglomeration (~25 km across)',
    altitudeDesc: '24 km Alt',
    longitude: 73.8567,
    latitude: 18.5204,
    height: 24000,
    pitch: -52,
    heading: 0,
  },
  {
    id: 'heritage-core',
    name: 'Heritage Core (Shaniwar Wada)',
    label: 'Old City / Core',
    description: 'Shaniwar Wada, Kasba Peth, Mutha Riverfront',
    altitudeDesc: '2.5 km Alt',
    longitude: 73.8553,
    latitude: 18.5196,
    height: 2500,
    pitch: -40,
    heading: 15,
  },
  {
    id: 'shivajinagar',
    name: 'Shivajinagar & University',
    label: 'Shivajinagar',
    description: 'FC Road, COEP, Agriculture College, SPPU',
    altitudeDesc: '2.8 km Alt',
    longitude: 73.8446,
    latitude: 18.5314,
    height: 2800,
    pitch: -40,
    heading: 45,
  },
  {
    id: 'kp-kalyani',
    name: 'Koregaon Park & Kalyani Nagar',
    label: 'Koregaon Park',
    description: 'Bund Garden, Mula-Mutha Confluence, Canopy',
    altitudeDesc: '3.0 km Alt',
    longitude: 73.8990,
    latitude: 18.5362,
    height: 3000,
    pitch: -38,
    heading: 315,
  },
  {
    id: 'hinjawadi',
    name: 'Hinjawadi IT Corridor',
    label: 'Hinjawadi',
    description: 'Rajiv Gandhi Infotech Park & Pune Ring Road',
    altitudeDesc: '3.8 km Alt',
    longitude: 73.7389,
    latitude: 18.5912,
    height: 3800,
    pitch: -40,
    heading: 60,
  },
  {
    id: 'magarpatta',
    name: 'Magarpatta City & Hadapsar',
    label: 'Magarpatta',
    description: 'Cybercity, SEZ, Eastern Industrial Zone',
    altitudeDesc: '3.2 km Alt',
    longitude: 73.9272,
    latitude: 18.5144,
    height: 3200,
    pitch: -40,
    heading: 335,
  },
  {
    id: 'pcmc',
    name: 'Pimpri-Chinchwad (PCMC)',
    label: 'PCMC Hub',
    description: 'Automotive hub, MIDC Bhosari, Nigdi corridor',
    altitudeDesc: '4.2 km Alt',
    longitude: 73.8009,
    latitude: 18.6279,
    height: 4200,
    pitch: -40,
    heading: 140,
  },
];

type MapModeType = 'satellite' | 'streets' | 'osm' | 'bing';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const roadLayerRef = useRef<ImageryLayer | null>(null);
  const placesLayerRef = useRef<ImageryLayer | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const idleTimerRef = useRef<number | null>(null);

  // FPS tracking refs
  const frameTimestampsRef = useRef<number[]>([]);
  const lastRenderTimeRef = useRef<number>(0);

  // Layer & 3D Engine State
  const [mapMode, setMapMode] = useState<MapModeType>('satellite');
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [terrainEnabled, setTerrainEnabled] = useState<boolean>(true); // Enabled by default for realistic 3D elevation
  const [terrainLoading, setTerrainLoading] = useState<boolean>(false);
  const [terrainNotice, setTerrainNotice] = useState<string | null>(null);

  const [buildingsEnabled, setBuildingsEnabled] = useState<boolean>(true); // 3D Buildings enabled with dynamic view-dependent LOD
  const [buildingsLoading, setBuildingsLoading] = useState<boolean>(false);
  const [buildingsStatus, setBuildingsStatus] = useState<string>('Active (Dynamic LOD)');

  const [viewMode, setViewMode] = useState<'3D' | '2D'>('3D');
  const [activePreset, setActivePreset] = useState<string>(PUNE_PRESETS[0].id);

  // Performance telemetry
  const [fpsDisplay, setFpsDisplay] = useState<string>('60 FPS');
  const [isIdle, setIsIdle] = useState<boolean>(false);
  const [customToken, setCustomToken] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('cesium_ion_token') || '' : ''
  );
  const [showTokenDrawer, setShowTokenDrawer] = useState<boolean>(false);
  const [cameraTelemetry, setCameraTelemetry] = useState({
    lat: '18.5204',
    lon: '73.8567',
    altitude: 24000,
    pitch: -52,
    heading: 0,
  });

  // Panel collapsible states
  const [isLayersCollapsed, setIsLayersCollapsed] = useState<boolean>(false);
  const [isSectorsCollapsed, setIsSectorsCollapsed] = useState<boolean>(false);
  const [isPerfCollapsed, setIsPerfCollapsed] = useState<boolean>(false);

  // Pune Sector dropdown state
  const [isSectorDropdownOpen, setIsSectorDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsSectorDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedPreset = PUNE_PRESETS.find((p) => p.id === activePreset) || PUNE_PRESETS[0];

  // Camera flight helper with focal ground positioning
  const flyToLocation = useCallback(
    (
      lon: number,
      lat: number,
      height: number,
      pitchDeg: number,
      headingDeg: number,
      presetId?: string
    ) => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      if (presetId) setActivePreset(presetId);

      const radPitch = CesiumMath.toRadians(pitchDeg);
      const radHeading = CesiumMath.toRadians(headingDeg);
      const cosPitch = Math.cos(Math.abs(radPitch));
      const sinPitch = Math.sin(Math.abs(radPitch));
      const range = height / Math.max(0.2, sinPitch);
      const groundDist = range * cosPitch;

      const offsetLat = (groundDist * Math.cos(radHeading)) / 111320;
      const offsetLon = (groundDist * Math.sin(radHeading)) / (111320 * Math.cos(CesiumMath.toRadians(lat)));

      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(lon - offsetLon, lat - offsetLat, height),
        orientation: {
          heading: radHeading,
          pitch: radPitch,
          roll: 0.0,
        },
        duration: 1.5,
      });
    },
    []
  );

  // Reset view to default Pune Overview
  const handleReturnToPune = useCallback(() => {
    const defaultPreset = PUNE_PRESETS[0];
    flyToLocation(
      defaultPreset.longitude,
      defaultPreset.latitude,
      defaultPreset.height,
      defaultPreset.pitch,
      defaultPreset.heading,
      defaultPreset.id
    );
  }, [flyToLocation]);

  // Smooth Zoom controls
  const handleZoom = (inwards: boolean) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const factor = inwards ? 0.6 : 1.6;
    const carto = viewer.camera.positionCartographic;
    if (!carto) return;
    const lonDeg = typeof carto.longitude === 'number' ? CesiumMath.toDegrees(carto.longitude) : 73.8567;
    const latDeg = typeof carto.latitude === 'number' ? CesiumMath.toDegrees(carto.latitude) : 18.5204;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        lonDeg,
        latDeg,
        Math.max(400, carto.height * factor)
      ),
      orientation: {
        heading: viewer.camera.heading,
        pitch: viewer.camera.pitch,
        roll: 0.0,
      },
      duration: 0.5,
    });
  };

  // Ground-anchored 3D perspective tilt (eliminates horizon smear & texture stretching)
  const handleToggleTilt = () => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const canvas = viewer.scene.canvas;
    const centerScreen = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);

    // Pick ground target at the center of the screen
    const ray = viewer.camera.getPickRay(centerScreen);
    let groundTarget: Cartesian3 | undefined;
    if (ray) {
      groundTarget = viewer.scene.globe.pick(ray, viewer.scene);
    }
    if (!groundTarget) {
      groundTarget = viewer.camera.pickEllipsoid(centerScreen, viewer.scene.globe.ellipsoid);
    }
    if (!groundTarget) {
      groundTarget = Cartesian3.fromDegrees(73.8567, 18.5204, 560);
    }

    const currentDist = Cartesian3.distance(viewer.camera.positionWC, groundTarget);
    const range = Math.max(1200, Math.min(currentDist, 35000));

    const currentPitchDeg = typeof viewer.camera.pitch === 'number' ? CesiumMath.toDegrees(viewer.camera.pitch) : -50;
    const heading = typeof viewer.camera.heading === 'number' ? viewer.camera.heading : 0;

    // Toggle between natural 3D oblique perspective (-40°) and top-down nadir (-86°)
    const targetPitchDeg = currentPitchDeg < -60 ? -40 : -86;
    const radPitch = CesiumMath.toRadians(targetPitchDeg);

    const cosPitch = Math.cos(Math.abs(radPitch));
    const sinPitch = Math.sin(Math.abs(radPitch));
    const groundDist = range * cosPitch;
    const camHeight = range * sinPitch;

    const targetCarto = Cartographic.fromCartesian(groundTarget);
    const targetLon = CesiumMath.toDegrees(targetCarto.longitude);
    const targetLat = CesiumMath.toDegrees(targetCarto.latitude);
    const baseHeight = targetCarto.height || 560;

    const offsetLat = (groundDist * Math.cos(heading)) / 111320;
    const offsetLon = (groundDist * Math.sin(heading)) / (111320 * Math.cos(targetCarto.latitude));

    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        targetLon - offsetLon,
        targetLat - offsetLat,
        Math.max(camHeight, baseHeight + 350)
      ),
      orientation: {
        heading: heading,
        pitch: radPitch,
        roll: 0.0,
      },
      duration: 1.2,
    });
  };

  // Reset camera heading to North (0 deg)
  const handleResetNorth = () => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const carto = viewer.camera.positionCartographic;
    if (!carto) return;
    const lonDeg = typeof carto.longitude === 'number' ? CesiumMath.toDegrees(carto.longitude) : 73.8567;
    const latDeg = typeof carto.latitude === 'number' ? CesiumMath.toDegrees(carto.latitude) : 18.5204;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(lonDeg, latDeg, carto.height),
      orientation: {
        heading: 0.0,
        pitch: viewer.camera.pitch,
        roll: 0.0,
      },
      duration: 0.8,
    });
  };

  // 2D / 3D Globe Mode switch
  const handleToggle2D3D = () => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    if (viewMode === '3D') {
      viewer.scene.morphTo2D(1.2);
      setViewMode('2D');
    } else {
      viewer.scene.morphTo3D(1.2);
      setViewMode('3D');
    }
  };

  // Basemap switcher
  const handleSelectBasemap = (mode: MapModeType) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    setMapMode(mode);
    viewer.imageryLayers.removeAll();
    roadLayerRef.current = null;
    placesLayerRef.current = null;

    if (mode === 'satellite') {
      // 1. Esri World Imagery (High-Resolution Satellite)
      const satLayer = ImageryLayer.fromProviderAsync(
        ArcGisMapServerImageryProvider.fromUrl(
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
          { enablePickFeatures: false }
        )
      );
      viewer.imageryLayers.add(satLayer);

      // 2. Esri World Transportation (Roads Overlay)
      const roadLayer = ImageryLayer.fromProviderAsync(
        ArcGisMapServerImageryProvider.fromUrl(
          'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer',
          { enablePickFeatures: false }
        )
      );
      roadLayer.show = showLabels;
      viewer.imageryLayers.add(roadLayer);
      roadLayerRef.current = roadLayer;

      // 3. Esri World Boundaries and Places (Labels Overlay)
      const placesLayer = ImageryLayer.fromProviderAsync(
        ArcGisMapServerImageryProvider.fromUrl(
          'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer',
          { enablePickFeatures: false }
        )
      );
      placesLayer.show = showLabels;
      viewer.imageryLayers.add(placesLayer);
      placesLayerRef.current = placesLayer;
    } else if (mode === 'streets') {
      const streetLayer = ImageryLayer.fromProviderAsync(
        ArcGisMapServerImageryProvider.fromUrl(
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer',
          { enablePickFeatures: false }
        )
      );
      viewer.imageryLayers.add(streetLayer);
    } else if (mode === 'osm') {
      const osmLayer = new ImageryLayer(
        new OpenStreetMapImageryProvider({
          url: 'https://tile.openstreetmap.org/',
        })
      );
      viewer.imageryLayers.add(osmLayer);
    } else if (mode === 'bing') {
      const bingLayer = ImageryLayer.fromProviderAsync(
        createWorldImageryAsync({
          style: IonWorldImageryStyle.AERIAL_WITH_LABELS,
        })
      );
      viewer.imageryLayers.add(bingLayer);
    }

    viewer.scene.requestRender();
  };

  // Toggle Roads & Labels overlay on satellite
  const handleToggleLabels = () => {
    const nextVal = !showLabels;
    setShowLabels(nextVal);
    if (roadLayerRef.current) {
      roadLayerRef.current.show = nextVal;
    }
    if (placesLayerRef.current) {
      placesLayerRef.current.show = nextVal;
    }
    viewerRef.current?.scene.requestRender();
  };

  // Toggle 3D Terrain ON/OFF
  const handleToggleTerrain = () => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const nextState = !terrainEnabled;
    setTerrainLoading(true);

    if (nextState) {
      try {
        const terrain = Terrain.fromWorldTerrain({
          requestVertexNormals: true, // Crucial for realistic slope lighting & depth
          requestWaterMask: false,
        });
        viewer.scene.setTerrain(terrain);
        viewer.scene.globe.depthTestAgainstTerrain = true;
        setTerrainEnabled(true);
        setTerrainNotice(null);
      } catch (err) {
        console.warn('World Terrain activation fallback:', err);
        try {
          viewer.scene.setTerrain(new Terrain(Promise.resolve(new EllipsoidTerrainProvider())));
        } catch {
          viewer.terrainProvider = new EllipsoidTerrainProvider();
        }
        viewer.scene.globe.depthTestAgainstTerrain = false;
        setTerrainEnabled(false);
        setTerrainNotice('Requires valid Cesium Ion token');
      }
    } else {
      try {
        viewer.scene.setTerrain(new Terrain(Promise.resolve(new EllipsoidTerrainProvider())));
      } catch {
        viewer.terrainProvider = new EllipsoidTerrainProvider();
      }
      viewer.scene.globe.depthTestAgainstTerrain = false;
      setTerrainEnabled(false);
      setTerrainNotice(null);
    }

    setTerrainLoading(false);
    viewer.scene.requestRender();
  };

  // Toggle 3D Buildings ON/OFF
  const handleToggleBuildings = () => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const nextState = !buildingsEnabled;
    setBuildingsEnabled(nextState);

    if (tilesetRef.current) {
      tilesetRef.current.show = nextState;
      setBuildingsStatus(nextState ? 'Active (Dynamic LOD)' : 'Disabled');
      viewer.scene.requestRender();
    } else if (nextState) {
      setBuildingsLoading(true);
      createOsmBuildingsAsync({
        enableShowOutline: false,
        showOutline: false,
      })
        .then((tileset) => {
          tilesetRef.current = tileset;
          tileset.show = true;
          tileset.maximumScreenSpaceError = 24;
          tileset.foveatedScreenSpaceError = true;
          tileset.foveatedConeSize = 0.3;
          tileset.cullRequestsWhileMoving = true;
          tileset.cullRequestsWhileMovingMultiplier = 60.0;
          // Safe, attribute-independent architectural styling to prevent missing-property runtime errors
          try {
            tileset.style = new Cesium3DTileStyle({
              color: 'color("#e2e8f0", 0.90)',
            });
          } catch (styleErr) {
            console.warn('Tileset style fallback:', styleErr);
          }

          viewer.scene.primitives.add(tileset);
          setBuildingsStatus('Active (Dynamic LOD)');
        })
        .catch((err) => {
          console.warn('3D Buildings fallback to satellite:', err);
          setBuildingsStatus('Fallback (Satellite 3D)');
        })
        .finally(() => {
          setBuildingsLoading(false);
          viewer.scene.requestRender();
        });
    }
  };

  // Save custom Cesium Ion token
  const handleApplyToken = () => {
    if (customToken.trim()) {
      Ion.defaultAccessToken = customToken.trim();
      localStorage.setItem('cesium_ion_token', customToken.trim());
      window.location.reload();
    }
  };

  // Primary Cesium lifecycle
  useEffect(() => {
    if (!containerRef.current) return;

    const savedToken = localStorage.getItem('cesium_ion_token');
    if (savedToken) {
      Ion.defaultAccessToken = savedToken;
    }

    // Initialize Cesium Viewer optimized for smooth 60 FPS 3D interaction
    const viewer = new Viewer(containerRef.current, {
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      geocoder: false,
      navigationHelpButton: false,
      homeButton: false,
      sceneModePicker: false,
      fullscreenButton: false,
      selectionIndicator: false,
      infoBox: false,
      shouldAnimate: false,
      requestRenderMode: true,
      maximumRenderTimeChange: 0.2,
      orderIndependentTranslucency: false,
      // Load Cesium World Terrain with vertex normals for accurate mountain slopes and elevation relief
      terrain: Terrain.fromWorldTerrain({
        requestVertexNormals: true,
        requestWaterMask: false,
      }),
      contextOptions: {
        webgl: {
          alpha: false,
          depth: true,
          stencil: false,
          antialias: true,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
        },
      },
    });

    viewerRef.current = viewer;

    // Cap resolution scale to prevent 4K GPU throttling while retaining sharp visual quality
    viewer.resolutionScale =
      typeof window !== 'undefined' && window.devicePixelRatio > 1
        ? Math.min(window.devicePixelRatio, 1.5)
        : 1.0;

    // Performance & 3D Terrain Configuration
    const globe = viewer.scene.globe;
    globe.tileCacheSize = 100;
    globe.maximumScreenSpaceError = 2.0;
    globe.preloadSiblings = false;
    globe.preloadAncestors = false;
    globe.loadingDescendantLimit = 2;
    globe.enableLighting = false; // Bypass dynamic sun raycasting
    globe.showGroundAtmosphere = true;
    globe.depthTestAgainstTerrain = true; // Crucial for 3D depth and preventing geometry clipping
    viewer.scene.verticalExaggeration = 1.0; // Accurate 1:1 elevation without artificial vertical smear
    globe.backFaceCulling = true;

    // Horizon fog & render limits
    viewer.scene.highDynamicRange = false;
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.00018;
    viewer.scene.fog.screenSpaceErrorFactor = 2.0;

    // Load 3D Buildings with aggressive LOD and foveated culling
    createOsmBuildingsAsync({
      enableShowOutline: false,
      showOutline: false,
    })
      .then((tileset) => {
        if (viewer.isDestroyed()) return;
        tilesetRef.current = tileset;
        tileset.show = true;
        tileset.maximumScreenSpaceError = 24; // High LOD threshold for smooth rendering
        tileset.foveatedScreenSpaceError = true;
        tileset.foveatedConeSize = 0.3;
        tileset.foveatedMinimumScreenSpaceErrorRelaxation = 0.0;
        tileset.cullRequestsWhileMoving = true;
        tileset.cullRequestsWhileMovingMultiplier = 60.0;
        tileset.progressiveResolutionHeightFraction = 0.5;

        // Safe, attribute-independent architectural styling to prevent missing-property runtime errors
        try {
          tileset.style = new Cesium3DTileStyle({
            color: 'color("#e2e8f0", 0.90)',
          });
        } catch (styleErr) {
          console.warn('Tileset style fallback:', styleErr);
        }

        viewer.scene.primitives.add(tileset);
        setBuildingsStatus('Active (Dynamic LOD)');
        viewer.scene.requestRender();
      })
      .catch((err) => {
        console.warn('3D Buildings initial load notice:', err);
        setBuildingsStatus('Fallback (Satellite 3D)');
      });

    // Dynamic LOD: Coarse geometry while moving for 60 FPS, sharp detail when idle
    const removeMoveStart = viewer.camera.moveStart.addEventListener(() => {
      if (viewer.isDestroyed()) return;
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (tilesetRef.current) {
        tilesetRef.current.maximumScreenSpaceError = 48;
      }
      globe.maximumScreenSpaceError = 3.5;
    });

    const removeMoveEnd = viewer.camera.moveEnd.addEventListener(() => {
      if (viewer.isDestroyed()) return;
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = window.setTimeout(() => {
        if (!viewer.isDestroyed()) {
          if (tilesetRef.current) {
            tilesetRef.current.maximumScreenSpaceError = 24;
          }
          globe.maximumScreenSpaceError = 1.8;
          viewer.scene.requestRender();
        }
      }, 200);
    });

    // Trigger render when incoming tiles arrive from network
    const removeTileLoaded = globe.tileLoadProgressEvent.addEventListener(() => {
      if (!viewer.isDestroyed()) {
        viewer.scene.requestRender();
      }
    });

    // Morph complete trigger
    const removeMorphComplete = viewer.scene.morphComplete.addEventListener(() => {
      if (!viewer.isDestroyed()) {
        viewer.scene.requestRender();
      }
    });

    // Load High-Quality Satellite Basemap with Road & Place Labels
    viewer.imageryLayers.removeAll();

    const satLayer = ImageryLayer.fromProviderAsync(
      ArcGisMapServerImageryProvider.fromUrl(
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
        { enablePickFeatures: false }
      )
    );
    viewer.imageryLayers.add(satLayer);

    const roadLayer = ImageryLayer.fromProviderAsync(
      ArcGisMapServerImageryProvider.fromUrl(
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer',
        { enablePickFeatures: false }
      )
    );
    roadLayer.show = true;
    viewer.imageryLayers.add(roadLayer);
    roadLayerRef.current = roadLayer;

    const placesLayer = ImageryLayer.fromProviderAsync(
      ArcGisMapServerImageryProvider.fromUrl(
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer',
        { enablePickFeatures: false }
      )
    );
    placesLayer.show = true;
    viewer.imageryLayers.add(placesLayer);
    placesLayerRef.current = placesLayer;

    // Initial Camera Position: Pune Metro Overview at 24 km altitude with -52° perspective tilt
    const initialCamLat = PUNE_CENTER.latitude - 0.16;
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(
        PUNE_CENTER.longitude,
        initialCamLat,
        PUNE_CENTER.height
      ),
      orientation: {
        heading: CesiumMath.toRadians(PUNE_CENTER.heading),
        pitch: CesiumMath.toRadians(PUNE_CENTER.pitch),
        roll: 0.0,
      },
    });

    // Throttled camera telemetry updates (~7 updates/sec) to eliminate React re-render lag
    let lastTelemetryUpdate = 0;
    const removeCameraChanged = viewer.camera.changed.addEventListener(() => {
      if (viewer.isDestroyed()) return;
      const now = performance.now();
      if (now - lastTelemetryUpdate < 140) return;
      lastTelemetryUpdate = now;

      const carto = viewer.camera.positionCartographic;
      if (carto) {
        const pitchVal =
          typeof viewer.camera.pitch === 'number' && !isNaN(viewer.camera.pitch)
            ? CesiumMath.toDegrees(viewer.camera.pitch)
            : -90;
        const headingVal =
          typeof viewer.camera.heading === 'number' && !isNaN(viewer.camera.heading)
            ? CesiumMath.toDegrees(viewer.camera.heading)
            : 0;
        const latVal =
          typeof carto.latitude === 'number' && !isNaN(carto.latitude)
            ? CesiumMath.toDegrees(carto.latitude).toFixed(4)
            : '18.5204';
        const lonVal =
          typeof carto.longitude === 'number' && !isNaN(carto.longitude)
            ? CesiumMath.toDegrees(carto.longitude).toFixed(4)
            : '73.8567';
        const altVal =
          typeof carto.height === 'number' && !isNaN(carto.height) ? Math.round(carto.height) : 24000;

        setCameraTelemetry({
          lat: latVal,
          lon: lonVal,
          altitude: altVal,
          pitch: Math.round(pitchVal),
          heading: Math.round(headingVal),
        });
      }
    });

    // Real-time FPS calculation via postRender
    const removePostRender = viewer.scene.postRender.addEventListener(() => {
      const now = performance.now();
      lastRenderTimeRef.current = now;
      const timestamps = frameTimestampsRef.current;
      timestamps.push(now);

      while (timestamps.length > 0 && timestamps[0] < now - 1000) {
        timestamps.shift();
      }

      if (timestamps.length > 2) {
        const fps = Math.min(60, timestamps.length);
        setFpsDisplay(`${fps} FPS`);
        setIsIdle(false);
      }
    });

    // Idle GPU-saving monitor
    const idleCheckInterval = setInterval(() => {
      const now = performance.now();
      if (now - lastRenderTimeRef.current > 450) {
        setIsIdle(true);
        setFpsDisplay('60 FPS (Idle / GPU Saving)');
      }
    }, 500);

    // Window resize handler
    const handleResize = () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.resize();
        viewerRef.current.scene.requestRender();
      }
    };
    window.addEventListener('resize', handleResize);

    // Initial render
    viewer.scene.requestRender();

    return () => {
      window.removeEventListener('resize', handleResize);
      clearInterval(idleCheckInterval);
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
      removeMoveStart();
      removeMoveEnd();
      removeTileLoaded();
      removeMorphComplete();
      removeCameraChanged();
      removePostRender();
      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
    };
  }, []);

  return (
    <div className="app-container">
      {/* Cesium Viewer Container */}
      <div id="cesiumContainer" ref={containerRef} className="cesium-viewer-container" />

      {/* Floating UI Overlay */}
      <div className="ui-overlay">
        {/* Top Header & Quick Action Bar */}
        <header className="top-nav-bar">
          <div className="brand-badge glass-panel ui-interactive">
            <div className="brand-icon">🛰️</div>
            <div className="brand-text">
              <div className="brand-title">
                <h1>Pune Geospatial Base</h1>
                <span className="brand-version">v2.0 3D Ready</span>
              </div>
            </div>
          </div>

          {/* Quick Action Navigation Bar - UNCHANGED */}
          <nav className="action-bar glass-panel ui-interactive" aria-label="Camera Controls">
            <button
              id="btn-return-pune"
              onClick={handleReturnToPune}
              className="btn-primary"
              title="Fly to Pune Metro Overview (24 km altitude)"
            >
              📍 Pune Overview
            </button>

            <button
              id="btn-toggle-tilt"
              onClick={handleToggleTilt}
              className="btn-secondary"
              title="Cycle between Oblique 3D perspective and Top-Down nadir view"
            >
              📐 3D Tilt
            </button>

            <button
              id="btn-toggle-2d3d"
              onClick={handleToggle2D3D}
              className={`btn-secondary ${viewMode === '2D' ? 'active' : ''}`}
              title="Switch between 3D Globe and 2D Plane projection"
            >
              🌐 {viewMode === '3D' ? '3D Globe' : '2D Map'}
            </button>

            <button
              id="btn-reset-north"
              onClick={handleResetNorth}
              className="btn-secondary"
              title="Reset camera heading to True North"
            >
              🧭 North
            </button>

            <div className="zoom-group">
              <button
                id="btn-zoom-in"
                onClick={() => handleZoom(true)}
                className="btn-icon"
                title="Zoom In"
              >
                ➕
              </button>
              <button
                id="btn-zoom-out"
                onClick={() => handleZoom(false)}
                className="btn-icon"
                title="Zoom Out"
              >
                ➖
              </button>
            </div>
          </nav>
        </header>

        {/* Left Side: Map Layer Controls & Quick Sector Jump */}
        <aside className="left-panel-stack">
          {/* Map Layer Controls Panel (Collapsible) */}
          <section className="glass-panel layer-control-card ui-interactive">
            <div className="panel-title-row">
              <div className="title-with-badge">
                <span className="section-title">🗺️ Map Layers</span>
                <span className="badge-fast">Fast Render</span>
              </div>
              <button
                onClick={() => setIsLayersCollapsed(!isLayersCollapsed)}
                className="collapse-btn"
                aria-label={isLayersCollapsed ? 'Expand Map Layers' : 'Collapse Map Layers'}
                title={isLayersCollapsed ? 'Expand Map Layers' : 'Collapse Map Layers'}
              >
                <svg
                  className={`chevron-icon ${isLayersCollapsed ? 'collapsed' : 'expanded'}`}
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                >
                  <path
                    d="M2.5 4.5L6 8L9.5 4.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            {!isLayersCollapsed && (
              <div className="panel-collapsible-body">
                {/* Basemap Selection */}
                <div className="control-group">
                  <label className="control-label">Basemap Style:</label>
                  <div className="segmented-grid">
                    <button
                      onClick={() => handleSelectBasemap('satellite')}
                      className={`segment-btn ${mapMode === 'satellite' ? 'active' : ''}`}
                      title="High-resolution Maxar/Esri Satellite Imagery"
                    >
                      <span className="segment-icon">🛰️</span>
                      <span>Satellite</span>
                    </button>

                    <button
                      onClick={() => handleSelectBasemap('streets')}
                      className={`segment-btn ${mapMode === 'streets' ? 'active' : ''}`}
                      title="Esri World Street Map with clear road networks"
                    >
                      <span className="segment-icon">🗺️</span>
                      <span>Streets</span>
                    </button>

                    <button
                      onClick={() => handleSelectBasemap('osm')}
                      className={`segment-btn ${mapMode === 'osm' ? 'active' : ''}`}
                      title="OpenStreetMap Standard Vector"
                    >
                      <span className="segment-icon">🌐</span>
                      <span>OSM</span>
                    </button>

                    <button
                      onClick={() => handleSelectBasemap('bing')}
                      className={`segment-btn ${mapMode === 'bing' ? 'active' : ''}`}
                      title="Cesium World Imagery (Bing Aerial)"
                    >
                      <span className="segment-icon">✈️</span>
                      <span>Bing</span>
                    </button>
                  </div>
                </div>

                {/* Roads & Labels Overlay Switch (applicable on Satellite) */}
                {mapMode === 'satellite' && (
                  <div className="toggle-row">
                    <div className="toggle-info">
                      <span className="toggle-label">🛣️ Roads & Place Names</span>
                      <span className="toggle-sub">Highways, streets, and sector labels</span>
                    </div>
                    <button
                      onClick={handleToggleLabels}
                      className={`switch-toggle ${showLabels ? 'on' : 'off'}`}
                      aria-pressed={showLabels}
                      title="Toggle Roads and Landmark Labels"
                    >
                      <span className="switch-thumb" />
                    </button>
                  </div>
                )}

                {/* 3D Terrain Switch */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <span className="toggle-label">⛰️ 3D Terrain Elevation</span>
                    <span className="toggle-sub">
                      {terrainEnabled ? 'Cesium World Terrain (Active 3D)' : 'Flat Ellipsoid (Disabled)'}
                    </span>
                  </div>
                  <button
                    onClick={handleToggleTerrain}
                    disabled={terrainLoading}
                    className={`switch-toggle ${terrainEnabled ? 'on' : 'off'}`}
                    aria-pressed={terrainEnabled}
                    title="Toggle 3D Terrain elevation (realistic mountain slopes & valleys)"
                  >
                    <span className="switch-thumb" />
                  </button>
                </div>

                {/* 3D Buildings Switch */}
                <div className="toggle-row">
                  <div className="toggle-info">
                    <span className="toggle-label">🏢 3D Buildings</span>
                    <span className="toggle-sub">
                      {buildingsEnabled ? 'OSM Buildings (Dynamic LOD)' : 'Disabled (0 Draw Calls)'}
                    </span>
                  </div>
                  <button
                    onClick={handleToggleBuildings}
                    disabled={buildingsLoading}
                    className={`switch-toggle ${buildingsEnabled ? 'on' : 'off'}`}
                    aria-pressed={buildingsEnabled}
                    title="Toggle 3D Buildings dataset (optimized with view-dependent LOD)"
                  >
                    <span className="switch-thumb" />
                  </button>
                </div>

                {terrainNotice && (
                  <div className="notice-banner">
                    ⚠️ {terrainNotice}
                  </div>
                )}

                {/* 3D Engine Status Pill */}
                <div className="buildings-status-card">
                  <div className="buildings-status-header">
                    <span className={`badge-dot ${buildingsEnabled ? 'active' : 'disabled'}`} />
                    <span className="bld-label">3D Engine Status:</span>
                    <span className="bld-val">{buildingsStatus}</span>
                  </div>
                  <p className="bld-subtext">
                    Dynamic Screen-Space Error LOD active: High detail near camera, coarse while in motion.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Pune Sector Fast-Travel Dropdown (Collapsible & No Internal Scroll) */}
          <section className="glass-panel sectors-card ui-interactive" ref={dropdownRef}>
            <div className="panel-title-row">
              <div className="title-with-badge">
                <span className="section-title">📍 Pune Sectors</span>
                <span className="badge-sub">{PUNE_PRESETS.length} Locations</span>
              </div>
              <button
                onClick={() => setIsSectorsCollapsed(!isSectorsCollapsed)}
                className="collapse-btn"
                aria-label={isSectorsCollapsed ? 'Expand Pune Sectors' : 'Collapse Pune Sectors'}
                title={isSectorsCollapsed ? 'Expand Pune Sectors' : 'Collapse Pune Sectors'}
              >
                <svg
                  className={`chevron-icon ${isSectorsCollapsed ? 'collapsed' : 'expanded'}`}
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                >
                  <path
                    d="M2.5 4.5L6 8L9.5 4.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            {!isSectorsCollapsed && (
              <div className="panel-collapsible-body">
                <div className="sector-dropdown-wrapper">
                  <button
                    onClick={() => setIsSectorDropdownOpen(!isSectorDropdownOpen)}
                    className={`sector-dropdown-trigger ${isSectorDropdownOpen ? 'active' : ''}`}
                    aria-haspopup="listbox"
                    aria-expanded={isSectorDropdownOpen}
                  >
                    <div className="dropdown-selected-info">
                      <span className="dropdown-selected-name">{selectedPreset.name}</span>
                      <span className="dropdown-selected-desc">{selectedPreset.description}</span>
                    </div>
                    <div className="dropdown-trigger-right">
                      <span className="sector-alt-pill">{selectedPreset.altitudeDesc}</span>
                      <span className={`dropdown-arrow ${isSectorDropdownOpen ? 'open' : ''}`}>▼</span>
                    </div>
                  </button>

                  {isSectorDropdownOpen && (
                    <div className="sector-dropdown-menu" role="listbox">
                      {PUNE_PRESETS.map((preset) => {
                        const isSelected = activePreset === preset.id;
                        return (
                          <div
                            key={preset.id}
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              flyToLocation(
                                preset.longitude,
                                preset.latitude,
                                preset.height,
                                preset.pitch,
                                preset.heading,
                                preset.id
                              );
                              setIsSectorDropdownOpen(false);
                            }}
                            className={`sector-dropdown-item ${isSelected ? 'selected' : ''}`}
                          >
                            <div className="item-text">
                              <span className="item-name">{preset.name}</span>
                              <span className="item-desc">{preset.description}</span>
                            </div>
                            <span className="sector-alt-pill">{preset.altitudeDesc}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </aside>

        {/* Bottom Area: Controls Hint, Performance Monitor & Telemetry */}
        <footer className="bottom-dock">
          {/* Controls Hint Card */}
          <div className="glass-panel nav-hint ui-interactive">
            <div className="hint-pill">
              <span className="key-tag">Left Click + Drag</span>
              <span className="hint-desc">Pan & Rotate</span>
            </div>
            <div className="hint-divider" />
            <div className="hint-pill">
              <span className="key-tag">Scroll / Right Click</span>
              <span className="hint-desc">Zoom</span>
            </div>
            <div className="hint-divider" />
            <div className="hint-pill">
              <span className="key-tag">Ctrl + Drag</span>
              <span className="hint-desc">3D Tilt & Pitch</span>
            </div>
          </div>

          {/* Performance & Status Dashboard (Collapsible & Positioned with Bottom Clearance) */}
          <div className="glass-panel perf-dashboard ui-interactive">
            <div className="perf-header">
              <div className="perf-title-row">
                <span className="perf-icon">⚡</span>
                <span className="perf-title">Performance Monitor</span>
              </div>
              <div className="perf-header-right">
                <span className={`fps-badge ${isIdle ? 'fps-idle' : 'fps-active'}`}>
                  <span className="fps-dot" />
                  {fpsDisplay}
                </span>
                <button
                  onClick={() => setIsPerfCollapsed(!isPerfCollapsed)}
                  className="collapse-btn"
                  aria-label={isPerfCollapsed ? 'Expand Performance Monitor' : 'Collapse Performance Monitor'}
                  title={isPerfCollapsed ? 'Expand Performance Monitor' : 'Collapse Performance Monitor'}
                >
                  <svg
                    className={`chevron-icon ${isPerfCollapsed ? 'collapsed' : 'expanded'}`}
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path
                      d="M2.5 4.5L6 8L9.5 4.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {!isPerfCollapsed && (
              <div className="panel-collapsible-body">
                <div className="telemetry-grid">
                  <div className="telemetry-cell">
                    <span className="cell-label">Location</span>
                    <span className="cell-val">Pune, Maharashtra</span>
                  </div>
                  <div className="telemetry-cell">
                    <span className="cell-label">Coordinates</span>
                    <span className="cell-val mono">
                      {cameraTelemetry.lat}° N, {cameraTelemetry.lon}° E
                    </span>
                  </div>
                  <div className="telemetry-cell">
                    <span className="cell-label">Altitude</span>
                    <span className="cell-val mono">
                      {cameraTelemetry.altitude >= 1000
                        ? `${(cameraTelemetry.altitude / 1000).toFixed(1)} km`
                        : `${cameraTelemetry.altitude} m`}
                    </span>
                  </div>
                  <div className="telemetry-cell">
                    <span className="cell-label">Camera Tilt</span>
                    <span className="cell-val mono">{cameraTelemetry.pitch}°</span>
                  </div>
                  <div className="telemetry-cell">
                    <span className="cell-label">3D Buildings</span>
                    <span className="cell-val highlight">
                      {buildingsEnabled ? 'Active (Dynamic LOD)' : 'Disabled'}
                    </span>
                  </div>
                  <div className="telemetry-cell">
                    <span className="cell-label">Terrain Mode</span>
                    <span className="cell-val highlight">
                      {terrainEnabled ? 'World Terrain (3D)' : 'Ellipsoid (Flat)'}
                    </span>
                  </div>
                </div>

                {/* Cesium Ion Token Drawer Toggle */}
                <div className="token-toggle-row">
                  <button
                    onClick={() => setShowTokenDrawer(!showTokenDrawer)}
                    className="btn-token-toggle"
                  >
                    ⚙️ {showTokenDrawer ? 'Hide Ion Token Settings' : 'Configure Cesium Ion Token'}
                  </button>

                  {showTokenDrawer && (
                    <div className="token-input-box">
                      <input
                        type="password"
                        placeholder="Enter custom Cesium Ion access token"
                        value={customToken}
                        onChange={(e) => setCustomToken(e.target.value)}
                        className="token-input"
                      />
                      <button onClick={handleApplyToken} className="btn-secondary token-apply-btn">
                        Apply Token
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
