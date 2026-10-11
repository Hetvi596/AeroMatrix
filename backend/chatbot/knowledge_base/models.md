# Pollution models training evaluation and reliability

Models predict an hourly mean 24 hours ahead at supported monitoring stations. Training used lagged and rolling pollutant history, calendar features, and available observed weather. Splits were chronological with purging between splits. Fitted feature imputation uses training data only. Selection used validation performance, with final evaluation on held-out test data. These observational forecasts are not causal scenario models.

## Actual held-out metrics and training counts

### pm25
{"algorithm": "random_forest", "unit": "ug/m3", "horizon_hours": 24, "record_counts": {"source_hourly_rows": 162713, "valid_target_rows": 133193, "eligible_forecast_pairs": 116208, "train": 70133, "validation": 24423, "test": 21291, "purged": 361}, "test": {"mae": 13.043733832738045, "rmse": 23.442341470795427, "r2": 0.71252572558271, "n": 21291}, "interval": {"method": "absolute validation residual 90th percentile; not guaranteed under temporal shift", "radius": 18.998599888634793, "test_coverage": 0.8040486590578179}}

### pm10
{"algorithm": "random_forest", "unit": "ug/m3", "horizon_hours": 24, "record_counts": {"source_hourly_rows": 162713, "valid_target_rows": 131366, "eligible_forecast_pairs": 113899, "train": 69586, "validation": 22894, "test": 21055, "purged": 364}, "test": {"mae": 27.295376755389366, "rmse": 46.095874312344584, "r2": 0.6956743533359839, "n": 21055}, "interval": {"method": "absolute validation residual 90th percentile; not guaranteed under temporal shift", "radius": 35.95572081333958, "test_coverage": 0.7755402517216813}}

### no2
{"algorithm": "random_forest", "unit": "ug/m3", "horizon_hours": 24, "record_counts": {"source_hourly_rows": 162713, "valid_target_rows": 128620, "eligible_forecast_pairs": 112113, "train": 68357, "validation": 22423, "test": 20989, "purged": 344}, "test": {"mae": 6.058892308475111, "rmse": 10.581009382445226, "r2": 0.7637561699085762, "n": 20989}, "interval": {"method": "absolute validation residual 90th percentile; not guaranteed under temporal shift", "radius": 11.87797117499796, "test_coverage": 0.868454904950212}}

### no
{"algorithm": "random_forest", "unit": "ug/m3", "horizon_hours": 24, "record_counts": {"source_hourly_rows": 162713, "valid_target_rows": 127839, "eligible_forecast_pairs": 111019, "train": 67222, "validation": 22428, "test": 21027, "purged": 342}, "test": {"mae": 7.141153028285382, "rmse": 17.783049675153173, "r2": 0.5562660553645479, "n": 21027}, "interval": {"method": "absolute validation residual 90th percentile; not guaranteed under temporal shift", "radius": 6.920428957587655, "test_coverage": 0.7684881343035145}}

### nox
{"algorithm": "random_forest", "unit": "ppb", "horizon_hours": 24, "record_counts": {"source_hourly_rows": 162713, "valid_target_rows": 130218, "eligible_forecast_pairs": 114606, "train": 69615, "validation": 22589, "test": 22048, "purged": 354}, "test": {"mae": 8.639333320952208, "rmse": 17.01064852298473, "r2": 0.6577822633461698, "n": 22048}, "interval": {"method": "absolute validation residual 90th percentile; not guaranteed under temporal shift", "radius": 11.023059152820132, "test_coverage": 0.7917271407837445}}

### so2
{"algorithm": "persistence", "unit": "ug/m3", "horizon_hours": 24, "record_counts": {"source_hourly_rows": 162713, "valid_target_rows": 52554, "eligible_forecast_pairs": 44596, "train": 28631, "validation": 9262, "test": 6554, "purged": 149}, "test": {"mae": 2.654645254806225, "rmse": 8.476823872481248, "r2": -0.10057134389323985, "n": 6554}, "interval": {"method": "absolute validation residual 90th percentile; not guaranteed under temporal shift", "radius": 5.590000000000003, "test_coverage": 0.8909063167531278}}

