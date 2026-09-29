# ML pipeline (Phase 7 — not started)

No model is trained. Do not add one until real data is available.

1. `preprocessing/` — ingest CPCB CAAQMS (hourly PM2.5/PM10/NO2/SO2/CO/O3), ERA5 (t2m, u10/v10, rh, sp, tp, blh), OSM roads/buildings, traffic, industry registry, DEM, land cover.
2. Clean: station QA, gap handling, outlier flags. Keep raw vs cleaned separate.
3. Features: pollutant lags (1–72 h), rolling stats, meteorology, calendar, per-cell spatial features (road density, industrial proximity, green cover, elevation, building density).
4. Grid: map station features to the same cell IDs used by the frontend (`A-01`…).
5. Models, in order: persistence baseline → Random Forest → XGBoost/LightGBM with lags → temporal models only if they beat these.
6. Validation: time-based hold-out (e.g. last 2–3 months), report RMSE / MAE / R² per station and per season. Pick the model by validation, not by assumption.
7. Explainability: SHAP per prediction → aggregate into source categories (traffic / industry / meteorology / background) to replace the demo source contribution.
8. Serve via `backend/api` endpoints `/forecast` and `/explain`, then switch `predictionService` in the frontend to `HttpPredictionService`.
