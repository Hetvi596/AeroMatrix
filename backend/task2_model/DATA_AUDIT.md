# Audit of the exact supplied CSV

- SHA-256: `ac9539b656390d879e2386f9c65dd296f3c77b3199964d9153b122ff1c47162d`
- Actual rows: **1,820,868**, not the approximate 1.1 million.
- Stations: **13**; pollutant labels: **14**.
- Raw timestamps: **2020-11-13 14:00:00 to 2025-09-01 23:00:00**; no explicit timezone. Asia/Kolkata interpretation documented.
- Explicit null fields: **0**. Invalid timestamps: **0**. Nonfinite values: **0**. Negative values: **0**.
- Exact duplicate rows: **0**. Duplicate station/pollutant/timestamp keys: **0**.
- PM2.5: **185,369** and PM10: **186,955** unique valid concentration records in µg/m³.
- No coordinate or weather columns are present. Five coordinates were independently matched to official station metadata; eight remain excluded from spatial experiments.
- No null cells does not mean continuous coverage: missing hourly timestamps and irregular gaps are counted separately in audit.json.
- No positive outliers were silently discarded. Large values remain in independent reference labels.

## Actual schema

`station_id, station_name, state_name, city_name, parameter_name, unit, collected_at, value, source`

## Pollutant labels and rows

| Label | Rows | Units |
|---|---:|---|
| Benzene | 168,489 | µg/m³ |
| Ozone | 170,423 | µg/m³ |
| PM2.5 | 185,369 | µg/m³ |
| PM10 | 186,955 | µg/m³ |
| NO2 | 162,048 | µg/m³ |
| NO | 160,952 | µg/m³ |
| NOx | 162,056 | ppb |
| CO | 161,156 | mg/m³ |
| MP-Xylene | 150,403 | µg/m³ |
| SO2 | 78,088 | µg/m³ |
| Eth-Benzene | 87,187 | µg/m³ |
| Toluene | 80,004 | µg/m³ |
| Xylene | 17,722 | µg/m³ |
| NH3 | 50,016 | µg/m³ |

## Station spatial eligibility

| ID | Name | Eligibility |
|---|---|---|
| site_5404 | Mhada Colony, Pune - IITM | Coordinate unavailable; excluded |
| site_5406 | Bhosari, Pune - IITM | Coordinate unavailable; excluded |
| site_5408 | Transport Nagar-Nigdi, Pune - IITM | Coordinate unavailable; excluded |
| site_5409 | Revenue Colony-Shivajinagar, Pune - IITM | Verified coordinate; used |
| site_5407 | Hadapsar, Pune - IITM | Verified coordinate; used |
| site_5764 | Park Street Wakad, Pimpri Chinchwad - MPCB | Coordinate unavailable; excluded |
| site_5765 | Thergaon, Pimpri Chinchwad - MPCB | Coordinate unavailable; excluded |
| site_5766 | Katraj Dairy, Pune - MPCB | Verified coordinate; used |
| site_5763 | Gavalinagar, Pimpri Chinchwad - MPCB | Coordinate unavailable; excluded |
| site_5988 | Bhumkar Nagar, Pune - IITM | Coordinate unavailable; excluded |
| site_5996 | Panchawati_Pashan, Pune - IITM | Verified coordinate; used |
| site_5998 | Savta Mali Nagar, Pimpri-Chinchwad - IITM | Coordinate unavailable; excluded |
| site_6012 | Dhankawadi, Pune - IITM | Verified coordinate; used |

## Support assessment

The five verified locations have overlapping historical observations sufficient for the executed chronological and whole-station experiments, but some holdout development sets are small. Model train counts range from hundreds to thousands after donor availability and chronological restrictions; they are not the raw long-format row count. Geography, publication timing, current weather and intervention-response information remain limited. See the checklist before interpreting the result as operational validation.