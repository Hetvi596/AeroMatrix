"""Current air-quality model data from Open-Meteo (CAMS global), the same source the
AeroMatrix dashboard shows as "Model data".

Used only when the ML backend has no current value for a place (its bundled station
readings are historical). Values are atmospheric-model output at the nearest model grid
point, never station measurements, and every record says so. Coordinates come from
metadata/verified_places.json (OpenStreetMap reference points, mirrored from the app) or
from the app's own map_location for the selected region; nothing is guessed.
AQI is an estimate using the CPCB breakpoints on the model's 24 h concentrations.
"""
import json
import math
import time
from datetime import datetime, timezone
import httpx

VARIABLES = {'pm25': 'pm2_5', 'pm10': 'pm10', 'no2': 'nitrogen_dioxide', 'so2': 'sulphur_dioxide', 'co': 'carbon_monoxide', 'o3': 'ozone'}
UNITS = {'co': 'mg/m3'}  # Open-Meteo reports CO in µg/m³; the app and CPCB use mg/m³
SUPPORTED = set(VARIABLES) | {'aqi'}
SOURCE = 'Open-Meteo Air Quality API (CAMS global model)'
AQI_METHOD = 'CPCB National AQI breakpoints applied to Open-Meteo CAMS model concentrations: an estimate, not an official station AQI'

# ---------------------------------------------------------------- CPCB AQI (same rules as the ML backend's preprocessing/aqi.py)
INDEX = [(0, 50), (51, 100), (101, 200), (201, 300), (301, 400)]
BANDS = {
    'pm25': [(0, 30), (31, 60), (61, 90), (91, 120), (121, 250)],
    'pm10': [(0, 50), (51, 100), (101, 250), (251, 350), (351, 430)],
    'no2': [(0, 40), (41, 80), (81, 180), (181, 280), (281, 400)],
    'so2': [(0, 40), (41, 80), (81, 380), (381, 800), (801, 1600)],
    'co': [(0, 1), (1.1, 2), (2.1, 10), (10.1, 17), (17.1, 34)],
    'o3': [(0, 50), (51, 100), (101, 168), (169, 208)],
}


def subindex(p, c):
    if p not in BANDS or c is None or not math.isfinite(c) or c < 0:
        return None
    step = 10 if p == 'co' else 1
    c = math.floor(c * step + .5) / step
    for (lo, hi), (ilo, ihi) in zip(BANDS[p], INDEX):
        if lo <= c <= hi:
            return {'value': int(math.floor(ilo + (ihi - ilo) * (c - lo) / (hi - lo) + .5)), 'bounded': False}
    return None if p == 'o3' else {'value': 401, 'bounded': True}


def category(v):
    return next(label for ceiling, label in [(50, 'Good'), (100, 'Satisfactory'), (200, 'Moderate'), (300, 'Poor'), (400, 'Very Poor'), (math.inf, 'Severe')] if v <= ceiling)


def calculate_aqi(series, end):
    """series: {pollutant: [(epoch_seconds_hour_end, value_or_None), ...]}; end: epoch seconds."""
    indices, excluded = {}, {}
    for p in BANDS:
        if p not in series:
            continue
        day = [v for t, v in series[p] if end - 86400 < t <= end and v is not None and math.isfinite(v)]
        if len(day) < 16:
            excluded[p] = 'Fewer than 16 valid hourly values in 24h'
            continue
        window = [v for t, v in series[p] if end - 8 * 3600 < t <= end and v is not None and math.isfinite(v)] if p in ('co', 'o3') else day
        if p in ('co', 'o3') and len(window) < 8:
            excluded[p] = 'Incomplete trailing 8h average'
            continue
        mean = sum(window) / len(window)
        si = subindex(p, mean)
        if si is None:
            excluded[p] = 'Unsupported concentration range or one-hour ozone rule required'
            continue
        indices[p] = {**si, 'concentration': mean, 'averaging_hours': 8 if p in ('co', 'o3') else 24}
    ozone_unsupported = excluded.get('o3', '').startswith('Unsupported')
    eligible = len(indices) >= 3 and bool({'pm25', 'pm10'} & indices.keys()) and not ozone_unsupported
    dominant = max(indices, key=lambda k: indices[k]['value']) if indices else None
    bounded = any(s['bounded'] for s in indices.values())
    value = indices[dominant]['value'] if eligible else None
    return {'status': ('LOWER_BOUND' if bounded else 'AVAILABLE') if eligible else 'UNAVAILABLE', 'value': value,
            'category': category(value) if value is not None else None, 'dominant_pollutant': dominant if eligible and not bounded else None,
            'subindices': {k: v['value'] for k, v in indices.items()}, 'excluded': excluded}


# ---------------------------------------------------------------- coordinates

class Places:
    def __init__(self, root):
        path = root / 'metadata' / 'verified_places.json'
        data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'places': {}, 'regions': {}}
        self.places = data['places']
        self.regions = {k.lower(): v for k, v in data['regions'].items()}
        self.regions.update({p['name'].lower(): pid for pid, p in self.places.items()})

    def resolve(self, region, context):
        pid = self.regions.get((region or '').lower())
        if pid:
            p = self.places[pid]
            return p['latitude'], p['longitude'], f"OSM {p['osm']}, {p['precision']} ({p['name']}); station position unknown"
        loc = getattr(context, 'map_location', None)
        if loc and context.selected_region and context.selected_region.lower() == (region or '').lower():
            return loc.latitude, loc.longitude, 'map location of the selection in the app'
        return None


# ---------------------------------------------------------------- client

