// TwinMap — owns the Cesium Viewer lifecycle and every Cesium-specific layer.
// React never touches Cesium objects directly; it calls these methods (via
// mapSync.ts) so the viewer is created exactly once.

import {
  BoundingSphere,
  BoxGeometry,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Cesium3DTileStyle,
  Cesium3DTileset,
  Color,
  ColorGeometryInstanceAttribute,
  ClassificationType,
  ColorMaterialProperty,
  ConstantProperty,
  Credit,
  CustomDataSource,
  DistanceDisplayCondition,
  EllipsoidTerrainProvider,
  Entity,
  GeometryInstance,
  HeadingPitchRange,
  HeightReference,
  ImageryLayer,
  Ion,
  JulianDate,
  ShadowMode,
  LabelStyle,
  Material,
  Math as CMath,
  Matrix3,
  Matrix4,
  PerInstanceColorAppearance,
  PolygonHierarchy,
  PolylineDashMaterialProperty,
  Primitive,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  SingleTileImageryProvider,
  Transforms,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
  createOsmBuildingsAsync,
  createWorldTerrainAsync,
  sampleTerrainMostDetailed,
  type TerrainProvider,
} from 'cesium';
import type {
  BaseState,
  CandidateLocation,
  CellState,
  DisplayMode,
  GridCell,
  Industry,
  LayerId,
  LonLat,
  Pollutant,
  ScenarioResult,
  StationSummary,
} from '../types';
import { POLLUTANT_RANGE, deltaColor, pollutionColor, type RGB } from '../utils/colors';
import { bboxRing, shrinkBBox } from '../utils/geo';
import { dataProvider } from '../services/dataProvider';
import { roadTrafficLevel, trafficLevelLabel } from '../services/traffic';
import { createTerrariumTerrainProvider, sampleElevations } from './terrain';
import { elevationRampCanvas, renderFieldCanvas } from './layers/heatmapCanvas';
import { BuildingTileManager } from './buildingTiles';

export interface MapClick {
  entityId?: string;
  lonlat?: LonLat;
}

export interface MapCallbacks {
  onClick(e: MapClick): void;
  onHover(lonlat: LonLat | null, height: number | null): void;
  onStatus(s: { viewer?: 'loading' | 'ready' | 'error'; terrain?: string; imagery?: string; buildings?: string; error?: string }): void;
}

export interface CellRenderInput {
  base: BaseState;
  states: CellState[];
  pollutant: Pollutant;
  mode: DisplayMode;
  result: ScenarioResult | null;
  closedRoads: string[];
  /** Per-cell values (cell order) replacing the modeled field, e.g. OBSERVED IDW. */
  overrideValues?: number[] | null;
}

export type IndustryDisplayState = 'active' | 'removed' | 'added' | 'pending';

const ION_TOKEN = (import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined)?.trim();

const ESRI = (svc: string) => `https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`;

const CATEGORY_COLOR: Record<string, string> = {
  Manufacturing: '#60a5fa',
  Chemical: '#c084fc',
  Power: '#f87171',
  Metal: '#fbbf24',
  Processing: '#34d399',
};

function rgb(c: RGB, a = 1) {
  return new Color(c[0] / 255, c[1] / 255, c[2] / 255, a);
}

function ringPositions(ring: LonLat[], h?: number): Cartesian3[] {
  return ring.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat, h ?? 0));
}

export class TwinMap {
  viewer: Viewer | null = null;
  private handler: ScreenSpaceEventHandler | null = null;
  private cb: MapCallbacks;
  private container: HTMLElement;
  private destroyed = false;

  // Imagery
  private satLayer: ImageryLayer | null = null;
  private darkLayer: ImageryLayer | null = null;
  private roadsLayer: ImageryLayer | null = null;
  private labelsLayer: ImageryLayer | null = null;
  private heatLayer: ImageryLayer | null = null;
  private heatVersion = 0;

  // Terrain
  private demProvider: TerrainProvider | null = null;
  private usingIon = false;
  private terrainOn = true;
  private exaggeration = 1.5;
  private cellElev = new Map<string, number>();
  private industryElev = new Map<string, number>();

  // Buildings
  private buildingPrimitive: Primitive | null = null;
  private osmTileset: Cesium3DTileset | null = null;
  private buildingsVisible = true;
  private buildingTiles: BuildingTileManager | null = null;
  private shadowsOn = false;
  private buildingSpecs: { position: LonLat; width: number; depth: number; height: number; rotation: number }[] = [];
  private buildingElev: number[] = [];

  // Entity layers
  private ds: Record<string, CustomDataSource> = {};
  private columnEntities = new Map<string, Entity>();
  private roadEntities = new Map<string, { entities: Entity[]; style: string }>();
  private osmCredit: Credit | null = null;
  private base: BaseState | null = null;
  private lastCells: CellRenderInput | null = null;
  private lastIndustries: { list: { industry: Industry; state: IndustryDisplayState }[]; selectedId: string | null } | null = null;
  private layers: Record<LayerId, boolean> | null = null;
  private kickTimer: number | null = null;
  private hoverPending = false;

