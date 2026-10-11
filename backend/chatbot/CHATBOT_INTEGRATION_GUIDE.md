# Integration guide — AeroSage intelligence backend

## Purpose and boundaries

Run this service independently beside the existing pollution inference backend and the final React/Cesium app. Preserve the existing dashboard, map, panels, animation and theme. Do not rebuild RAG, copy model inference into this service, or retrain any models. The separate AeroSage voice/avatar package imports this API; it owns the user interface and application action dispatch.

## Installation and runtime

Extract the ZIP into a writable folder. Use Python 3.12+ (tested on 3.12.10, Windows x64). `SETUP_CHATBOT.bat` creates `.venv`, installs pinned requirements and copies `.env.example` to `.env` if needed. Initial installation needs internet. `START_CHATBOT.bat` loads saved knowledge and starts FastAPI on port 8010; it performs no model training. Keep the ML service on a different port, normally 8000. Launch the UI separately, normally 5173/5174 or the voice preview's 5178.

Set `LLM_PROVIDER=gemini`, `GEMINI_API_KEY=...`, and `LLM_MODEL=gemini-3.5-flash-lite`. Gemini access is entirely server-side, via the official `generateContent` REST API and `x-goog-api-key` header. Model selection is configurable; the catalog and account access may change. No API keys belong in React, `VITE_` variables, logs, source control or ZIP files. Requests sent to Gemini contain the current question, bounded recent conversation, retrieved documentation and relevant context/tool evidence. This is a cloud service: internet is required, and the provider's terms and quotas apply. The code does not have a live web-search tool.

Optional local alternative: install Ollama from its official site yourself; explicitly run `ollama pull qwen3:1.7b` (roughly 1.4 GB weights), then set `LLM_PROVIDER=ollama`, `LLM_MODEL=qwen3:1.7b`, `LLM_BASE_URL=http://127.0.0.1:11434`. The inspected laptop has approximately 16 GB RAM and an RTX 2050 with 4 GB VRAM. This quantized Apache-2.0 model is a reasonable small candidate, but it was not downloaded or benchmarked here after the user selected Gemini. GPU use, latency and Hindi quality depend on runtime/hardware. Ollama can use CPU inference. Full offline intelligence is NOT verified. A llama.cpp or other OpenAI-compatible local server can use `LLM_PROVIDER=openai_compatible` and a `/v1` base URL; that optional provider is not live-tested.

## API and session lifecycle

`GET /health` confirms service startup (not successful LLM inference). `GET /capabilities` checks LLM model accessibility and ML backend availability, and reports limitations. `GET /knowledge/status` reports indexed chunks. `POST /chat` returns a complete reply. `POST /chat/stream` emits SSE events. `POST /session/reset` deletes a session.

First request, no session credentials:

```json
{"message":"What is AeroMatrix?","language":"en","context":{"selected_region":"Hadapsar","active_section":"map"}}
```

The response includes `session_id`, `session_token`, `answer`, `intent`, `sources`, `data_status`, `data`, `model_used`, `timestamp`, `generated_at`, `latency_ms`, and `warnings`. Credentials and dynamic values are intentionally not faked in this example. Actual sanitized test answers are in `metadata/test_results.json`.

For follow-ups, send the returned ID in the JSON body and token in the `X-Session-Token` header. A caller-supplied ID may initialize a new session but cannot read an existing session without its token. An expired session with old credentials returns 404; start a fresh session. Reset sends `{"session_id":"the-returned-id"}` to `/session/reset` with the same header. Never display or log session tokens. History is local SQLite, default 24-hour expiration and 12 turns; old records are purged when sessions are accessed. Reset removes the stored session. The bounded structured summary retains last regions, request mode, language and actual tool results. It does not synthesize new facts.

Acceptable language values: `auto`, `en`, `hi`, `hinglish`. Detail: `simple`, `normal`, `detailed`. Deterministic numerical cards translate key status labels but retain English API reasons and technical metadata. Full natural Hindi/Hinglish explanations require a working model. Retrieval-only fallback deliberately quotes original English source text and declares missing synthesis/translation.

## Pollution data and ML connection

Set `AEROMATRIX_ML_API_URL` to the existing portable backend origin. The adapter uses the verified exported routes `/health`, `/regions`, `/pollution`, `/forecast`, `/model/metrics`, and `/aqi/history`. No API key is required by that existing local ML service. No station is silently replaced by a nearby station. Supported aliases come from the verified snapshot, while live coverage requests query the actual service.

Use `{"message":"Predict historical PM2.5 in Hadapsar.","allow_historical":true}` to review archived model output. Current requests never receive historical numbers presented as live values. Forecast AQI is unavailable because a point forecast does not contain the required averaging windows. Source-reported historical Kothrud AQI is available separately; Kothrud concentration predictions are unavailable. Comparison requires equal pollutant, time, units and data status before ranking. Interval, test metric and reliability fields remain in `data`. Do not label a station value as a whole-ward measurement.

