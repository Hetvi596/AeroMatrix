# AeroMatrix integration handoff

## Objective and boundaries

Connect the teammate's existing application to this backend while preserving its visual design, navigation, 3D map and working simulator. This export contains no frontend. Replace demo prediction values only when a supported API value exists. Null or UNAVAILABLE must remain visibly unavailable; do not fall back to random values, a city average or another station without explicit, scientifically validated support.

The models produce **one concentration prediction at issue time +24 hours**. They are station-history forecasting models, not models of every Pune ward. They use pollutant lags, backward-looking rolling means, calendar features and available observed weather. The fitted median imputer handles missing predictors and is stored inside each estimator. No future weather, invented coordinates or industrial emissions are used. Station ID selects an actual history and coverage eligibility; it is not an ordinal numerical predictor. Regional differences arise from real station histories and weather.

## Files and installation

- `models/<pollutant>/model.joblib`: evaluated inference bundle; `metadata.json`, `station_accuracy.csv`, and `evaluation.png` alongside.
- `preprocessing/features.py`: exact inference transformations used in training; `aqi.py`: bounded/conservative CPCB AQI calculation.
- `api/main.py`: FastAPI routes and input validation; `api/inference.py`: relative-path loading, integrity verification and prediction.
- `runtime_context/`: only the required recent historical context for 119 station–pollutant pairs, observed snapshots and small AQI excerpts. These are real historical records, not live data.
- `geographic_data/`: station IDs/names, four boundary versions, 551 mapped industrial points/centers, partial regional counts and district emissions.
- `metadata/`: provenance, data quality, exact record counts, all candidate validation/test metrics and station-holdout evaluations.
- `verification/`: real-input request, full-data reference predictions, comparisons and executed test results.

Use Python 3.12, 64-bit. Run `START_MODEL_API.bat`. `bootstrap.py` creates a local `.venv`, installs `requirements.txt` once per requirements hash and launches the inference API. It never invokes training. Dependency installation needs internet; inference does not. Do not upgrade sklearn/numpy/pandas independently because serialized-model compatibility and transformation parity depend on the pinned versions. CPU inference is sufficient; no NVIDIA/CUDA installation or paid API key is needed.

Manual equivalent: `py -3.12 -m venv .venv`, then `.venv\Scripts\python -m pip install -r requirements.txt`, then `.venv\Scripts\python -m api.main`. Use one command at a time from this folder. `TEST_MODEL_API.bat` uses the same setup and starts a separate temporary HTTP server on a free local port.

Configuration: `AEROMATRIX_HOST` defaults to `127.0.0.1`; `AEROMATRIX_PORT` defaults to `8000`. `AEROMATRIX_CORS_ORIGINS` is a comma-separated exact list; defaults include localhost/127.0.0.1 on ports 5173, 5174 and 3000. Set variables in the terminal before startup. Do not terminate an unrelated service using port 8000. Binding to `0.0.0.0` is an explicit deployment choice; authentication/TLS/rate limiting are not provided by this local export.

## API routes and data meanings

All responses are JSON. Normal missing-data states return HTTP 200 with `status: UNAVAILABLE`; malformed requests return 422, unknown boundary versions 404, and unexpected server errors 500. Check both HTTP status and the response status. Use `API_CONTRACT.json` for request/query schemas and core forecast response structures. `RESPONSE_EXAMPLES.json` contains exact successful and partial real responses from the extracted-backend test. `/openapi.json` and `/docs` additionally expose FastAPI's runtime request documentation.

| Route | Inputs | Meaning |
|---|---|---|
| GET `/health` | none | Model loading, count, units, station coverage, no-training flag. |
| GET `/regions` | none | `station_locations` (12) and `wards` (58), kept separate. |
| GET `/pollution` | `region` | Actual latest available measured concentrations per pollutant; timestamps can differ. Historical, never live. AQI is calculated from one coherent trailing window at `snapshot_end`. |
| GET `/forecast` | `region`, optional `pollutant`, optional `allow_historical=false` | One +24h point per supported pollutant, using bundled historical context. Stale inputs are unavailable by default. |
| POST `/forecast` | body described below | Forecast using caller-supplied real hourly history. |
| GET `/model/metrics` | optional `pollutant` | Full actual training/validation/test counts, metrics, baseline comparisons, periods, features and station holdouts. |
| GET `/boundaries` | optional `version` | GeoJSON; default `pune-electoral-wards_2022.geojson`. Four versions are listed in `geographic_data/boundary_versions.json`. |
| GET `/location` | `longitude`, `latitude` | Point-in-polygon region lookup. Pollution is UNAVAILABLE without validated spatial support. |
| GET `/industry` | `longitude`, `latitude`, optional `radius_km=5` (0–30] | Nearby mapped sites and haversine distance, with partial-coverage warning; no emissions estimates. |
| GET `/industry/district-emissions` | none | Actual 2021 Pune district annual emission inventory retained as district tonnes/year. |
| GET `/aqi/history` | `region` | Last available source-reported AQI excerpt, separate from reconstructed concentration AQI. Includes Kothrud. |

