# ENR01 — Urban Environmental Digital Twin

**Status: Prototype** (Phases 1–6 implemented with deterministic DEMO data. Phase 7 (real data + ML) not started.)

A CesiumJS 3D digital twin of Pune with a gridded pollution field, environmental layers, a working what-if simulator, scenario comparison, a pollution-reduction actions module, and candidate-site comparison.

> **Demo data disclaimer.** All environmental values (pollutants, traffic, industry emissions, green cover, weather, population) are **DEMO / SIMULATED**. They are generated deterministically and are **not** CPCB observations, ERA5 reanalysis, or measured traffic. What-if results are **MODELED SCENARIO** outputs from an **uncalibrated rule-based prototype model**. No ML model is trained yet, so no forecasts are shown. Base-map imagery, roads, labels and terrain come from open map services. They are used for display only.

## How to run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the build
```

`predev`/`prebuild` copy Cesium's static assets into `public/cesium` (git-ignored).

Optional: copy `.env.example` → `.env` and set `VITE_CESIUM_ION_TOKEN` to use Cesium World Terrain + Cesium OSM Buildings. Without a token the app uses an open fallback: AWS Terrarium DEM tiles plus procedural demo building massing. No credentials are required.

## Current features

| Area | What works |
|---|---|
| 3D map (CesiumJS) | Terrain from an open DEM (Terrarium, SRTM-derived) with an exaggeration slider and an elevation-tint toggle. Esri satellite imagery plus a CARTO dark fallback, an Esri roads overlay, and labels/admin boundaries. Buildings are procedural demo boxes (single batched primitive) or OSM Buildings with an ion token. Controls: zoom, rotate, tilt, top-down, reset. Cursor readout shows lat/lon, elevation and zone. |
| Grid | Configurable 5×5 / 10×10 / 20×20 grid aligned to the Pune bbox. Each cell has ID, geometry, PM2.5/PM10/NO₂/SO₂/CO/O₃, traffic, industrial influence, green %, temperature, dispersion factor and risk level. Click a cell to highlight it and open its details. |
| Layers | Pollution heatmap (smooth raster draped on terrain), analysis grid, 3D risk columns, roads, traffic corridors (coloured by modeled level), industries (3D stacks + pins, clickable), green areas, buildings, terrain, satellite, labels. |
| What-If simulator | Traffic (city / area / public-transport shift), road closure + diversion, add industry by clicking the map, remove or re-rate existing industries, industrial and vehicle emission control, green cover change plus a trees→% helper and green buffer, building density/height, full weather controls, presets. **RUN SCENARIO** recomputes every cell. The map switches to scenario / Δ view with dashed outlines on affected zones. |
| Before vs after | Right-panel summary (baseline → scenario, Δ, Δ%, affected zones, max ↑/↓, high-risk count, population in worsened zones), per-zone pollutant table, and a bottom chart of the most-changed zones. |
| Scenarios | Save (localStorage, params only, recomputed deterministically), load, delete, compare up to 4 (table + charts), one-click example set A–E. |
| Actions (ENR01) | Six actions evaluated against one baseline (three core: traffic restriction, industrial emission control, green-cover expansion), ranked with a chart. Each can be shown on the map or saved. |
| Site comparison | Pick up to 5 candidate sites on the map. Each is scored on pollution impact, exposure, traffic, green cover, building density, industrial proximity and a composite demo risk score. |
| Analytics | Demo source contribution (city and hotspots), a forecast placeholder (explicitly "model not trained"), an empty validation table, the ML pipeline, the planned feature set, and a data-source status list. |
| Provenance | Global OBSERVED / MODEL PREDICTION / MODELED SCENARIO / DEMO badges on every panel. Unconnected types are dimmed. |

## Architecture

```
src/
  types/                  domain types (BaseState, CellState, ScenarioParams, ScenarioResult, DataStatus…)
  data/demo/              demoDataProvider.ts — the ONLY source of demo values (seeded, deterministic)
  data/geojson/           approximate Pune demo geometry (roads, industries, green areas)
  services/
    dataProvider.ts       DataProvider interface + DemoDataProvider  ← plug CPCB/ERA5/OSM adapters here
    pollutionModel.ts     prototype rule-based model (all coefficients in COEF)
    scenarioService.ts    runScenario(base, params) → {baseline, scenario, delta, affectedZones, sourceContribution, metadata}
    predictionService.ts  PredictionService interface; NotTrained (active) + Http (future)
  store/useTwinStore.ts   zustand app state
  map/
    TwinMap.ts            owns the Cesium Viewer lifecycle and all Cesium layers (created once)
    mapSync.ts            pushes only the changed store slices to TwinMap
    terrain.ts            open Terrarium DEM terrain provider + elevation sampling
    CesiumMap.tsx, LayerControl.tsx, MapLegend.tsx
  simulator/              What-If panel
  scenarios/              actions, site comparison, scenario comparison
  analytics/              source contribution, forecast/validation placeholders
  components/             layout, panels, UI primitives
backend/                  FastAPI scaffold (/health, /forecast, /explain → 501) + ML pipeline notes
```

**Swapping in real data or models:** implement `DataProvider` (real inputs), `ScenarioService` (ML-backed scenarios) or `PredictionService` (forecasts), then change the single `export const … =` line in each file. The UI does not change.

**Performance:** the viewer is created once and never re-created on React state changes. It uses request-render mode, one batched primitive for buildings, and about 100 column entities that are updated in place, not re-created. The heatmap is a single draped raster. Hover picking is throttled.

## 3D map technology
CesiumJS 1.14x. Terrain: Terrarium DEM through `CustomHeightmapTerrainProvider` (open), or Cesium World Terrain (ion). Imagery: Esri World Imagery / Transportation / Boundaries & Places, and CARTO dark. 3D objects are seated on sampled DEM heights.

## Future real datasets
CPCB CAAQMS (observed AQ), ERA5 (weather), OpenStreetMap (roads/buildings/land use), traffic API or counts, MPCB/CPCB industry registry and emission inventory, DEM (SRTM/Copernicus), ESA WorldCover / Sentinel-2 NDVI. Possible extras: Google Earth Engine, QGIS preprocessing, IoT sensors.

## Future ML
See `backend/ml/README.md`. Planned sequence: persistence baseline → RF → XGBoost/LightGBM with lags → temporal models only if justified, then time-based hold-out validation and SHAP-based source attribution. The final model is selected by validation performance.

## Next development phase
1. **Phase 7a:** implement `CpcbDataProvider` + `Era5Adapter`, and map stations to grid cells (IDW / kriging) to produce OBSERVED layers.
2. **Phase 7b:** train and validate a PM2.5 model, serve it via `backend/api`, and switch `predictionService` to `HttpPredictionService`.
3. Calibrate the `COEF` values in `pollutionModel.ts` against the trained model, or replace `scenarioService` with the ML-backed one.
4. Replace demo roads, industries and green polygons with OSM, registry and land-cover data.