  constructor(container: HTMLElement, cb: MapCallbacks) {
    this.container = container;
    this.cb = cb;
  }

  // ------------------------------------------------------------------ init
  async init(): Promise<void> {
    this.cb.onStatus({ viewer: 'loading' });
    try {
      if (ION_TOKEN) Ion.defaultAccessToken = ION_TOKEN;
      this.viewer = new Viewer(this.container, {
        baseLayer: false,
        terrainProvider: new EllipsoidTerrainProvider(),
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
        msaaSamples: 4,
        // Render at the device's real pixel density (sharp on high-DPI laptop screens).
        useBrowserRecommendedResolution: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.cb.onStatus({ viewer: 'error', error: `3D viewer failed to initialise (WebGL required): ${msg}` });
      return;
    }

    const v = this.viewer;
    const scene = v.scene;
    scene.globe.baseColor = Color.fromCssColorString('#0b1220');
    scene.backgroundColor = Color.fromCssColorString('#05080f');
    scene.globe.depthTestAgainstTerrain = true;
    scene.globe.showGroundAtmosphere = true;
    scene.fog.enabled = true;
    scene.fog.density = 6e-5;
    // MSAA handles anti-aliasing; FXAA would soften imagery and building edges.
    scene.postProcessStages.fxaa.enabled = false;
    // Finer terrain / imagery level-of-detail (default 2) → noticeably crisper satellite tiles.
    scene.globe.maximumScreenSpaceError = 1.5;
    scene.globe.tileCacheSize = 250;
    scene.verticalExaggeration = this.exaggeration;
    // Fixed mid-morning sun (10:30 IST) so 3D buildings get consistent, readable shading.
    v.clock.currentTime = JulianDate.fromIso8601('2026-03-15T05:00:00Z');
    v.clock.shouldAnimate = false;
    v.shadowMap.softShadows = true;
    v.shadowMap.size = 2048;
    v.shadowMap.darkness = 0.45;
    v.terrainShadows = ShadowMode.RECEIVE_ONLY;
    v.shadows = false;
    scene.screenSpaceCameraController.minimumZoomDistance = 60;
    scene.screenSpaceCameraController.maximumZoomDistance = 2_500_000;
    (v.cesiumWidget.creditContainer as HTMLElement).classList.add('twin-credits');

    this.setupImagery();
    for (const name of ['heatGrid', 'industrialAreas', 'green', 'columns', 'grid', 'traffic', 'industries', 'stations', 'area', 'affected', 'selection', 'markers']) {
      const d = new CustomDataSource(name);
      this.ds[name] = d;
      await v.dataSources.add(d);
    }

    this.setupInput();
    this.setInitialView(true);
    this.cb.onStatus({ viewer: 'ready' });

    // Terrain + buildings load in the background; the map is usable immediately.
    void this.setupTerrain().then(() => {
      if (this.usingIon) {
        this.industryElev.clear();
        this.sampleCellHeights();
      }
      return this.setupBuildings();
    });
  }

  private sampleCellHeights() {
    const base = this.base;
    if (!base) return;
    this.heightsFor(base.cells.map((c) => c.center)).then((hs) => {
      if (this.base !== base) return;
      base.cells.forEach((c, i) => this.cellElev.set(c.id, hs[i]));
      this.refreshHeights();
    });
  }

  private setupImagery() {
    const v = this.viewer!;
    const layers = v.imageryLayers;
    try {
      const dark = new UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        maximumLevel: 19,
        credit: '© OpenStreetMap contributors © CARTO',
      });
      this.darkLayer = layers.addImageryProvider(dark);

      const sat = new UrlTemplateImageryProvider({
        url: ESRI('World_Imagery'),
        maximumLevel: 19,
        credit: 'Imagery © Esri, Maxar, Earthstar Geographics',
      });
      this.satLayer = layers.addImageryProvider(sat);
      this.satLayer.brightness = 0.95;
      this.satLayer.saturation = 1.0;
      this.satLayer.contrast = 1.05;
      let satErrors = 0;
      sat.errorEvent.addEventListener(() => {
        satErrors++;
        if (satErrors === 25) this.cb.onStatus({ imagery: 'Satellite tiles failing — dark basemap fallback visible' });
      });

      this.roadsLayer = layers.addImageryProvider(
        new UrlTemplateImageryProvider({ url: ESRI('Reference/World_Transportation'), maximumLevel: 19, credit: 'Roads © Esri, OpenStreetMap contributors' }),
      );
      this.roadsLayer.alpha = 0.85;
      this.labelsLayer = layers.addImageryProvider(
        new UrlTemplateImageryProvider({ url: ESRI('Reference/World_Boundaries_and_Places'), maximumLevel: 19, credit: 'Labels & boundaries © Esri' }),
      );
      this.cb.onStatus({ imagery: 'Esri World Imagery + OSM/CARTO dark basemap' });
    } catch (e) {
      this.cb.onStatus({ imagery: `Imagery unavailable (${e instanceof Error ? e.message : e}) — plain globe` });
    }
  }

