# ENR01 — Urban Environmental Digital Twin

**Status: Prototype.** Phases 1–6 are implemented with deterministic DEMO data. Phase 7 (real data + ML) has its tooling in place, and training is waiting on real datasets.

A CesiumJS 3D digital twin of Pune with a gridded pollution field, environmental layers, a working what-if simulator, scenario comparison, a pollution-reduction actions module and candidate-site comparison. It can also import real observations (CPCB air quality, ERA5 or station weather) and ships a train / validate / serve pipeline for PM2.5 forecasting.

> **Data disclaimer.** Until you import real files, all environmental values (pollutants, traffic, industry emissions, green cover, weather, population) are **DEMO / SIMULATED**. They are deterministic and are **not** CPCB observations, ERA5 reanalysis or measured traffic. What-if results are **MODELED SCENARIO** outputs from an **uncalibrated rule-based prototype model**. Imported CSV values are labelled **OBSERVED**. Forecasts appear only when the backend serves a model trained on real data; they are labelled **MODEL PREDICTION**. Base-map imagery, roads, labels and terrain come from open map services and are used for display only.

## How to run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm test           # frontend unit tests (Vitest)
```

`predev`/`prebuild` copy Cesium's static assets into `public/cesium` (git-ignored).

Optional: copy `.env.example` → `.env` and set:
- `VITE_CESIUM_ION_TOKEN` to use Cesium World Terrain and Cesium OSM Buildings. Without it the app uses open AWS Terrarium DEM tiles and procedural demo buildings.
- `VITE_API_URL` if the backend isn't at `http://localhost:8000`.

## Using real data (Phase 7)

### 0. Real city geometry (OpenStreetMap)
In the **Data** panel, **Load real OSM geometry** replaces the hand-drawn demo roads, parks and industries with real OpenStreetMap data for the analysis area: about 540 named/classified roads (≈900 km of trunk, primary and secondary), about 340 green areas and about 50 industrial zones.
- **What changes:** grid traffic comes from class-weighted road density, green cover from real parks and forests, and land use from industrial zones. Emission point sources sit on the largest industrial zones.
- **Still DEMO:** traffic volumes (a proxy from road class) and emission intensities. Only the geometry is real.
- **Data source:** a bundled snapshot (`public/data/pune-osm-snapshot.json`) loads instantly and works offline. **Live** re-downloads from the Overpass API; public servers are sometimes busy. To refresh the bundled snapshot, run `node scripts/fetch-osm-snapshot.mjs`.
- **Licence:** OSM data © OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright). The snapshot is a derived database under the same licence, and the map shows the attribution.

### 1. Observations in the app (no backend needed)
Open the **Data** panel (last item in the left rail):
- **Air quality CSV.** Drop one or more CPCB CCR exports (metadata rows and a `From Date, PM2.5 (ug/m3)…` header are fine), `station_hour`-style tables, or any CSV with station / datetime / pollutant columns. Use **template** for the expected layout.
- **Station coordinates.** CPCB exports usually have none, so enter lat/lon per station from the CPCB station list.
- **Result:**
  - Station markers appear on the map.
  - **Observed** in the header shows an IDW-interpolated field for the selected pollutant.
  - Zone details show observed vs modeled values.
  - The time-series chart switches to observed data.
  - A **prototype-model-vs-observed** table reports MAE / RMSE / bias / r.
- **Calibration.** **Fit model to observed PM2.5** least-squares fits PM2.5 = α·background + β·local sources to the station means. The baseline and every scenario then start from measured levels. The in-sample RMSE before and after is shown. It's a calibration of the rule model, not a validated forecast.
- **Weather CSV.** ERA5 point extracts (`t2m` K, `u10`/`v10`, `sp` Pa, `tp` m are converted) or CPCB met columns (AT, RH, WS, WD, RF, BP). The last 24 h become the OBSERVED baseline weather.

Files are processed in the browser and are not uploaded anywhere.

### 2. Train and serve a forecasting model
```bash
python -m venv .venv
.venv\Scripts\activate            # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r backend/requirements.txt   # optionally: xgboost lightgbm shap xarray netCDF4

# put raw files in data/ (git-ignored), then from the project root:
python -m backend.ml.train --aq "data/raw/cpcb/*.csv" --stations data/stations.csv --era5 data/raw/era5_pune.nc --horizon 24 --out backend/models/pm25

uvicorn backend.api.main:app --port 8000
```
The training script:
- cleans and QA-checks the data, then resamples it to hourly;
- builds lag, rolling, calendar and weather features;
- compares persistence, Random Forest, and XGBoost/LightGBM (if installed) on a time-ordered validation split;
- picks the model by validation RMSE, reports metrics on an untouched test period, and saves it with `metadata.json` (and SHAP group importance if `shap` is installed).

