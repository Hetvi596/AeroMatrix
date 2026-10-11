"""CPCB National AQI: concentration subindices, not concentration-as-AQI.

Reference: https://airquality.cpcb.gov.in/ccr_docs/FINAL-REPORT_AQI_.pdf
Table 3.11 and https://airquality.cpcb.gov.in/ccr_docs/About_AQI.pdf
Open-ended severe concentrations report a bound (>=401), not an invented upper
breakpoint. Ozone above 208 requires the separate one-hour rule; unavailable here.
For CO/O3 this implementation conservatively requires all 8 hourly observations
in the trailing 8-hour window, plus 16 valid hours in the trailing 24 hours.
"""
from __future__ import annotations
import math
import pandas as pd

INDEX = [(0,50),(51,100),(101,200),(201,300),(301,400)]
BANDS = {
    'pm25': [(0,30),(31,60),(61,90),(91,120),(121,250)],
    'pm10': [(0,50),(51,100),(101,250),(251,350),(351,430)],
    'no2': [(0,40),(41,80),(81,180),(181,280),(281,400)],
    'so2': [(0,40),(41,80),(81,380),(381,800),(801,1600)],
    'co': [(0,1),(1.1,2),(2.1,10),(10.1,17),(17.1,34)],
    'o3': [(0,50),(51,100),(101,168),(169,208)],
    'nh3': [(0,200),(201,400),(401,800),(801,1200),(1201,1800)],
    'pb': [(0,.5),(.6,1),(1.1,2),(2.1,3),(3.1,3.5)],
}

def subindex(pollutant, concentration):
    if pollutant not in BANDS or not math.isfinite(concentration) or concentration < 0: return None
    # Resolve the discrete printed concentration bands by rounding to the table's precision.
    step = 10 if pollutant in ('co','pb') else 1
    c = math.floor(concentration*step+.5)/step
    for (low, high), (ilo, ihi) in zip(BANDS[pollutant], INDEX):
        if low <= c <= high: return {'value': int(math.floor(ilo+(ihi-ilo)*(c-low)/(high-low)+.5)), 'bounded': False}
    if pollutant == 'o3': return None
    return {'value': 401, 'bounded': True}

def category(value):
    return next(label for ceiling, label in [(50,'Good'),(100,'Satisfactory'),(200,'Moderate'),(300,'Poor'),(400,'Very Poor'),(math.inf,'Severe')] if value <= ceiling)

def calculate_aqi(hourly, end=None):
    if hourly.empty: return {'status': 'UNAVAILABLE', 'reason': 'No hourly observations', 'value': None, 'subindices': {}}
    df = hourly.copy()
    # Input timestamps label the beginning of each completed hourly mean.
    # Calculate/report the trailing window at the end of those hours.
    df['time'] = pd.to_datetime(df['time'], utc=True)+pd.Timedelta(hours=1)
    end = pd.Timestamp(end) if end is not None else df.time.max()
    if end.tzinfo is None: raise ValueError('AQI endpoint requires timezone-aware time')
    window = df[(df.time > end-pd.Timedelta(hours=24)) & (df.time <= end)].set_index('time')
    # A single station only. Never merge different station concentrations into an observed AQI.
    if 'station' in window and window.station.nunique() > 1: raise ValueError('AQI requires one station')
    indices, coverage, excluded = {}, {}, {}
    for p in BANDS:
        if p not in window: continue
        series = window[p].resample('h').mean().dropna()
        coverage[p] = len(series)
        if len(series) < 16:
            excluded[p] = 'Fewer than 16 valid hourly observations in 24h'; continue
        averaging = series[series.index > end-pd.Timedelta(hours=8)] if p in ('co','o3') else series
        if p in ('co','o3') and len(averaging) < 8:
            excluded[p] = 'Incomplete trailing 8h average'; continue
        value = float(averaging.mean()); index = subindex(p, value)
        if index is None:
            excluded[p] = 'Unsupported concentration range or one-hour ozone rule required'; continue
        indices[p] = {**index, 'concentration': value, 'averaging_hours': 8 if p in ('co','o3') else 24}
    ozone_unsupported = excluded.get('o3', '').startswith('Unsupported')
    eligible = len(indices) >= 3 and bool({'pm25','pm10'} & indices.keys()) and not ozone_unsupported
    dominant = max(indices, key=lambda p: indices[p]['value']) if indices else None
    bounded = any(s['bounded'] for s in indices.values())
    value = indices[dominant]['value'] if eligible else None
    return {'status': ('LOWER_BOUND' if bounded else 'AVAILABLE') if eligible else 'UNAVAILABLE',
            'value': value, 'category': category(value) if value is not None else None,
            'dominant_pollutant': dominant if eligible and not bounded else None,
            'reason': None if eligible else ('Ozone requires the separate one-hour rule; overall AQI withheld' if ozone_unsupported else 'Requires at least three eligible pollutants including PM2.5 or PM10'),
            'subindices': indices, 'coverage_hours': coverage, 'excluded': excluded, 'period_end': end.isoformat(),
            'method': 'CPCB National AQI; measured hourly data; conservative eight-hour completeness'}