### co
{"algorithm": "hist_gradient_boosting", "unit": "mg/m3", "horizon_hours": 24, "record_counts": {"source_hourly_rows": 162713, "valid_target_rows": 132950, "eligible_forecast_pairs": 118558, "train": 72288, "validation": 23849, "test": 22081, "purged": 340}, "test": {"mae": 0.4355332350816687, "rmse": 0.7893868866113549, "r2": 0.5284894658509189, "n": 22081}, "interval": {"method": "absolute validation residual 90th percentile; not guaranteed under temporal shift", "radius": 0.7262159599676061, "test_coverage": 0.8570716905937231}}

### o3
{"algorithm": "hist_gradient_boosting", "unit": "ug/m3", "horizon_hours": 24, "record_counts": {"source_hourly_rows": 162713, "valid_target_rows": 127381, "eligible_forecast_pairs": 105711, "train": 64746, "validation": 22853, "test": 17778, "purged": 334}, "test": {"mae": 8.952106282389863, "rmse": 14.211078651538116, "r2": 0.7006588689541299, "n": 17778}, "interval": {"method": "absolute validation residual 90th percentile; not guaranteed under temporal shift", "radius": 28.105108610917313, "test_coverage": 0.9516256046799415}}

### nh3
{"algorithm": "random_forest", "unit": "ug/m3", "horizon_hours": 24, "record_counts": {"source_hourly_rows": 162713, "valid_target_rows": 28704, "eligible_forecast_pairs": 24460, "train": 14700, "validation": 5128, "test": 4560, "purged": 72}, "test": {"mae": 5.639786285185637, "rmse": 10.456069805175659, "r2": 0.10994728070232018, "n": 4560}, "interval": {"method": "absolute validation residual 90th percentile; not guaranteed under temporal shift", "radius": 7.335642225321546, "test_coverage": 0.7986842105263158}}

### benzene
{"algorithm": "random_forest", "unit": "ug/m3", "horizon_hours": 24, "record_counts": {"source_hourly_rows": 162713, "valid_target_rows": 117924, "eligible_forecast_pairs": 103935, "train": 69741, "validation": 18276, "test": 15650, "purged": 268}, "test": {"mae": 3.080412384963802, "rmse": 10.862976261796117, "r2": 0.2616537428980992, "n": 15650}, "interval": {"method": "absolute validation residual 90th percentile; not guaranteed under temporal shift", "radius": 2.2948598835497016, "test_coverage": 0.7712460063897764}}

### toluene
{"algorithm": "hist_gradient_boosting", "unit": "ug/m3", "horizon_hours": 24, "record_counts": {"source_hourly_rows": 162713, "valid_target_rows": 95851, "eligible_forecast_pairs": 83177, "train": 49457, "validation": 17141, "test": 16363, "purged": 216}, "test": {"mae": 5.720075154752749, "rmse": 12.525531353263233, "r2": 0.5270909709940379, "n": 16363}, "interval": {"method": "absolute validation residual 90th percentile; not guaranteed under temporal shift", "radius": 5.139741883827012, "test_coverage": 0.7208947014606124}}

### xylene
{"algorithm": "hist_gradient_boosting", "unit": "ug/m3", "horizon_hours": 24, "record_counts": {"source_hourly_rows": 162713, "valid_target_rows": 41355, "eligible_forecast_pairs": 36232, "train": 24732, "validation": 6618, "test": 4813, "purged": 69}, "test": {"mae": 3.3344674494646758, "rmse": 7.345959101188972, "r2": 0.3213903884329773, "n": 4813}, "interval": {"method": "absolute validation residual 90th percentile; not guaranteed under temporal shift", "radius": 1.4026728049853538, "test_coverage": 0.5169333056305838}}

## Reliability and uncertainty
Prediction intervals are estimates based on held-out errors and their empirical coverage is not a guarantee for a particular future hour. RMSE and MAE are pollutant-specific and expressed in concentration units. R2 can be negative; SO2 is a weak persistence baseline with negative test R2, and NH3 and benzene explain little test variance. Do not convert R2 into a blanket "accuracy percentage." Reliability warnings must remain visible. A 24-hour-ahead point forecast does not supply all AQI averaging windows, so official forecast AQI is unavailable.