With the API running, the app picks up the model on load:
- **Analytics** fills in the validation table and per-station forecasts.
- The header gains a **Forecast +Nh** view: the station forecasts IDW-interpolated onto the grid and labelled **MODEL PREDICTION**. This needs station coordinates, from `--stations` at training time or from imported observations.

Without a trained model the app says so; it never shows made-up forecasts. `ENR01_MODEL_DIR` overrides the model folder the API reads.

`data/stations.csv` format: `station,latitude,longitude`. Station names must match those in the CPCB files.

Backend tests (synthetic fixtures generated in a temp dir): `python -m pytest backend/tests -q`

## Current features

| Area | What works |
|---|---|
| 3D map (CesiumJS) | Open DEM terrain (Terrarium, SRTM-derived) with exaggeration and elevation tint. Esri satellite imagery plus a CARTO dark fallback, roads overlay, labels and boundaries. Procedural or OSM buildings. Zoom, rotate, tilt, top-down and reset controls, plus a cursor readout. |
| Grid | 5×5 / 10×10 / 20×20 grid. Each cell has pollutants, traffic, industry influence, green %, temperature, dispersion factor and risk. Click a cell for details. |
| Layers | Pollution heatmap, grid, 3D risk columns, roads, traffic corridors, industries, green cover, buildings, terrain, satellite, labels, **monitoring stations**. |
| What-If simulator | Traffic, road closures and diversions, add/remove/re-rate industries (placed on the map), emission controls, green cover (trees helper, green buffer), building density and height, weather, presets. **RUN SCENARIO** updates the map (scenario / Δ views, affected-zone outlines). |
| Scenarios & actions | Save and compare scenarios, example set A–E, six reduction actions (three ENR01 core) ranked, candidate-site comparison. |
| Observed data | CSV import of CPCB observations and weather, a station coordinates editor, an IDW observed field, an observed time series, model-vs-observation validation, and PM2.5 calibration of the prototype model. |
| Real geometry | OpenStreetMap roads, green areas and industrial zones (bundled snapshot or live Overpass), rendered on the 3D map and driving the grid. |
| Forecast layer | Trained-model station forecasts from the backend, interpolated to a MODEL PREDICTION map view. |
| Analytics | Demo source contribution, backend-aware forecast and validation blocks, ML pipeline, data-source status. |
| Provenance | OBSERVED / MODEL PREDICTION / MODELED SCENARIO / DEMO badges throughout. |

## Architecture

```
src/
  types/                  domain types
  data/demo/              demoDataProvider.ts — the ONLY source of demo values (seeded)
  data/geojson/           approximate Pune demo geometry
  data/import/            CSV parser, CPCB observation importer, weather importer (+ tests)
  services/
    dataProvider.ts       DataProvider interface + DemoDataProvider
    pollutionModel.ts     prototype rule-based model (coefficients in COEF)
    scenarioService.ts    runScenario(base, params) → {baseline, scenario, delta, affectedZones, sourceContribution, metadata} (+ tests)
    observations.ts       window aggregation, IDW gridding, observed series, model-vs-observation validation
    predictionService.ts  PredictionService interface + backend client
  store/useTwinStore.ts   zustand app state
  map/                    TwinMap.ts (Cesium lifecycle, created once), mapSync.ts, terrain.ts, controls
  simulator/ scenarios/ analytics/ components/
backend/
  preprocessing/          cpcb.py (load + QA + hourly), era5.py (NetCDF/CSV → station weather, UTC→IST)
  ml/                     features.py, train.py (time-based validation, model selection, SHAP groups)
  api/main.py             FastAPI: /health, /model/metrics, /forecast?station=, /explain (501 when no model)
  tests/                  end-to-end pipeline smoke test on synthetic fixtures
```

**Swapping in real data or models:** implement `DataProvider`, `ScenarioService` or `PredictionService` and change the single `export const … =` line in each file. The UI does not change.

## Next development phase
1. **Data.** Get real CPCB hourly data for the Pune CAAQMS stations, plus station coordinates and ERA5 for the same period.
   - Import them in the Data panel (observed map, validation, calibration).
   - Train with `backend.ml.train` (forecast layer).
2. **Traffic.** Replace the road-class traffic proxy with measured counts or a traffic API (a new `DataProvider` input).
3. **Emissions.** Replace the demo emission intensities of industrial zones with an emission inventory or the MPCB consent registry.
4. **ML scenarios.** Swap `scenarioService` for an ML-backed implementation once the trained model's feature attributions are trustworthy.