The inspected backend has no arbitrary date-range query. A request with `dashboard_time` is therefore withheld rather than substituting its latest snapshot. A trusted upstream ingestion workflow must supply new measured observations to the ML backend's existing POST `/forecast`; chat context is never accepted as verified readings. Full raw historical trends are not exposed by this adapter. Extend a stable read-only endpoint if the final backend later offers them.

## React and Cesium context

Reuse `frontend_integration/aeroai.ts` in an existing panel, or import the separate AeroSage voice UI. Mounting the optional unstyled example is not required. Render answer strings as text; do not execute model-provided HTML or use `dangerouslySetInnerHTML` on responses. Display status, sources, time, historical flag, errors and warnings alongside answers.

Optional context fields are `selected_region`, `selected_station`, `selected_pollutant`, `dashboard_time`, `scenario_id`, `scenario_description`, `active_section`, `selected_factory`, `graph_description`, and `map_location` (`longitude`, `latitude`, optional `zoom`). Pass selection from Cesium/store events; do not scrape the screen or imply a model can see the displayed map. Graph descriptions and scenario text remain unverified user context. Numerical graph explanation requires a trusted backend data contract.

## Application actions and scenarios

This backend does not execute operating-system or application state commands. The voice/UI package parses supported user commands, validates an allowlist and invokes the host application's action adapter. Only that layer can change map selection or scenario settings. The inspected simulator is a frontend prototype, not a backend endpoint. To explain stored scenario results, optionally implement a service with `GET /scenarios/{scenario_id}` returning `{"status":"MODELED_SCENARIO","explanation":"Actual result explanation supplied by your simulator","assumptions":[]}` and set `AEROMATRIX_SIMULATION_API_URL`. This is an explicit integration contract, not a claim such an endpoint already exists. Results remain hypothetical. Without it the assistant provides conceptual explanations and no invented effect percentages.

## Streaming, cancellation and errors

The SSE route yields `status`, then keepalive comments while the response is prepared, then `delta` chunks, then a full `done` reply including credentials. It is buffered answer delivery, NOT native token streaming from Gemini. SSE `error` events contain safe messages. Abort the browser fetch to cancel. Use the included client parser or the complete `/chat` response. The voice module intentionally speaks a complete answer to avoid duplicate playback. A disconnected client can cancel streaming work; cancelling an ordinary HTTP request cannot guarantee the remote provider stops billing/processing an already sent request.

Provider timeouts, quota failures, invalid response bodies, empty generations, missing models and missing ML services produce honest errors/fallbacks. No provider exception includes the API key or raw provider error body. Input size, message length, response size and request rate are bounded. CORS accepts explicit origins only. Remote provider URLs require HTTPS; redirects are not followed. User text cannot supply a service URL. Retrieved documents are separated from trusted instructions; numeric source/citation checks reject some hallucinations. This reduces risk but does not make generative grounding infallible.

## Deployment and security

Keep loopback binding for a local demo. For hosted use, put an authenticated server proxy in front of this service and configure `CHATBOT_API_KEY`; the service requires a key for non-loopback binding. Do not embed that service key in public frontend code. Use exact `CHATBOT_CORS_ORIGINS` values for the actual frontend. Run one worker: in-process per-session locks and rate limits assume a single service process. SQLite is appropriate for the hackathon, not a horizontally scaled deployment. No secrets, conversation database or installed packages are part of the export.

## Knowledge maintenance

`knowledge_base/` contains curated project facts, environmental definitions, model evaluation summaries and limitations. `metadata/knowledge_manifest.json` records document hashes and original relative source references/hashes. At startup the FTS5 index is rebuilt from manifest-matching files. Tampered or missing files are skipped. To deliberately update knowledge, review the text, update its SHA256 in the manifest, and restart. No embedding download, training, or paid indexing API is needed. Original project files and directories are not needed at runtime.

## Verification checklist and known pending checks

Run `TEST_CHATBOT.bat`; inspect `runtime/service_test_results.json`. Unit/provider tests use clearly labeled protocol mocks where appropriate and are not LLM quality tests. Real ML integration and portability evidence is supplied separately. Live general-purpose answer quality, English/Hindi/Hinglish fluency, and Gemini latency are NOT_RUN until a key is configured and those responses are reviewed. Browser microphone/TTS and final teammate frontend action checks belong to the voice module and remain environment-dependent. Never relabel missing-service tests as passing general intelligence tests.

Official references: https://ai.google.dev/gemini-api/docs/models ; https://ai.google.dev/gemini-api/docs/text-generation ; https://ai.google.dev/gemini-api/docs/structured-output ; https://ollama.com/library/qwen3:1.7b ; https://docs.ollama.com/api/chat .