  private orderImagery() {
    const layers = this.viewer?.imageryLayers;
    if (!layers) return;
    if (this.darkLayer) layers.lowerToBottom(this.darkLayer);
    if (this.heatLayer) layers.raiseToTop(this.heatLayer);
    if (this.roadsLayer) layers.raiseToTop(this.roadsLayer);
    if (this.labelsLayer) layers.raiseToTop(this.labelsLayer);
  }

  private async setupTerrain() {
    try {
      if (ION_TOKEN) {
        this.demProvider = await createWorldTerrainAsync();
        this.usingIon = true;
        this.cb.onStatus({ terrain: 'Cesium World Terrain (ion)' });
      } else {
        this.demProvider = createTerrariumTerrainProvider();
        this.cb.onStatus({ terrain: 'Open DEM — AWS Terrarium (SRTM-derived)' });
      }
    } catch (e) {
      this.demProvider = createTerrariumTerrainProvider();
      this.usingIon = false;
      this.cb.onStatus({ terrain: 'Ion terrain failed — open DEM fallback' });
    }
    if (this.destroyed || !this.viewer) return;
    this.applyTerrain();
  }

  private applyTerrain() {
    const v = this.viewer;
    if (!v) return;
    v.terrainProvider = this.terrainOn && this.demProvider ? this.demProvider : new EllipsoidTerrainProvider();
    v.scene.verticalExaggeration = this.terrainOn ? this.exaggeration : 1;
    this.buildingTiles?.reset(); // building bases depend on terrain height
    this.refreshHeights();
  }

  private async setupBuildings() {
    const v = this.viewer;
    if (!v) return;
    if (ION_TOKEN) {
      try {
        const ts = await createOsmBuildingsAsync();
        ts.style = new Cesium3DTileStyle({ color: "color('#c7d2e0', 0.95)" });
        if (this.destroyed) return;
        v.scene.primitives.add(ts);
        ts.show = this.buildingsVisible;
        this.osmTileset = ts;
        this.cb.onStatus({ buildings: 'Cesium OSM Buildings (ion)' });
        return;
      } catch {
        /* fall through to OpenFreeMap buildings */
      }
    }
    // Real OSM building footprints + heights, streamed around the camera.
    const mgr = new BuildingTileManager(
      v,
      (pts) => this.heightsFor(pts),
      () => this.hScale(),
      () => this.kick(600),
    );
    mgr.setVisible(this.buildingsVisible);
    mgr.setShadows(this.shadowsOn);
    this.buildingTiles = mgr;
    this.cb.onStatus({ buildings: 'OSM 3D buildings — zoom in to load (OpenFreeMap)' });
    let fellBack = false;
    mgr.onStats = ({ tiles, buildings, failed }) => {
      if (failed && !fellBack) {
        fellBack = true;
        void this.useProceduralBuildings();
        return;
      }
      this.cb.onStatus({
        buildings: tiles
          ? `OSM 3D buildings: ${buildings.toLocaleString()} in ${tiles} tile(s) (OpenFreeMap)`
          : 'OSM 3D buildings — zoom in to load (OpenFreeMap)',
      });
    };
  }

  /** Fallback when the building tile service is unreachable. */
  private async useProceduralBuildings() {
    this.buildingTiles?.destroy();
    this.buildingTiles = null;
    this.buildingSpecs = await dataProvider.getBuildings();
    this.buildingElev = await this.heightsFor(this.buildingSpecs.map((b) => b.position));
    this.buildProceduralBuildings();
    this.cb.onStatus({ buildings: `Building tiles unreachable — procedural demo massing (${this.buildingSpecs.length.toLocaleString()} blocks)` });
  }

