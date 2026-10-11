# AeroSage integration report

Date: 10 Oct 2026. Branch: `twin-redesign` (uncommitted working copy; nothing committed or pushed).

## What was integrated

| Part | Where | How |
|---|---|---|
| Chatbot backend (FastAPI, RAG, sessions) | `backend/chatbot/` | Copied from the AeroMatrix AI chatbot package, own `.venv` (Python 3.14.2, pinned requirements), `.env` from `.env.example`. Port 8010, loopback only. |
| AeroSage React module | `src/aerosage/` | `components/`, `hooks/`, `services/`, `styles/aerosage.css`, `assets/avatar/`, `types.ts` from the AeroSage voice and avatar package. The demo app (`demo.tsx`, `demo.css`, `dist/`) was not copied. |
| Host component | `src/aerosage/AeroSageHost.tsx` | The only `AeroSageChat` instance, mounted once in `App.tsx` inside the map stage with `initiallyOpen={false}`. It stays mounted across sections, so the conversation persists when you navigate or minimize. |
| Host styles | `src/aerosage/styles/aerosage-host.css` | Placement plus a Cherry Cola / Vanilla Cream theme, scoped to `.aerosage-host`. The module CSS is unchanged. The AeroSage character is unchanged. |

## Layout (bottom-right, collision-aware)

- **Launcher**: one pill showing the AeroSage character (tooltip "Ask AeroSage").
  - Placed 64 px above the map's bottom edge, so it sits above the cursor readout and the Cesium attribution.
  - Its `right` follows the right column (`--dock-right`), so it moves beside an open details drawer or Plan-It card instead of covering them.
  - On phones and small tablets it is icon-only and sits in line with the orbit button. It is hidden while the Plan-It sheet is open on phones.
- **Open, ≥ 1024 px**: the panel docks in the right column, 420 px wide (440 px at ≥ 1600 px), at full map height, beside any drawer or Plan-It card.
  - The stage variable `--assist-inset` moves the camera toolbar, search and readouts aside, the same mechanism the details drawer uses.
  - When the remaining map strip would be narrower than 320 px, the section panel folds away and comes back when AeroSage closes. A section panel you open yourself afterwards is left open.
  - Beside a drawer or Plan-It, the legend moves under the search box (its phone position).
  - The cursor hint hides below 1600 px while AeroSage is docked.
- **Open, < 1024 px**: a bottom sheet (`min(88dvh, 100%)`) with a safe-area inset.
  - The composer is pinned (sticky) at the bottom, and the panel scrolls when space is short.
  - The text input is 16 px so phones don't zoom into it.
  - The viewport meta now includes `interactive-widget=resizes-content`, so the on-screen keyboard resizes the layout.
- The map is not resized; the panel overlays it the same way the existing drawers do. No page reload happens on open or close.

## Context sent to the chatbot (`buildContext`)

Only fields that come from real app state are sent:

- `selected_pollutant`
- `active_section` (the section's label)
- `selected_station` / `selected_region`, from the selected station, the searched place or the selected zone's place name
- `map_location`, only for an actual selection: the station's or place's OpenStreetMap point, or the zone centre
- `selected_factory`, labelled as an illustrative source
- `scenario_id` and `scenario_description`, from the active scenario's real summary, labelled hypothetical

`dashboard_time` is never sent, because the backend deliberately withholds date-specific values.

## App commands (verified)

The module's allowlisted parser and `existingTwinAdapter` run against the real store.

- **Store contract**: checked against `useTwinStore.ts`. `setSection`, `setPollutant`, `toggleLayer('heatmap')`, `updateDraft`, `runDraft`, `resetDraft`, `setDisplayMode` and `requestFlyTo` all exist with matching signatures.
- **Host wrapper**:
  - Opening a section also opens the section panel.
  - Focusing a known locality uses `goToPlace`, which highlights it and shows its current value.
  - Region names come from OSM-verified places, station names and the app's locality centres. No coordinates are invented.
- **Every outcome is checked against the store** (section, pollutant, heatmap layer, `trafficMultiplier`, active result matching the draft, draft at baseline, display mode, fly-to request). A mismatch is reported as "The application did not confirm this change".
- **Running a scenario** reports the engine's actual grid-mean PM2.5 before → after, labelled hypothetical.
- **Confirmation**: scenario changes, run and reset still require Confirm. Cancel makes no change (tested).
- **Two parser patterns added**:
  - "show / open / turn on the heatmap"
  - "show / open industrial areas / industries"

## Data: one source of truth

The chatbot's pollution answers now use the same data and precedence as the dashboard:

1. The ML backend first (unchanged).
2. For a current request the ML backend can't answer (its bundled readings are historical), Open-Meteo CAMS model data at the place's coordinates.

This comes from a new `backend/chatbot/integrations/open_meteo_adapter.py`:

- **Coordinates**: from `metadata/verified_places.json`, a mirror of the app's `verifiedPlaces.ts` with a parity test. For a selected zone or locality, the app's `map_location` is used. Mhada Colony and unknown places get no value.
- **Labels**: answers say "Model data (Open-Meteo CAMS global model at this place; not a station measurement)", plus the reference point and model grid point.
- **AQI**: estimated with the CPCB rules from the model's 24 h series and labelled "not an official station AQI". The Python port matches the ML backend's `preprocessing/aqi.py` exactly on 40 random cases.
- **What stays unchanged**:
  - Historical requests (`allow_historical`) still go only to the ML backend.
  - Forecasts still come only from the ML backend.
  - Disable the adapter with an empty `OPEN_METEO_AIR_QUALITY_URL`.

Verified live against the running services: "What is PM2.5 in Shivajinagar?" returned 39.2 µg/m³ model data, and the Hadapsar estimated AQI was 96. These are the same values the dashboard showed for those places at 22:30 IST.

Knowledge: one curated document, `knowledge_base/app_features_2026_10.md`, was added to the hash-checked manifest. It covers current model data, the precedence rules, Plan-It and AeroSage. The router now treats "Plan-It", "AeroSage" and "Open-Meteo" as project questions.

## Fixes made while integrating

- `ConversationPanel.tsx`: the scroll effect returned `scrollIntoView(...)`, which current Chrome returns a value from. React then crashed ("destroy is not a function") whenever the panel closed. Braces added.
- `chatbotAdapter.ts`: a network failure now says the service isn't reachable and how to start it, and that no answer was generated. The module test was updated to match.
- `AeroSageChat.tsx`: additive `onOpenChange` prop, and the launcher shows the character with an "Ask AeroSage" tooltip.
- Live data:
  - The first refresh now starts from a store subscription instead of a timer.
  - A shared cached request can no longer be cancelled by one caller. Under React StrictMode this had left the status on "Loading" forever.
  - Provider errors show as "Model data unavailable" plus the reason, never as "Loading".
  - To save Open-Meteo quota, a refresh asks for zone centres and verified places only. Other localities are fetched when you select one, and the last response is reused across reloads for 15 minutes.

## Tests actually run

| Test | Result |
|---|---|
| Frontend `npm test` (Vitest) | **154 passed** (18 files), including the module's 37 tests now running inside the app |
| TypeScript `tsc` | passed |
| Production `npm run build` | passed |
| Chatbot `pytest tests` | **49 passed**: the shipped 43 plus 6 new ones (recorded real Open-Meteo response, CPCB parity, coordinate resolution, precedence, disabled adapter, historical stays on the ML backend) |
| A. Launch | One launcher, no panel. Verified in the browser at 1920×1080, 1366×768, 1024×640, 390×844 and 360×640. |
| B. No overlap | An automated check marks any control whose centre is covered by AeroSage. Run on Overview, Air Quality, Zones, Industries, Actions, What-If and Sites, plus combinations with the zone drawer and Plan-It, at 1366×768 and 1920×1080: **0 covered controls**. The legend, camera toolbar and section panels never overlap, with one exception listed under limitations. |
| C. Open | Character, welcome text, suggestions, context line, connection status, composer, microphone, voice toggle, language, Clear and Minimize all render. |
| D. "What is AeroMatrix?" | A real backend reply: verified knowledge excerpts with sources and a warning that no LLM is configured. |
| E. "Explain machine learning." | The backend honestly reported "Language model is not configured." No Gemini key was provided, so **Gemini was not tested**. |
| F. Project data | Pollution questions returned Open-Meteo model data with time, units, reference point and the "not a station measurement" label. A forecast request returned an honest "unavailable". |
| G. Microphone | **Not tested with a real microphone.** The browser pane exposes `SpeechRecognition`; the module's lifecycle tests (with mocked engines) pass. |
| H. Spoken replies | **Not tested audibly.** The pane was hidden, and the module deliberately doesn't speak while the page is hidden. Voices installed here: English (UK) only, no Hindi voice, so Hindi output would report a missing voice. |
| I. Navigation | "Open the What-If simulator" and "Open industrial areas" changed the section, confirmed in the DOM. |
| J. Scenario | "Reduce traffic by 20 percent" (confirmed) set traffic to 0.8. Run and reset (confirmed) worked. "Show the difference" switched the map to Δ Change. Cancel left everything unchanged. |
| K. Layout with maps, charts and What-If | See B. The Insights charts sit below the map stage and are never covered. |
| L. Minimize | The panel closes and the launcher returns. A folded section panel comes back. Listening and speech stop (module behaviour; not tested with real audio). |
| M. Backend stopped | The panel showed "BACKEND OFFLINE", the error state and an error message, with no answer generated. |
| N. Regression | The map, Current, Baseline, Scenario and Change views, Overview tables, Plan-It (generate, Plan A) and the What-If panel all still work. No console errors in the final runs. |

## How to start

```bat
RUN_AEROMATRIX.bat
```

This starts the model API (8000), **the AeroSage API (8010)**, the app (5173) and the landing page (3000). On first run it sets up the chatbot's `.venv` and `.env` using `SETUP_CHATBOT.bat`. Manual start: `backend\chatbot\START_CHATBOT.bat`. The app reads `VITE_CHATBOT_API_URL` (default `http://127.0.0.1:8010`). CORS in `backend/chatbot/.env` allows localhost and 127.0.0.1 on 5173, 5174, 4173 and 3000.

**Gemini**: put `GEMINI_API_KEY=...` in `backend/chatbot/.env` only, then restart the chatbot. Never put it in a `VITE_` variable or React code.

## Remaining limitations

- No LLM key is configured, so general questions aren't answered. Project questions return verified excerpts in English, not synthesized answers. Hindi and Hinglish answers need a working model.
- Real microphone, audible speech and cross-browser checks were not run. A Hindi voice isn't installed on this PC.
- Open-Meteo's free tier counts every coordinate as an API call. Heavy reloading during testing hit the hourly limit (HTTP 429), which the app now shows honestly; it resets within the hour. A refresh now uses about 113 coordinates and reloads reuse the last response for 15 minutes, but many simultaneous viewers could still hit the limit.
- At ≤ 1440 px, if you deliberately reopen the section panel while both the details drawer and AeroSage are open, the map strip is very narrow and the legend can sit partly behind AeroSage. Closing either panel restores it. That panel is not force-closed, to respect your choice.
- The open panel overlays the map. The Cesium canvas is not resized, matching how the existing drawers work.
- Command coverage is the module's allowlist: forecast-time selection, chart highlighting and nearest-industry filtering have no handlers and are reported as unsupported.
- What-If results are hypothetical outputs of the prototype rule engine.
- Mhada Colony has no verified location and gets no current value.

## Files

**Added**
- `backend/chatbot/`: the full chatbot package, plus:
  - `integrations/open_meteo_adapter.py`
  - `metadata/verified_places.json`
  - `knowledge_base/app_features_2026_10.md`
  - `tests/test_open_meteo_adapter.py` and `tests/fixtures/`
- `src/aerosage/`: module files, `AeroSageHost.tsx`, `styles/aerosage-host.css`, `__tests__/` (the module's tests with adjusted paths)
- `AEROSAGE_INTEGRATION_REPORT.md`

**Modified in the chatbot package**
- `chatbot/config.py`: `open_meteo_url` setting
- `chatbot/chat_engine.py`: uses the adapter; source type `open_meteo`
- `chatbot/intent_router.py`: project keywords
- `integrations/pollution_data_adapter.py`: fallback plus labels
- `metadata/knowledge_manifest.json`
- `tests/test_chatbot.py`: offline fixture sets `open_meteo_url=''`
- `.env.example`

**Modified in the module**
- `components/AeroSageChat.tsx`: `onOpenChange`, launcher
- `components/ConversationPanel.tsx`: effect fix
- `services/aeromatrixActions.ts`: two patterns
- `services/chatbotAdapter.ts`: offline message
- `__tests__/chatbot.test.ts`, `__tests__/render.test.tsx`

**Modified in the app**
- `src/App.tsx`: mount, `data-assistant`, live-data start
- `src/index.css`: right-column variables, legend and readout rules
- `src/map/CesiumMap.tsx`: `cursor-readout` class
- `index.html`: viewport meta
- `src/services/openMeteo.ts`, `src/services/liveData.ts`, `src/services/liveData.test.ts`: quota and cancellation fixes
- `src/components/LivePanels.tsx`, `src/components/StationPanels.tsx`: error wording
- `RUN_AEROMATRIX.bat`: AeroSage service
- `.env.example`: `VITE_CHATBOT_API_URL`