`region` accepts the exact `station` ID, full station name or a listed alias, case-insensitively. Hyphens/underscores normalize to spaces. Use the IDs from `/regions` as dropdown values. No fuzzy nearest-station substitution occurs. Supported locations include Karve Road, Mhada Colony, Alandi, Bhosari, Hadapsar, Transport Nagar-Nigdi, Revenue Colony-Shivajinagar, Katraj Dairy, Savitribai Phule Pune University, Bhumkar Nagar, Panchawati Pashan and Dhankawadi. Pollutant coverage varies by station. Kothrud has only historical AQI in these inputs and is not mapped to Karve Road.

Canonical pollutants: `pm25`, `pm10`, `no2`, `no`, `nox`, `so2`, `co`, `o3`, `nh3`, `benzene`, `toluene`, `xylene`. CO is **mg/m3**, NOx **ppb**, all other supported pollutant concentrations **ug/m3**. Never sum NOx ppb with NO/NO2 mass concentrations. SPM and Pb lack sufficient independent data and have no artifacts.

## Exact forecast response fields

A recognized station returns `status` (PREDICTED if every requested pollutant is available, PARTIAL if some are available, UNAVAILABLE if none), `region` (station object), `pollutants` (map by canonical name), `aqi` (UNAVAILABLE for a single point forecast) and `scenario_note`.

The station object contains `station`, `station_name`, `name`, `aliases`, nullable `longitude` and `latitude`, and `source_files`. Coordinates are null in this dataset; do not replace them with ward centroids.

Each available pollutant contains:

- `status: PREDICTED`, `pollutant`, numeric `value`, `unit`.
- `issued_at`, `valid_at`: ISO timestamps with UTC offset, identifying the end of the completed input hour and end of the target hour; `generated_at` is the actual API calculation time; `horizon_hours: 24`; `historical` boolean.
- `observation_window` (`start`, `end`) and `prediction_window` (`start`, `end`, `statistic: hourly_mean`) make averaging intervals explicit. The output is the mean concentration for one target hour, not an instantaneous sensor reading.
- `model`: `algorithm`, `version`, `artifact_sha256`, `kind` (`fitted_ml_model` or `statistical_baseline`). SO2 is the latter.
- `lower`, `upper`, `uncertainty`: empirical absolute validation residual 90th-percentile interval and measured test coverage. This is not a guaranteed 90% confidence interval under future distribution shift.
- `test_metrics`: `mae`, `rmse`, `r2`, `n`; `reliability_warnings` and `imputed_features` arrays.
- `source`: `bundled_real_observation_context` or `caller_supplied_observations`; `spatial_scope` explains station-only coverage.

An unavailable pollutant has `status: UNAVAILABLE`, `reason`, and typically `pollutant`. Stale input responses also expose `issued_at`, `valid_at`, `historical: true`. An unknown region returns a top-level unavailable object with `reason` and `region`. Do not expect `value` on an unavailable object.

The measured response has `status: MEASURED`, `region`, `pollutants`, `aqi`, `historical: true`, `snapshot_end`, `snapshot_window_end`, `source_files`, and `notice`. Each measured pollutant includes `status`, `value`, `unit`, `time`, `window`, `historical`, and `source`. `time` and `snapshot_end` label input hour starts; `window.end` and `snapshot_window_end` identify completed-hour availability. The values are latest available individually, not necessarily simultaneous.

## Runtime history input

POST body fields: `region` string, optional `pollutants` string list, `allow_historical` boolean (default false), `units` map, and `observations` array (16–336 records). Each record is `{ "time": "ISO timestamp with offset", "values": { "canonical_parameter": number_or_null } }`. Every submitted parameter needs its exact unit in `units` as reported by `/health`. Extra outer fields are rejected. Unknown parameters, wrong units, duplicates, nonfinite values and invalid physical ranges are rejected. Missing values must be null or omitted.

