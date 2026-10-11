# AeroMatrix trained inference backend

Portable backend for 24-hour forecasts at 12 monitored Pune/PCMC station locations. It includes 11 fitted ML artifacts and a separately labelled SO2 persistence baseline. All predictions use saved evaluated artifacts and actual observation histories. No training runs at startup.

1. Extract the ZIP completely into a writable folder.
2. Install **64-bit Python 3.12** with the Windows Python launcher.
3. Run `START_MODEL_API.bat`. First use installs pinned dependencies into `.venv` and needs internet. Later use is offline.
4. Open `http://127.0.0.1:8000/docs` and `http://127.0.0.1:8000/health`.
5. Run `TEST_MODEL_API.bat` for independent HTTP checks on an automatically selected free port. It stops only its own test server.

If port 8000 is occupied, set `AEROMATRIX_PORT=8010` in the same terminal before running the startup script. Stop with Ctrl+C. Installation and startup errors return a nonzero exit code; run in an existing terminal to read errors. Allow adequate disk space for the extracted models and Python environment.

**The bundled observations are historical.** A forecast without recent caller-supplied observations is unavailable by default. To inspect a clearly labelled historical prediction:

`http://127.0.0.1:8000/forecast?region=Hadapsar&allow_historical=true`

For a current forecast, submit real hourly observations to `POST /forecast`. Read `INTEGRATION_GUIDE.md` before integration. `API_CONTRACT.json` documents requests and core forecast response schemas; `RESPONSE_EXAMPLES.json` contains verified real responses. Full metrics, training counts, source file hashes and limitations are in `metadata/`.

Coverage limitations: station coordinates are absent in the supplied measurement files. Ward lookups are supported; unmonitored-location forecasts and street-level heatmaps are unavailable. Industry geometry is partial and was not used to train these artifacts. Kothrud has historical AQI, but no supported concentration forecast. SPM and Pb are unavailable. Models do not validate causal intervention effects.

Only load trusted joblib model artifacts. SHA256 checks establish bundle integrity against the shipped manifest; they are not a publisher signature. Preserve upstream source attribution and review source reuse terms before redistributing these data publicly.
