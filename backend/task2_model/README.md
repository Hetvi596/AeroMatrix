# AeroMatrix Task 2 — missing sensors and unseen locations

Independent model/evaluation package. The existing website is unchanged. This package supersedes the canceled six-horizon/UI tasks: it provides validated one-hour PM2.5 and PM10 spatial forecasts, whole-station holdouts, loss experiments, uncertainty and evidence.

Run `SETUP.bat`, then `TEST.bat`. Run `.venv\Scripts\python.exe demos.py` to regenerate four actual-data demonstrations. `START_API.bat` serves the optional model API on `http://127.0.0.1:8030/docs`.

Read `TRAINING_RESULTS.md` and `REQUIREMENTS_CHECKLIST.md` before using results. Models are research artifacts with measured limitations, not a claim of deployment readiness or reliable citywide spatial inference. The CSV contains 13 stations but only five have coordinates verified for this evaluation. PCMC spatial performance is not established.

## Reproduction

```powershell
.venv\Scripts\python.exe audit.py --csv C:\path\Pune_Pimpri_Chinchwad_Air_Quality.csv
.venv\Scripts\python.exe collect_weather.py
.venv\Scripts\python.exe train.py
.venv\Scripts\python.exe report.py
.venv\Scripts\python.exe demos.py
.venv\Scripts\python.exe -m pytest -q tests
```

The cleaned pollution cache and genuine ERA5 weather cache are included. Training can run without re-reading the 210 MB original CSV. Inference only requires trusted local model artifacts, station metadata, experiment configuration and the documented recent observations; it does not require the original CSV or any data download. Test/evaluation reproduction uses the included caches.

`train.py` saves each model immediately and checkpoints each evaluation. Use a new output directory when changing the dataset or experiment design; never reuse old model files for a different dataset. Models use joblib/pickle: load only trusted packaged artifacts.

No Gemini, paid inference service, frontend replacement or original-project imports are required. Downloading weather uses the public Open-Meteo ERA5 service for this noncommercial research workflow; deployment usage must follow provider terms. See `documentation/DATA_PROVENANCE.md`.