Submit already aggregated **hourly** data, at hour boundaries in Asia/Kolkata, sorted or unsorted; each input `time` labels the **start** of a completed hourly averaging bin. The API sorts and fills calendar gaps as missing. Timestamps with any timezone are accepted if they correspond to an IST hour boundary. Future or unfinished hourly averages are rejected. Do not send raw 15-minute rows as hourly data. Match training: an hourly pollutant mean needs at least three valid quarter-hour observations. Never average categorical AQI into concentrations. Normalize pressure units before submission; no hidden conversion is applied by the API.

At least 16 actual target observations in the trailing 24 hours and a valid latest target reading are required for each requested pollutant. Supply **169 hourly records** to populate the 168-hour lag; additional history up to 14 days is accepted. Shorter history can invoke the training-fitted median imputer, reported explicitly under `imputed_features`. A model may be materially less reliable with many imputed lags/weather fields. No labels or future observations are required. A completed input hour more than three hours old is historical. Keep the laptop clock correct. Training/evaluation CSV periods and stored context index timestamps retain bin-start labels; forecast response availability and validity use bin-end labels without changing any feature values or predictions.

Use `verification/real_history_request.json` as a runnable, actual-data request example. It is historical and sets `allow_historical: true`. To test manually in Python, load that JSON and POST it with `httpx.post('http://127.0.0.1:8000/forecast', json=payload)`. To operate live, implement a legitimate measurement-feed adapter outside this package and send verified recent observations. No automatic live connector is bundled. POST also returns `input_observed_aqi`, calculated from submitted measured history; it is not forecast AQI.

## AQI handling

Implemented CPCB breakpoints and maximum-subindex aggregation; at least three eligible pollutants including PM2.5 or PM10; at least 16 valid hourly observations in the trailing 24 hours. PM/NO2/SO2/NH3 use the trailing 24h mean. CO and O3 use the trailing 8h mean, conservatively requiring all eight hours as well as 16 hours in the trailing day. Units are checked before inputs enter inference.

Calculated AQI has `status` AVAILABLE, LOWER_BOUND or UNAVAILABLE, nullable `value`, `category`, `dominant_pollutant`, `reason`, `subindices`, `coverage_hours`, `excluded`, `period_end`, and `method`. AVAILABLE values use the maximum eligible subindex, not an arithmetic average. For open-ended severe concentrations, display `>=401` and Severe when LOWER_BOUND; never present 401 as an exact AQI. Ozone above the supported 8h range needs a separate one-hour rule, so overall AQI is withheld. Missing pollutants/periods remain exposed. Future point predictions lack the full windows and therefore never yield official forecast AQI.

Source-reported 2017–2023 AQI records lack pollutant subindices/dominant-pollutant information. They were cleaned separately, not mixed with concentration training labels. Source references are in `preprocessing/aqi.py` and provenance metadata.

## Geography and industry

All four provided boundary files were validated: 190 total features. The 2022 electoral set has 58 valid nonoverlapping wards and is the active lookup layer; historical versions are preserved separately. Other versions overlap and must not be merged into a new prediction unit. These files do not establish full PCMC polygon coverage.

No supplied concentration station has verified coordinates, so no defensible station-to-ward spatial join could be completed. `station_regions.csv` records this. Display verified boundary geometry, but withhold station placement until trusted coordinates are added and validated. Boundary centroids are for ward labels only. Station-holdout forecasting evaluations require the held-out station's own history; they are **not** validation of unmonitored spatial estimation.

The recovery cache supplies 551 OSM points or way centers; only one of four tiles succeeded. There are no factory polygon footprints. Regional point counts/densities are partial geometry summaries, not emission strengths, full factory counts or industrial area coverage. Distance queries are distances to mapped points/centers. District 2021 sector emissions remain district aggregates. None of these industrial fields trained the exported models: coordinates and temporally aligned industrial features are insufficient. No improvement claim is made.

## Frontend integration without redesign

Create one API client with a configurable base URL (for Vite, use `VITE_AEROMATRIX_API_URL`). Fetch `/regions` once and keep station IDs distinct from ward IDs. On station selection, fetch `/pollution` for observed cards and `/forecast` for predictions. A historical-review screen may explicitly send `allow_historical=true` and must display a historical badge and issue/valid times. A current screen must use fresh POST history or show unavailable.

