# Integration contract — leave the website intact

Extract this folder beside the existing backend; do not replace AeroMatrix source, navigation, themes, Cesium viewer or AeroSage. This task delivers the model/evaluation layer only.

1. Run `SETUP.bat` with Python 3.12 installed. Run `TEST.bat`. Read measured results and limitations first.
2. Start `START_API.bat` on localhost port 8030. Connect the existing backend to `POST /task2/predict`; the same function is `src.inference.predict(payload)` for a Python integration. The standalone service defaults to localhost and has no public-hosting claim. Add an authenticated same-origin proxy if exposing it beyond the laptop. Never grant browser clients authority to declare fabricated measurements as trusted feeds.
3. Read a real request from `examples/A_normal.json` under `input`, and its verified response under `prediction`. Keys: station, pollutant (`pm25`/`pm10`), timezone-aware whole-IST-hour cutoff, optional excluded_station for evaluated fold, observations, optional weather. Every observation carries station, pollutant, timestamp, available_at, value, category=`MEASURED`, units=`ug/m3`. Pass only measurements genuinely available by cutoff. Unknown coordinates/unsupported pollutants are rejected.
4. Provide at most six hours of recent observations at known station IDs. Spatial ML and IDW use donors aged at most two hours; persistence uses target history aged at most six hours. Entirely withheld station history is ignored. Minimum two donor stations and geographic gates apply. Never replace unavailable values with zero or external atmospheric model predictions.
5. If the selected artifact needs weather, use ERA5 at exactly floor(cutoff UTC hour) minus 120 days, correct station weather_grid, source=`ERA5` and the seven variables in src/features.py, with downloaded units (temperature C, humidity %, wind m/s and degrees, precipitation mm, pressure hPa). Wrong/missing weather is flagged and handled by training-only median/missing-indicator preprocessing. Actual candidate selection may choose no-weather; inspect metadata.
6. API responses carry FORECAST_ML, pollutant/units, cutoff, next-hour target_time, interval, reliability, donor count/age/distance, model version and baseline values. Plot actual timestamped points and preserve gaps. Do not produce official AQI from these two single-hour outputs. Do not present estimates as measured readings.
7. Use only the five coordinate-verified Pune stations for this package. Eight supplied station IDs, including PCMC locations, have no validated spatial mapping here. This does not establish unknown-coordinate accuracy. Existing 24h station-history models remain separate and unchanged.
8. For historical demos, run `demos.py` or load its four JSONs. Independent target truth is stored outside the prediction input. Label historical replay and deliberate sensor loss explicitly. Whole-location demonstrations must choose the correct excluded_station artifact, never the network model.
9. Connect planner output via `src.planning.analyze(prediction, actions, budget)`. Actions require `id`, nonnegative `cost`, `fraction` in [0,1], and `source`. Supply justified real planner assumptions; the bundled illustration is mathematical only. Use returned feasible subsets, original-package feasibility and changes across uncertainty/budget/action scenarios. This does not infer causal policy effects.
10. Models are local Python sklearn pipelines. Static browser hosting cannot execute joblib artifacts. A Python inference service is needed; no ONNX conversion or browser-only performance is claimed.

Example service call in the existing backend:

```python
import httpx, json
case = json.load(open('examples/A_normal.json'))
response = httpx.post('http://127.0.0.1:8030/task2/predict', json=case['input'], timeout=30)
response.raise_for_status()
prediction = response.json()
```

Before merging any teammate integration, run existing AeroMatrix tests/build, verify map interaction, themes/navigation, simulator, data imports and AeroSage remain functional. This package deliberately does not edit those features, and their final integrated browser regression is outside this model-only verification.
