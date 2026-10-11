# Export verification

Status: **PASS**. Executed 2026-10-10T07:05:46.874594+00:00 on Windows with Python 3.12.10 (64-bit).

The candidate ZIP was extracted into a separate verification directory. Its own fresh `.venv` was created from the locked requirements; no original-project Python environment was used. `TEST_MODEL_API.bat` successfully invoked `START_MODEL_API.bat`, and the verifier made real HTTP requests to that independently running API. Only the test-created server process tree was stopped afterward.

- **517 assertions passed**.
- All **12 artifact SHA256 hashes** matched, and model files remained unchanged after startup and inference.
- **119 station-pollutant HTTP predictions** matched both direct inference from the extracted artifacts and reference predictions made from the original full cleaned dataset.
- Maximum absolute numerical difference: **5.684341886080801e-14** (floating-point roundoff; required tolerance 1e-8).
- Hadapsar, Alandi and Shivajinagar resolved to their actual station histories and produced distinct PM2.5 predictions.
- Stale bundled observations are unavailable by default; historical review requires explicit opt-in.
- Kothrud concentration forecasts, unsupported SPM and unmonitored spatial requests correctly returned unavailable; Kothrud source-reported historical AQI remained available separately.
- Real POST history reproduced the original artifact prediction; entirely missing weather columns remained missing and were handled by the fitted imputer.
- Wrong units and duplicate timestamps were rejected. Measured and predicted responses retained separate source labels.
- AQI minimum-pollutant and minimum-hour requirements, CPCB boundary values, severe lower bounds and unsupported high-ozone handling passed checks.
- Boundary, industry, district-emission, station-list and CORS endpoints passed.
- Inference modules contain no fit/fit_transform/partial_fit calls; all application imports resolve inside the extracted package.
- Windows launcher fallback was tested: this PC's `py` launcher does not resolve its Python installation, and both scripts successfully fell back to `python`.

Evidence: `verification/results.json`, `verification/prediction_comparisons.json`, `RESPONSE_EXAMPLES.json` and the actual `verification/real_history_request.json`.

The delivered package preserves byte-identical tested application, preprocessing, model, data and startup files. Only generated evidence/documentation are added after the test. The final ZIP is extracted and tested again before delivery; the external delivery receipt records its hash and that last verification result.

Not claimed: execution on the teammate's physical laptop, integration of their separately developed frontend, a live measurement connector, verified station coordinates, unmonitored spatial forecasting, complete industrial coverage, high-ozone one-hour AQI handling, or causal intervention validation. Initial dependency installation requires internet; subsequent inference is offline.