Replace demo/random/hardcoded pollutant values at the data-provider boundary. Keep existing components, labels and interactions. Audit the teammate's actual application for demo providers; do not assume file paths match this earlier source project. Map canonical keys to existing card labels and preserve units. Render dashes with the API reason for unavailable values. Keep loading/network errors separate from scientifically unsupported data. Cancel outdated requests when region selection changes to prevent mismatched cards.

For charts, show actual observed history and the one documented +24h predicted point/interval. The snapshot endpoint is not a time-series feed; the frontend needs a real history adapter or the explicitly historical context. Do not invent intermediate hourly predictions to fill a curve. Compare regions only at matching issue/valid times and units; bundled latest eligible timestamps can differ by pollutant/station.

For the 3D map, load `/boundaries` and retain map styling/controls. Ward selection can call `/location` for geometry association but must show pollution unavailable. Do not paint all ward polygons with one station's number or interpolate a continuous pollution heatmap without a separate validated spatial model. The export cannot place accurate station markers because source coordinates are missing.

For AQI cards, use only the measured-response AQI or valid POST `input_observed_aqi`; respect UNAVAILABLE and LOWER_BOUND. Forecast concentration values cannot be substituted directly into an AQI formula without a complete valid forecast averaging window.

For environmental simulations, pass available predicted concentrations as a explicitly dated **baseline** in the matching units. Preserve the existing scenario engine. Tree planting, factory removal or traffic changes remain scenario assumptions; these models do not validate the causal concentration reduction. Never label a simulated intervention result as a measured or ML-validated outcome.

Recommended status labels: Measured (historical), Predicted (historical/current according to metadata), Unavailable, and Scenario estimate. SPATIALLY ESTIMATED is reserved for a future independently validated spatial model and is not emitted here.

## Model loading and evaluation

Prefer the HTTP API. For direct Python inference from this package, use `from api.inference import forecast` then `forecast('Hadapsar', ['pm25'], allow_historical=True)`. Artifacts are loaded from relative manifest paths and checked against SHA256. The serialized bundle contains `chosen_model`, `features`, `target`, `horizon_hours`, and, for ML models, the fitted sklearn pipeline. Do not deserialize unknown artifacts or reconstruct a new imputer at inference.

Chronological 60/20/20 timestamp partitions are purged by 24h label availability at boundaries. Selection uses validation RMSE; a baseline within 1% is preferred. Test data does not select the winner. The saved model is not refitted after evaluation, so reported metrics describe that artifact. Candidates: persistence, station/hour training seasonal averages, 80-tree random forest, and 150-iteration histogram gradient boosting. Random forest fit receives the whole training partition; each tree draws at most 50,000 bootstrap samples to bound laptop memory. CPU threads are limited. No XGBoost/LightGBM or deep model is required to reproduce these evaluated results.

`metadata/model_metrics.csv` is the compact table of actual training, validation and test counts, MAE/RMSE/R2, periods and persistence comparison. Full JSON includes every candidate's scores and station holdouts. SO2 is a persistence baseline, not a fitted ML estimator, and its test R2 is negative. NH3 and benzene have low explained test variance. SO2's reported training count identifies the candidate-comparison partition; persistence fits no parameters. There is no claimed accuracy percentage. Empirical intervals and weak-model warnings must remain visible.

## Integration acceptance checks

Run `TEST_MODEL_API.bat` first. It verifies all artifacts, 119 API/direct/full-data-reference predictions, supported aliases, unavailable regions, stale-data gating, units, POST history, AQI gates and CORS over real HTTP. It uses real bundled observations; expected reference values are verification-only and never loaded by the inference API. It verifies startup does not call fit and model bytes stay unchanged.

Then verify the finished frontend: Hadapsar, Alandi and Shivajinagar select their own station IDs; cards match API values/units/timestamps; Kothrud concentration forecasting and unmonitored wards show unavailable; historical badge survives refresh; network errors do not restore mock values; AQI conditions remain intact; charts use only real observations and documented forecast points; map geometry remains functional; scenario outputs remain labelled as hypothetical. Check the browser console and network requests and test the teammate's configured CORS origin. The export verification does not claim this separately developed UI has already been integrated or tested.