  private buildProceduralBuildings() {
    const v = this.viewer;
    if (!v || this.destroyed) return;
    if (this.buildingPrimitive) {
      v.scene.primitives.remove(this.buildingPrimitive);
      this.buildingPrimitive = null;
    }
    if (!this.buildingSpecs.length) return;
    const scale = this.hScale();
    const instances = this.buildingSpecs.map((b, i) => {
      const ground = (this.buildingElev[i] ?? 0) * scale;
      const center = Cartesian3.fromDegrees(b.position[0], b.position[1], ground + b.height / 2 - 2);
      const enu = Transforms.eastNorthUpToFixedFrame(center);
      const model = Matrix4.multiply(enu, Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(b.rotation)), new Matrix4());
      const t = Math.min(1, b.height / 90);
      const color = new Color(0.62 + 0.3 * t, 0.68 + 0.26 * t, 0.76 + 0.2 * t, 1);
      return new GeometryInstance({
        geometry: BoxGeometry.fromDimensions({
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          dimensions: new Cartesian3(b.width, b.depth, b.height + 4),
        }),
        modelMatrix: model,
        id: `bld:${i}`,
        attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
      });
    });
    this.buildingPrimitive = v.scene.primitives.add(
      new Primitive({
        geometryInstances: instances,
        appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }),
        asynchronous: true,
      }),
    );
    this.buildingPrimitive!.show = this.buildingsVisible;
    this.kick();
  }

  private setupInput() {
    const v = this.viewer!;
    this.handler = new ScreenSpaceEventHandler(v.scene.canvas);
    this.handler.setInputAction((ev: { position: Cartesian2 }) => {
      const picked = v.scene.pick(ev.position);
      let entityId: string | undefined;
      if (picked && picked.id instanceof Entity) entityId = picked.id.id;
      this.cb.onClick({ entityId, lonlat: this.pickLonLat(ev.position) ?? undefined });
    }, ScreenSpaceEventType.LEFT_CLICK);

    this.handler.setInputAction((ev: { endPosition: Cartesian2 }) => {
      if (this.hoverPending) return;
      this.hoverPending = true;
      const pos = Cartesian2.clone(ev.endPosition);
      window.setTimeout(() => {
        this.hoverPending = false;
        if (!this.viewer) return;
        const ray = this.viewer.camera.getPickRay(pos);
        const c = ray ? this.viewer.scene.globe.pick(ray, this.viewer.scene) : undefined;
        if (!c) return this.cb.onHover(null, null);
        const carto = Cartographic.fromCartesian(c);
        const exag = this.terrainOn ? this.exaggeration : 1;
        this.cb.onHover([CMath.toDegrees(carto.longitude), CMath.toDegrees(carto.latitude)], carto.height / exag);
      }, 120);
    }, ScreenSpaceEventType.MOUSE_MOVE);
  }

  private pickLonLat(pos: Cartesian2): LonLat | null {
    const v = this.viewer!;
    const ray = v.camera.getPickRay(pos);
    const c = ray ? v.scene.globe.pick(ray, v.scene) : undefined;
    const cart = c ?? v.camera.pickEllipsoid(pos);
    if (!cart) return null;
    const carto = Cartographic.fromCartesian(cart);
    return [CMath.toDegrees(carto.longitude), CMath.toDegrees(carto.latitude)];
  }

  // --------------------------------------------------------------- helpers
  private hScale() {
    return this.terrainOn ? this.exaggeration : 0;
  }

  private async heightsFor(points: LonLat[]): Promise<number[]> {
    if (!points.length) return [];
    try {
      if (this.usingIon && this.demProvider) {
        const cartos = points.map(([lon, lat]) => Cartographic.fromDegrees(lon, lat));
        const res = await sampleTerrainMostDetailed(this.demProvider, cartos);
        return res.map((c) => c.height ?? 0);
      }
      return await sampleElevations(points);
    } catch {
      return points.map(() => 0);
    }
  }

  /** Request renders for a short while (requestRenderMode + async geometry). */
  private kick(ms = 1500) {
    const v = this.viewer;
    if (!v) return;
    v.scene.requestRender();
    if (this.kickTimer) window.clearInterval(this.kickTimer);
    const until = performance.now() + ms;
    this.kickTimer = window.setInterval(() => {
      if (!this.viewer || performance.now() > until) {
        if (this.kickTimer) window.clearInterval(this.kickTimer);
        this.kickTimer = null;
        return;
      }
      this.viewer.scene.requestRender();
    }, 90);
  }

  private refreshHeights() {
    if (this.lastCells) this.renderCells(this.lastCells);
    if (this.lastIndustries) this.setIndustries(this.lastIndustries.list, this.lastIndustries.selectedId);
    if (this.buildingSpecs.length) this.buildProceduralBuildings();
    this.kick();
  }

  // ---------------------------------------------------------------- camera
  private setInitialView(animate: boolean) {
    if (animate && this.viewer) {
      this.viewer.camera.setView({ destination: Cartesian3.fromDegrees(73.86, 18.3, 900_000) });
      this.flyHome(3.5);
    } else {
      this.flyHome(0);
    }
  }

  flyHome(duration = 1.5) {
    const v = this.viewer;
    if (!v) return;
    const target = Cartesian3.fromDegrees(73.862, 18.535, 560 * this.hScale());
    v.camera.flyToBoundingSphere(new BoundingSphere(target, 0), {
      offset: new HeadingPitchRange(CMath.toRadians(18), CMath.toRadians(-36), 34000),
      duration,
    });
    this.kick(duration * 1000 + 500);
  }

  flyTo(lonlat: LonLat, range = 6000) {
    const v = this.viewer;
    if (!v) return;
    const target = Cartesian3.fromDegrees(lonlat[0], lonlat[1], 560 * this.hScale());
    v.camera.flyToBoundingSphere(new BoundingSphere(target, 0), {
      offset: new HeadingPitchRange(v.camera.heading, Math.min(-0.35, v.camera.pitch), range),
      duration: 1.4,
    });
    this.kick(2000);
  }

  private orbit(dHeading: number, dPitch: number, rangeFactor = 1, absolutePitch?: number) {
    const v = this.viewer;
    if (!v) return;
    const center = this.pickLonLatCenter();
    if (!center) return;
    const range = Cartesian3.distance(v.camera.positionWC, center) * rangeFactor;
    const pitch = absolutePitch ?? CMath.clamp(v.camera.pitch + dPitch, CMath.toRadians(-89.9), CMath.toRadians(-8));
    v.camera.flyToBoundingSphere(new BoundingSphere(center, 0), {
      offset: new HeadingPitchRange(v.camera.heading + dHeading, pitch, range),
      duration: 0.6,
    });
    this.kick(900);
  }

  private pickLonLatCenter(): Cartesian3 | null {
    const v = this.viewer!;
    const c = new Cartesian2(v.scene.canvas.clientWidth / 2, v.scene.canvas.clientHeight / 2);
    const ray = v.camera.getPickRay(c);
    return (ray && v.scene.globe.pick(ray, v.scene)) || v.camera.pickEllipsoid(c) || null;
  }

  rotate(deg: number) {
    this.orbit(CMath.toRadians(deg), 0);
  }
  tilt(deg: number) {
    this.orbit(0, CMath.toRadians(deg));
  }
  zoom(factor: number) {
    this.orbit(0, 0, factor);
  }
  topDown() {
    this.orbit(0, 0, 1, CMath.toRadians(-89.9));
  }

  // ------------------------------------------------------------ base layers
  setBase(base: BaseState) {
    this.base = base;
    const { grid, green, columns, heatGrid } = this.ds;
    if (!grid) return;
    grid.entities.removeAll();
    columns.entities.removeAll();
    heatGrid.entities.removeAll();
    this.columnEntities.clear();

    // Grid lines (clamped to terrain)
    const { bbox } = base.city;
    const n = base.gridSize;
    grid.entities.suspendEvents();
    for (let i = 0; i <= n; i++) {
      const lon = bbox.west + ((bbox.east - bbox.west) * i) / n;
      const lat = bbox.south + ((bbox.north - bbox.south) * i) / n;
      const edge = i === 0 || i === n;
      const mat = Color.fromCssColorString(edge ? '#e2e8f0' : '#cbd5e1').withAlpha(edge ? 0.9 : 0.45);
      grid.entities.add({
        polyline: { positions: Cartesian3.fromDegreesArray([lon, bbox.south, lon, bbox.north]), width: edge ? 2.5 : 1.2, clampToGround: true, classificationType: ClassificationType.TERRAIN, material: mat },
      });
      grid.entities.add({
        polyline: { positions: Cartesian3.fromDegreesArray([bbox.west, lat, bbox.east, lat]), width: edge ? 2.5 : 1.2, clampToGround: true, classificationType: ClassificationType.TERRAIN, material: mat },
      });
    }
    grid.entities.resumeEvents();

    // Green areas (OSM: fills only — hundreds of polygons; demo: fills + outlines)
    const osm = base.geometrySource === 'osm';
    green.entities.removeAll();
    green.entities.suspendEvents();
    for (const g of base.greenAreas) {
      green.entities.add({
        id: `green:${g.id}`,
        name: g.name,
        polygon: {
          hierarchy: new PolygonHierarchy(ringPositions(g.polygon)),
          material: Color.fromCssColorString('#22c55e').withAlpha(osm ? 0.34 : 0.38),
          classificationType: ClassificationType.TERRAIN,
        },
      });
      if (!osm) {
        green.entities.add({
          polyline: {
            positions: ringPositions([...g.polygon, g.polygon[0]]),
            width: 2,
            clampToGround: true, classificationType: ClassificationType.TERRAIN,
            material: Color.fromCssColorString('#4ade80').withAlpha(0.9),
          },
        });
      }
    }
    green.entities.resumeEvents();

    // Industrial land-use zones (OSM)
    const ind = this.ds.industrialAreas;
    ind.entities.removeAll();
    ind.entities.suspendEvents();
    for (const a of base.industrialAreas) {
      ind.entities.add({
        id: `indarea:${a.id}`,
        name: a.name,
        polygon: {
          hierarchy: new PolygonHierarchy(ringPositions(a.polygon)),
          material: Color.fromCssColorString('#a78bfa').withAlpha(0.28),
          classificationType: ClassificationType.TERRAIN,
        },
      });
    }
    ind.entities.resumeEvents();

    // Attribution for OSM-derived geometry
    const credits = this.viewer?.creditDisplay;
    if (credits) {
      if (osm && !this.osmCredit) {
        this.osmCredit = new Credit('City geometry © OpenStreetMap contributors (ODbL)', true);
        credits.addStaticCredit(this.osmCredit);
      } else if (!osm && this.osmCredit) {
        credits.removeStaticCredit(this.osmCredit);
        this.osmCredit = null;
      }
    }

    this.buildTrafficEntities(base);
    this.sampleCellHeights(); // seat extruded columns on the DEM
    this.kick();
  }

  /** Same geometry, new state object (e.g. imported weather) — no rebuild needed. */
  updateBaseRef(base: BaseState) {
    this.base = base;
  }

  // ------------------------------------------------------------ cell values
  renderCells(input: CellRenderInput) {
    this.lastCells = input;
    const v = this.viewer;
    if (!v || !this.base || input.base !== this.base) return;
    const { base, states, pollutant, mode, result } = input;
    const n = base.gridSize;
    const isDelta = mode === 'delta' && !!result;
    const deltaVals = isDelta ? states.map((s) => result!.delta[s.cellId]?.[pollutant] ?? 0) : [];
    const deltaScale = isDelta ? Math.max(1, ...deltaVals.map(Math.abs)) : 1;
    const values = isDelta ? deltaVals : input.overrideValues ?? states.map((s) => s[pollutant]);
    const colorFn = isDelta ? (x: number) => deltaColor(x, deltaScale) : (x: number) => pollutionColor(pollutant, x);

    // 1) Smooth heatmap raster draped over terrain
    const version = ++this.heatVersion;
    const canvas = renderFieldCanvas(values, n, colorFn, isDelta ? 0.72 : 0.58);
    const { bbox } = base.city;
    SingleTileImageryProvider.fromUrl(canvas.toDataURL('image/png'), {
      rectangle: Rectangle.fromDegrees(bbox.west, bbox.south, bbox.east, bbox.north),
    })
      .then((provider) => {
        if (version !== this.heatVersion || !this.viewer) return;
        const layer = new ImageryLayer(provider, {});
        layer.show = this.layers?.heatmap ?? true;
        this.viewer.imageryLayers.add(layer);
        if (this.heatLayer) this.viewer.imageryLayers.remove(this.heatLayer, true);
        this.heatLayer = layer;
        this.orderImagery();
        this.kick();
      })
      .catch(() => undefined);

    // 2) 3D risk columns (extruded, absolute heights seated on DEM)
    const cols = this.ds.columns;
    const scale = this.hScale();
    const [lo, hi] = POLLUTANT_RANGE[pollutant];
    cols.entities.suspendEvents();
    base.cells.forEach((cell, i) => {
      const val = values[i];
      const norm = isDelta ? Math.abs(val) / deltaScale : Math.max(0, (val - lo) / (hi - lo));
      const h = 60 + norm * 2200;
      const ground = (this.cellElev.get(cell.id) ?? 0) * scale;
      const color = rgb(colorFn(val), 0.62);
      let e = this.columnEntities.get(cell.id);
      if (!e) {
        const b = shrinkBBox(cell.bounds, 0.62);
        e = cols.entities.add({
          id: `cell:${cell.id}`,
          polygon: {
            hierarchy: new PolygonHierarchy(ringPositions(bboxRing(b).slice(0, 4))),
            perPositionHeight: false,
            height: ground - 20,
            extrudedHeight: ground + h,
            material: new ColorMaterialProperty(color),
            outline: false,
          },
        });
        this.columnEntities.set(cell.id, e);
      } else {
        e.polygon!.height = new ConstantProperty(ground - 20);
        e.polygon!.extrudedHeight = new ConstantProperty(ground + h);
        (e.polygon!.material as ColorMaterialProperty).color = new ConstantProperty(color);
      }
    });
    cols.entities.resumeEvents();

    // 3) Affected-zone outlines (scenario / delta)
    const aff = this.ds.affected;
    aff.entities.removeAll();
    if (result && mode !== 'baseline') {
      const byId = new Map(base.cells.map((c) => [c.id, c]));
      aff.entities.suspendEvents();
      for (const id of result.affectedZones) {
        const c = byId.get(id);
        if (!c) continue;
        const d = result.delta[id]?.pm25 ?? 0;
        aff.entities.add({
          polyline: {
            positions: ringPositions(bboxRing(shrinkBBox(c.bounds, 0.94))),
            width: 3,
            clampToGround: true, classificationType: ClassificationType.TERRAIN,
            material: new PolylineDashMaterialProperty({
              color: Color.fromCssColorString(d > 0 ? '#fb7185' : '#38bdf8'),
              dashLength: 18,
            }),
          },
        });
      }
      aff.entities.resumeEvents();
    }

    this.renderTraffic(input);
    this.kick();
  }

  /**
   * Traffic polylines are created once per base (setBase → buildTrafficEntities);
   * here only materials change, and only for roads whose style actually changed.
   */
  private renderTraffic(input: CellRenderInput) {
    if (!this.ds.traffic || !this.roadEntities.size) return;
    const { base, states, closedRoads } = input;
    const stateById = new Map(states.map((s) => [s.cellId, s]));
    this.ds.traffic.entities.suspendEvents();
    for (const road of base.roads) {
      const closed = closedRoads.includes(road.id);
      const { color } = trafficLevelLabel(roadTrafficLevel(road, base, stateById));
      const style = closed ? 'closed' : color;
      const entry = this.roadEntities.get(road.id);
      if (!entry || entry.style === style) continue;
      entry.style = style;
      const material = closed
        ? new PolylineDashMaterialProperty({ color: Color.fromCssColorString('#64748b'), dashLength: 12 })
        : new ColorMaterialProperty(Color.fromCssColorString(color).withAlpha(0.92));
      for (const e of entry.entities) e.polyline!.material = material;
    }
    this.ds.traffic.entities.resumeEvents();
  }

  private buildTrafficEntities(base: BaseState) {
    const tr = this.ds.traffic;
    tr.entities.removeAll();
    this.roadEntities.clear();
    tr.entities.suspendEvents();
    const osm = base.geometrySource === 'osm';
    for (const road of base.roads) {
      const width = osm ? (road.roadClass === 'secondary' ? 2 : road.roadClass === 'primary' ? 3.2 : 4.5) : 3 + road.volume / 22;
      if (this.roadEntities.has(road.id)) continue; // defensive: ids must be unique
      const entities = road.paths.map((path, k) =>
        tr.entities.add({
          id: `road:${road.id}:${k}`,
          name: road.name,
          polyline: {
            positions: Cartesian3.fromDegreesArray(path.flat()),
            width,
            clampToGround: true, classificationType: ClassificationType.TERRAIN,
            material: new ColorMaterialProperty(Color.fromCssColorString('#94a3b8').withAlpha(0.8)),
          },
        }),
      );
      this.roadEntities.set(road.id, { entities, style: '' });
    }
    tr.entities.resumeEvents();
  }

  // ------------------------------------------------------------- industries
  setIndustries(list: { industry: Industry; state: IndustryDisplayState }[], selectedId: string | null) {
    this.lastIndustries = { list, selectedId };
    const ds = this.ds.industries;
    if (!ds) return;
    const missing = list.filter((x) => !this.industryElev.has(x.industry.id));
    if (missing.length) {
      this.heightsFor(missing.map((x) => x.industry.location)).then((hs) => {
        missing.forEach((x, i) => this.industryElev.set(x.industry.id, hs[i]));
        if (this.lastIndustries?.list === list) this.setIndustries(list, selectedId);
      });
    }
    ds.entities.removeAll();
    ds.entities.suspendEvents();
    const scale = this.hScale();
    for (const { industry: ind, state } of list) {
      const sel = ind.id === selectedId;
      const base = Color.fromCssColorString(state === 'added' || state === 'pending' ? '#f472b6' : CATEGORY_COLOR[ind.category] ?? '#94a3b8');
      const color = state === 'removed' ? Color.GRAY.withAlpha(0.5) : base;
      const ground = (this.industryElev.get(ind.id) ?? 0) * scale;
      const stackH = 120 + ind.emissionIntensity * 3;
      ds.entities.add({
        id: `industry:${ind.id}`,
        name: ind.name,
        position: Cartesian3.fromDegrees(ind.location[0], ind.location[1], ground + stackH / 2),
        cylinder: {
          length: stackH,
          topRadius: 45,
          bottomRadius: 70,
          material: color.withAlpha(state === 'removed' ? 0.35 : 0.9),
          outline: false,
        },
      });
      ds.entities.add({
        id: `industry:${ind.id}:pin`,
        position: Cartesian3.fromDegrees(ind.location[0], ind.location[1]),
        point: {
          pixelSize: sel ? 16 : 11,
          color,
          outlineColor: sel ? Color.CYAN : Color.WHITE,
          outlineWidth: sel ? 3 : 1.5,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: state === 'pending' ? 'PROPOSED' : state === 'added' ? `NEW · ${ind.category}` : state === 'removed' ? `${ind.id} (removed)` : ind.id,
          font: '600 11px Inter, sans-serif',
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cartesian2(0, -16),
          verticalOrigin: VerticalOrigin.BOTTOM,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new DistanceDisplayCondition(0, sel || state !== 'active' ? 1e7 : 45000),
        },
      });
    }
    ds.entities.resumeEvents();
    this.kick();
  }

  // --------------------------------------------------- monitoring stations
  setStations(summaries: StationSummary[], pollutant: Pollutant) {
    const ds = this.ds.stations;
    if (!ds) return;
    ds.entities.removeAll();
    ds.entities.suspendEvents();
    for (const s of summaries) {
      if (!s.station.location) continue;
      const v = s.values[pollutant];
      const color = v !== undefined ? rgb(pollutionColor(pollutant, v)) : Color.GRAY;
      const [lon, lat] = s.station.location;
      ds.entities.add({
        id: `station:${s.station.id}`,
        name: s.station.name,
        position: Cartesian3.fromDegrees(lon, lat),
        point: {
          pixelSize: 15,
          color,
          outlineColor: Color.fromCssColorString('#10b981'),
          outlineWidth: 3,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${s.station.name}${v !== undefined ? ` · ${v.toFixed(pollutant === 'co' ? 2 : 0)}` : ''}`,
          font: '600 11px Inter, sans-serif',
          fillColor: Color.fromCssColorString('#a7f3d0'),
          outlineColor: Color.BLACK,
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cartesian2(0, -18),
          verticalOrigin: VerticalOrigin.BOTTOM,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new DistanceDisplayCondition(0, 60000),
        },
      });
    }
    ds.entities.resumeEvents();
    this.kick();
  }

  // -------------------------------------------------------------- selection
  setSelectedCell(cell: GridCell | null) {
    const ds = this.ds.selection;
    if (!ds) return;
    ds.entities.removeAll();
    if (cell) {
      ds.entities.add({
        polyline: {
          positions: ringPositions(bboxRing(cell.bounds)),
          width: 4,
          clampToGround: true, classificationType: ClassificationType.TERRAIN,
          material: Color.fromCssColorString('#22d3ee'),
        },
      });
      ds.entities.add({
        position: Cartesian3.fromDegrees(cell.center[0], cell.center[1]),
        label: {
          text: `ZONE ${cell.id}`,
          font: '700 13px Inter, sans-serif',
          fillColor: Color.fromCssColorString('#a5f3fc'),
          outlineColor: Color.BLACK,
          outlineWidth: 4,
          style: LabelStyle.FILL_AND_OUTLINE,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          verticalOrigin: VerticalOrigin.BOTTOM,
        },
      });
    }
    this.kick();
  }

  setAreaCells(cells: GridCell[]) {
    const ds = this.ds.area;
    if (!ds) return;
    ds.entities.removeAll();
    ds.entities.suspendEvents();
    for (const c of cells) {
      ds.entities.add({
        polygon: {
          hierarchy: new PolygonHierarchy(ringPositions(bboxRing(c.bounds).slice(0, 4))),
          material: Color.fromCssColorString('#22d3ee').withAlpha(0.18),
          classificationType: ClassificationType.TERRAIN,
        },
      });
      ds.entities.add({
        polyline: {
          positions: ringPositions(bboxRing(shrinkBBox(c.bounds, 0.97))),
          width: 2,
          clampToGround: true, classificationType: ClassificationType.TERRAIN,
          material: Color.fromCssColorString('#67e8f9').withAlpha(0.9),
        },
      });
    }
    ds.entities.resumeEvents();
    this.kick();
  }

  setMarkers(pending: LonLat | null, candidates: CandidateLocation[]) {
    const ds = this.ds.markers;
    if (!ds) return;
    ds.entities.removeAll();
    const mk = (id: string, p: LonLat, text: string, color: string) =>
      ds.entities.add({
        id,
        position: Cartesian3.fromDegrees(p[0], p[1]),
        point: {
          pixelSize: 14,
          color: Color.fromCssColorString(color),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text,
          font: '700 12px Inter, sans-serif',
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 4,
          style: LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cartesian2(0, -18),
          verticalOrigin: VerticalOrigin.BOTTOM,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    if (pending) mk('marker:pending', pending, 'Proposed site', '#f472b6');
    for (const c of candidates) mk(`marker:cand:${c.id}`, c.location, `Site ${c.id}`, '#a78bfa');
    this.kick();
  }

  // ----------------------------------------------------------------- layers
  setLayers(l: Record<LayerId, boolean>) {
    const prev = this.layers;
    this.layers = l;
    if (!this.viewer) return;
    if (this.satLayer) this.satLayer.show = l.satellite;
    if (this.roadsLayer) this.roadsLayer.show = l.roads;
    if (this.labelsLayer) this.labelsLayer.show = l.labels;
    if (this.heatLayer) this.heatLayer.show = l.heatmap;
    const vis: Record<string, boolean> = {
      grid: l.grid,
      columns: l.risk,
      traffic: l.traffic,
      industries: l.industries,
      industrialAreas: l.industries,
      green: l.green,
      stations: l.stations,
    };
    for (const [k, on] of Object.entries(vis)) if (this.ds[k]) this.ds[k].show = on;
    this.buildingsVisible = l.buildings;
    if (this.buildingPrimitive) this.buildingPrimitive.show = l.buildings;
    if (this.osmTileset) this.osmTileset.show = l.buildings;

    if (!prev || prev.terrain !== l.terrain) {
      this.terrainOn = l.terrain;
      if (this.demProvider) this.applyTerrain();
    }
    if (!prev || prev.elevationTint !== l.elevationTint) {
      const g = this.viewer.scene.globe;
      if (l.elevationTint) {
        g.material = Material.fromType('ElevationRamp', {
          image: elevationRampCanvas(),
          minimumHeight: 500 * (this.terrainOn ? this.exaggeration : 1),
          maximumHeight: 1250 * (this.terrainOn ? this.exaggeration : 1),
        });
      } else {
        g.material = undefined as unknown as Material;
      }
    }
    this.kick();
  }

  setExaggeration(v: number) {
    if (v === this.exaggeration) return;
    this.exaggeration = v;
    if (this.viewer && this.terrainOn) {
      this.viewer.scene.verticalExaggeration = v;
      this.buildingTiles?.reset();
      if (this.layers?.elevationTint) {
        this.layers = { ...this.layers, elevationTint: false };
        this.setLayers({ ...this.layers, elevationTint: true });
      }
      this.refreshHeights();
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.kickTimer) window.clearInterval(this.kickTimer);
    this.handler?.destroy();
    if (this.viewer && !this.viewer.isDestroyed()) this.viewer.destroy();
    this.viewer = null;
  }
}