# Same 0.1° model points as the dashboard (src/services/liveData.ts): CAMS resolves ~0.4°, and
# Open-Meteo counts every coordinate as an API call, so nearby requests share one point.
MODEL_POINT_STEP = 0.1
CACHE_SECONDS = 3600


def model_point(lat, lon):
    snap = lambda v: round(round(v / MODEL_POINT_STEP) * MODEL_POINT_STEP, 4)
    return snap(lat), snap(lon)


class OpenMeteo:
    def __init__(self, settings):
        self.s = settings
        self.places = Places(settings.root)
        self._cache = {}

    @property
    def enabled(self):
        return bool(getattr(self.s, 'open_meteo_url', ''))

    async def fetch(self, lat, lon):
        lat, lon = model_point(lat, lon)
        key = (lat, lon)
        hit = self._cache.get(key)
        if hit and time.monotonic() - hit[0] < CACHE_SECONDS:
            return hit[1]
        data = await self._fetch(lat, lon)
        if data.get('status') != 'UNAVAILABLE':
            self._cache[key] = (time.monotonic(), data)
        return data

    async def _fetch(self, lat, lon):
        params = {'latitude': f'{lat:.4f}', 'longitude': f'{lon:.4f}', 'current': ','.join(VARIABLES.values()), 'hourly': ','.join(VARIABLES.values()),
                  'past_days': '1', 'forecast_days': '1', 'domains': 'cams_global', 'timeformat': 'unixtime'}
        try:
            async with httpx.AsyncClient(timeout=self.s.ml_timeout, trust_env=False, follow_redirects=False) as client:
                r = await client.get(self.s.open_meteo_url, params=params)
            if not r.is_success:
                why = 'Open-Meteo request limit reached; try again later' if r.status_code == 429 else f'Open-Meteo returned HTTP {r.status_code}'
                return {'status': 'UNAVAILABLE', 'reason': why}
            data = r.json()
            return data if isinstance(data, dict) else {'status': 'UNAVAILABLE', 'reason': 'Unexpected Open-Meteo response'}
        except httpx.TimeoutException:
            return {'status': 'UNAVAILABLE', 'reason': 'Open-Meteo timed out'}
        except (httpx.HTTPError, ValueError):
            return {'status': 'UNAVAILABLE', 'reason': 'Open-Meteo is unreachable or returned invalid JSON'}

    async def current(self, region, pollutant, context, now=None):
        """A record in the same shape as pollution_data_adapter.retrieve(), or None if this source can't apply."""
        if not self.enabled or pollutant not in SUPPORTED:
            return None
        where = self.places.resolve(region, context)
        if not where:
            return None
        lat, lon, reference = where
        data = await self.fetch(lat, lon)
        base = {'region': region, 'pollutant': pollutant, 'historical': False, 'endpoint': 'open-meteo:/v1/air-quality', 'source': SOURCE}
        if data.get('status') == 'UNAVAILABLE':
            return {**base, 'available': False, 'timestamp': None, 'data': {'status': 'UNAVAILABLE', 'reason': data['reason']}}
        reference = f'{reference}; nearest 0.1° model point'
        grid = f"{data.get('latitude')}°N {data.get('longitude')}°E"
        common = {'source': SOURCE, 'reference_point': reference, 'model_grid_point': grid}
        now = now or datetime.now(timezone.utc).timestamp()
        if pollutant == 'aqi':
            times = data.get('hourly', {}).get('time', [])
            past = [t for t in times if t <= now]
            if not past:
                return {**base, 'available': False, 'timestamp': None, 'data': {'status': 'UNAVAILABLE', 'reason': 'No hourly model values'}}
            end = past[-1]
            series = {}
            for p, var in VARIABLES.items():
                vals = data['hourly'].get(var)
                if vals:
                    f = 0.001 if p == 'co' else 1
                    series[p] = [(t, None if v is None else v * f) for t, v in zip(times, vals)]
            a = calculate_aqi(series, end)
            when = datetime.fromtimestamp(end, timezone.utc).isoformat()
            if a['status'] == 'UNAVAILABLE':
                return {**base, 'available': False, 'timestamp': when, 'data': {'status': 'UNAVAILABLE', 'reason': 'AQI estimate needs three eligible pollutants including PM2.5 or PM10'}}
            return {**base, 'available': True, 'timestamp': when,
                    'data': {'status': 'MODEL_DATA_AQI_ESTIMATE', 'value': a['value'], 'category': a['category'], 'time': when, 'dominant_pollutant': a['dominant_pollutant'],
                             'subindices': a['subindices'], 'method': AQI_METHOD, **common}}
        cur = data.get('current') or {}
        var = VARIABLES[pollutant]
        unit = (data.get('current_units') or {}).get(var, '').replace('μ', 'µ')
        v = cur.get(var)
        if unit and unit != 'µg/m³':
            return {**base, 'available': False, 'timestamp': None, 'data': {'status': 'UNAVAILABLE', 'reason': f'Unexpected unit {unit}'}}
        if not isinstance(v, (int, float)) or not math.isfinite(v) or not isinstance(cur.get('time'), (int, float)):
            return {**base, 'available': False, 'timestamp': None, 'data': {'status': 'UNAVAILABLE', 'reason': 'Open-Meteo returned no value for this pollutant'}}
        when = datetime.fromtimestamp(cur['time'], timezone.utc).isoformat()
        value = round(v / 1000, 3) if pollutant == 'co' else v
        return {**base, 'available': True, 'timestamp': when,
                'data': {'status': 'MODEL_DATA', 'value': value, 'unit': UNITS.get(pollutant, 'ug/m3'), 'time': when, **common}}
