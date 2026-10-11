# Actual Task 2 results

Input: 1,820,868 rows; 13 station IDs; no duplicates. PM2.5: 185,369 and PM10: 186,955 valid unique target observations. Spatial experiments use five coordinate-verified Pune stations; eight stations, including the PCMC locations, are excluded from spatial evaluation.

One-hour forecasts. Training labels end before 2024-10-01; selection October–November 2024; calibration December 2024–January 2025; test starts 2025-02-01 and runs to the last available station label, at most 2025-09-01.

## Network forecast: same eligible targets, no additional loss, seed 17

| Pollutant | Method | Cases | MAE | RMSE | R² | Interval coverage |
|---|---|---:|---:|---:|---:|---:|
| pm25 | ml | 10703 | 13.908 | 19.718 | -0.262 | 0.993 |
| pm25 | idw | 10703 | 15.433 | 20.775 | -0.401 | — |
| pm25 | persistence | 10703 | 3.489 | 7.452 | 0.820 | — |
| pm10 | ml | 10781 | 26.611 | 38.972 | -0.261 | 0.990 |
| pm10 | idw | 10781 | 23.247 | 32.769 | 0.109 | — |
| pm10 | persistence | 10781 | 7.107 | 15.391 | 0.803 | — |

Errors and intervals are in ug/m3. A negative R² or improvement is retained honestly. No claim that ML always beats baselines.

## Actual model training counts

| Model | Unique target records | Feature rows including 30% donor-mask augmentation | Algorithm |
|---|---:|---:|---|
| pm25_network | 5359 | 10420 | extra_trees_no_weather |
| pm25_site_5409 | 483 | 911 | extra_trees_no_weather |
| pm25_site_5407 | 3603 | 7001 | hist_gradient_boosting_no_weather |
| pm25_site_5766 | 665 | 1284 | hist_gradient_boosting_delayed_weather |
| pm25_site_5996 | 1868 | 3578 | extra_trees_no_weather |
| pm25_site_6012 | 5359 | 10420 | extra_trees_no_weather |
| pm10_network | 5134 | 9992 | hist_gradient_boosting_no_weather |
| pm10_site_5409 | 510 | 965 | extra_trees_no_weather |
| pm10_site_5407 | 3633 | 7055 | hist_gradient_boosting_no_weather |
| pm10_site_5766 | 668 | 1290 | hist_gradient_boosting_no_weather |
| pm10_site_5996 | 1655 | 3174 | extra_trees_no_weather |
| pm10_site_6012 | 5134 | 9992 | hist_gradient_boosting_no_weather |

## Whole-station holdouts

| Excluded station | Pollutant | Test cases | MAE | Coverage |
|---|---|---:|---:|---:|
| site_5409 | pm25 | 2850 | 34.034 | 0.953 |
| site_5407 | pm25 | 771 | 26.634 | 0.996 |
| site_5766 | pm25 | 2941 | 11.094 | 0.997 |
| site_5996 | pm25 | 2978 | 7.626 | 1.000 |
| site_6012 | pm25 | 1216 | 9.240 | 0.997 |
| site_5409 | pm10 | 2843 | 50.825 | 0.990 |
| site_5407 | pm10 | 837 | 48.011 | 0.978 |
| site_5766 | pm10 | 2880 | 17.831 | 0.995 |
| site_5996 | pm10 | 3018 | 14.411 | 1.000 |
| site_6012 | pm10 | 1257 | 16.471 | 0.999 |

Persistence is unavailable for a completely unseen station because its pollution history is excluded. ML/IDW are compared on identical common spatial cases; the three-way unseen cohort is empty and is not presented as a successful experiment.

Full 0/10/30/50/70% loss results, three seeds, random/12-hour block/full-station outages, sample counts, availability and row-level predictions are included in evaluation/. Full-station percentages are nominal: with five stations they round to discrete counts. The 70% full-station case leaves one donor and triggers abstention.

## Limitations

Historical timezone/interval-end interpretation is an explicit assumption; original publication latency is absent. This is not a verified real-time deployment backtest. Final ERA5 has a conservative 120-day delay; exact historical archive vintages are unavailable. Weather is coarse reanalysis, not independent measured station weather. Current-era weather is not used.

Model selection includes a no-weather alternative. Weak weather candidates are not selected just to claim weather use. Geographic coverage is limited. Calibration is marginal and empirical coverage can be substantially below 90% under unseen locations or outages. No official AQI or causal intervention effectiveness is inferred. Planning evidence is an explicitly hypothetical sensitivity calculation; no validated intervention costs or effects were supplied.