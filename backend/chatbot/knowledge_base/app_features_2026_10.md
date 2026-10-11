# Features added in October 2026

These features of the final web app were added after the original knowledge snapshot and checked against the app source on 10 October 2026.

## Current air-quality model data
The dashboard shows current concentrations of six pollutants from the Open-Meteo Air Quality API, which serves output of the CAMS global atmospheric model. These are model data, not sensor readings. Each value is requested at the nearest 0.1° model point to a zone centre or a named place; the CAMS model itself resolves about 0.4°. The model grid is coarse, so neighbouring places in Pune often share the same value. Place coordinates come from OpenStreetMap; Mhada Colony has no verified point and shows no current value. Bundled readings end in January 2026 and are labelled historical. The app estimates an AQI with the CPCB breakpoint rules from the model's 24-hour concentrations and labels it an estimate, not an official AQI. Current weather from the Open-Meteo forecast API sets the What-If engine's baseline weather when no scenario is active.

## Precedence for current values
For a current value the app uses, in order: a recent reading no older than three hours, Open-Meteo model data at the place's coordinates, a trained-model forecast valid within three hours of now, and otherwise shows no number, with the reason. Missing values are never shown as zero, and historical numbers are never shown as current. No spatial interpolation is used because no validated spatial model exists.

## What-If scenarios
The What-If simulator is a rule-based prototype with illustrative coefficients. Its results are hypothetical estimates. In a zone's details the app can show a scenario applied to current data: the current value multiplied by the engine's relative change for that zone. It is always shown beside the current value and never replaces it.

## Plan-It budget planner
Plan-It finds affordable combinations of tree planting, bag-filter retrofits on industrial sources and traffic enforcement zones within a rupee budget and operational limits. It ranks feasible plans by predicted pollution reduction, reduction per rupee, or zones improved, and never relaxes the budget or limits. Costs are itemised as quantity times unit price; prices are either sourced from Indian listings with an access date or labelled estimates. Their effects come from the same prototype scenario engine and are modelled estimates. Plans can be previewed on the map, applied as the active scenario after confirmation, tested with temporary assumption changes, and exported as a PDF report.

## AeroSage assistant in the app
AeroSage is one floating assistant in the bottom-right corner of the app. It sends questions to this chatbot service and can run a fixed list of typed or spoken app commands, such as opening a section, switching pollutant, showing the heatmap, focusing a locality, setting a traffic reduction, running or resetting the scenario, and showing the scenario difference. Commands that change the scenario require confirmation, and the app checks each change before AeroSage reports it. Voice uses the browser's speech recognition and speech synthesis; speech output is off by default and the microphone starts only when tapped.
