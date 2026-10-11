"""AeroMatrix Task 2 service: missing sensors, unseen locations and sensor-loss replay.

Wraps the unmodified Task 2 package. The package's own endpoints (POST /task2/predict,
GET /task2/health) come from src.api unchanged; this module adds read-only endpoints for the
web app that build model inputs on the server from the package's trusted historical record
(data/pollution.csv.gz) with the package's own payload builder (demos.payload_for), then call
src.inference.predict. The browser only chooses a station, pollutant, hour and scenario; it can
never submit measurements, so it cannot pass fabricated readings off as MEASURED.

Everything here is historical replay (test period Feb–Sep 2025). Nothing is live. The
independent reference value is read after the prediction and is never passed to predict().
The AQI is an estimated PM-based CPCB index on 24 h means (recorded hours plus the one-hour
forecast); it is never computed from a one-hour value alone and is withheld when data are short.

Run: .venv\\Scripts\\python.exe -m uvicorn aeromatrix_service:app --host 127.0.0.1 --port 8030
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from typing import Literal, Optional

import numpy as np
import pandas as pd
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from demos import payload_for
from src.api import app  # package endpoints: POST /task2/predict, GET /task2/health
from src.features import CONFIG, ROOT, distance, load, mask
from src.inference import load_model, predict
from src.planning import analyze

IST = 'Asia/Kolkata'
TEST_START = pd.Timestamp(CONFIG['test_start'])
LOSS_LEVELS = tuple(CONFIG['loss_levels'])
SEEDS = tuple(CONFIG['seeds'])
DONOR_MAX_AGE = CONFIG['donor_max_age_hours']
LOOKBACK_HOURS = 6  # payload_for sends the cutoff hour plus the six before it


def _num(v) -> Optional[float]:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


@lru_cache
def stations_config() -> dict:
    return json.loads((ROOT / 'config/stations.json').read_text(encoding='utf-8'))


def verified_ids() -> list[str]:
    return [s for s, d in stations_config().items() if d.get('latitude') is not None]


@lru_cache
def all_station_frames() -> dict[str, pd.DataFrame]:
    """Hourly values for all 13 stations (status display only; the model uses load())."""
    f = pd.read_csv(ROOT / 'data/pollution.csv.gz')
    f['timestamp'] = pd.to_datetime(f.timestamp, utc=True)
    out = {}
    for pol in CONFIG['pollutants']:
        x = f[f.pollutant == pol].pivot(index='timestamp', columns='station_id', values='value').sort_index()
        out[pol] = x.reindex(columns=list(stations_config()))
    return out


def _iso(t: pd.Timestamp) -> str:
    return t.tz_convert(IST).isoformat()


# ------------------------------------------------------------------ request models

class Replay(BaseModel):
    model_config = ConfigDict(extra='forbid')
    station: str
    pollutant: Literal['pm25', 'pm10'] = 'pm25'
    cutoff: str
    mode: Literal['network', 'unseen'] = 'network'
    outage: list[str] = Field(default_factory=list, max_length=13)  # donor stations switched off
    target_offline: bool = False  # the target sensor's own readings removed too
    loss_level: float = 0.0
    loss_pattern: Literal['random', 'block12h', 'station'] = 'random'
    seed: int = 17


class Action(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(min_length=1, max_length=60)
    cost: float = Field(ge=0)
    fraction: float = Field(ge=0, le=1)
    source: str = Field(min_length=1, max_length=400)


class PlanRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    replay: Replay
    actions: list[Action] = Field(max_length=12)
    budget: float = Field(ge=0)


# ------------------------------------------------------------------ replay core

def _cutoff(req: Replay) -> pd.Timestamp:
    try:
        t = pd.Timestamp(req.cutoff)
    except (TypeError, ValueError) as err:
        raise HTTPException(422, 'cutoff must be an ISO timestamp') from err
    if t.tzinfo is None:
        raise HTTPException(422, 'cutoff must carry a timezone')
    t = t.tz_convert('UTC')
    local = t.tz_convert(IST)
    if local.minute or local.second:
        raise HTTPException(422, 'cutoff must be a whole IST hour')
    frame = load()[1][req.pollutant]
    last = frame.index.max() - pd.Timedelta(hours=1)  # the next hour must exist to compare
    if t < TEST_START or t > last:
        raise HTTPException(422, f'Replay is limited to the held-out test period, {_iso(TEST_START)} to {_iso(last)}, so no training hour is shown as a result.')
    return t


def _validate(req: Replay) -> None:
    cfg = stations_config()
    if req.station not in cfg:
        raise HTTPException(404, 'Unknown station')
    if cfg[req.station].get('latitude') is None:
        raise HTTPException(422, 'This station has no verified coordinates, so the package supports no spatial prediction for it.')
    if req.loss_level not in LOSS_LEVELS:
        raise HTTPException(422, f'loss_level must be one of the evaluated levels {list(LOSS_LEVELS)}')
    if req.seed not in SEEDS:
        raise HTTPException(422, f'seed must be one of the evaluated seeds {list(SEEDS)}')
    bad = [s for s in req.outage if s not in cfg]
    if bad:
        raise HTTPException(422, f'Unknown station in outage: {bad[0]}')


# ------------------------------------------------------------------ PM-based AQI
# CPCB National AQI breakpoints for PM2.5 and PM10 (24 h means, µg/m³), with the same rounding
# and open-ended "Severe" handling as the web app's src/services/cpcbAqi.ts.
AQI_INDEX = [(0, 50), (51, 100), (101, 200), (201, 300), (301, 400)]
AQI_BANDS = {
    'pm25': [(0, 30), (31, 60), (61, 90), (91, 120), (121, 250)],
    'pm10': [(0, 50), (51, 100), (101, 250), (251, 350), (351, 430)],
}
AQI_MIN_HOURS = 16  # CPCB: at least 16 valid hourly values for a 24 h mean


def subindex(pollutant: str, concentration: float) -> dict:
    c = math.floor(concentration + 0.5)  # the printed bands are whole µg/m³
    for (lo, hi), (ilo, ihi) in zip(AQI_BANDS[pollutant], AQI_INDEX):
        if lo <= c <= hi:
            return {'value': math.floor(ilo + (ihi - ilo) * (c - lo) / (hi - lo) + 0.5), 'bounded': False}
    return {'value': 401, 'bounded': True}  # above the table: a lower bound, never an invented value


def aqi_category(value: int) -> str:
    if value <= 50:
        return 'Good'
    if value <= 100:
        return 'Satisfactory'
    if value <= 200:
        return 'Moderately Polluted'
    if value <= 300:
        return 'Poor'
    if value <= 400:
        return 'Very Poor'
    return 'Severe'


def estimated_aqi(parts: dict, window_start: pd.Timestamp, window_end: pd.Timestamp) -> dict:
    """AQI for the 24 h ending at the forecast hour: the recorded hours before it plus the
    one-hour forecast. Needs ≥16 valid hours for both PM2.5 and PM10. With only these two
    pollutants it is an estimate, not an official CPCB AQI (which needs at least three)."""
    sub, excluded = {}, {}
    for pol, part in parts.items():
        if part.get('reason'):
            excluded[pol] = part['reason']
            continue
        if part['forecast'] is None:
            excluded[pol] = 'No forecast for the target hour'
            continue
        values = [v for v in part['measured'] if v is not None] + [part['forecast']]
        if len(values) < AQI_MIN_HOURS:
            excluded[pol] = f'Only {len(values)} of 24 hourly values ({AQI_MIN_HOURS} needed)'
            continue
        mean = sum(values) / len(values)
        sub[pol] = {**subindex(pol, mean), 'concentration_24h': mean, 'valid_hours': len(values), 'forecast_hours': 1}
    base = {'aqi_type': None, 'official': False, 'subindices': sub, 'excluded': excluded, 'window_start': _iso(window_start), 'window_end': _iso(window_end)}
    if len(sub) < 2:
        return {**base, 'aqi': None, 'aqi_category': None, 'aqi_status': 'insufficient_data', 'aqi_bounded': False, 'dominant_pollutant': None, 'reason': 'AQI unavailable — insufficient pollutant data'}
    dominant = max(sub, key=lambda k: sub[k]['value'])
    value = sub[dominant]['value']
    bounded = any(x['bounded'] for x in sub.values())
    return {**base, 'aqi': value, 'aqi_category': aqi_category(value), 'aqi_status': 'estimated', 'aqi_type': 'ESTIMATED_PM_BASED', 'aqi_bounded': bounded, 'dominant_pollutant': dominant, 'reason': None}


# ------------------------------------------------------------------ replay

def _replay_one(req: Replay, pollutant: str, cutoff: pd.Timestamp) -> dict:
    stations, frames, _ = load()
    wide = frames[pollutant]
    excluded = req.station if req.mode == 'unseen' else None
    payload = payload_for(req.station, pollutant, cutoff, excluded, req.loss_level, req.loss_pattern, req.seed)
    removed = set(req.outage) | ({req.station} if req.target_offline else set())
    payload['observations'] = [o for o in payload['observations'] if o['station'] not in removed]
    prediction = predict(payload)

    # Which values the evaluated loss mask hid (for labelling only; payload_for already applied it).
    ix = wide.index.get_loc(cutoff)
    hidden = mask(wide.shape, req.loss_level, req.loss_pattern, req.seed)
    ids = list(wide.columns)
    window = range(max(0, ix - LOOKBACK_HOURS), ix + 1)
    target_ll = (stations[req.station]['latitude'], stations[req.station]['longitude'])

    donors = []
    for j, sid in enumerate(ids):
        if sid == req.station:
            continue
        d_km = float(distance(*target_ll, np.array([[stations[sid]['latitude'], stations[sid]['longitude']]]))[0])
        obs = [o for o in payload['observations'] if o['station'] == sid]
        latest = max(obs, key=lambda o: o['timestamp']) if obs else None
        age = (cutoff - pd.Timestamp(latest['timestamp'])).total_seconds() / 3600 if latest else None
        recorded = [i for i in window if np.isfinite(wide.iat[i, j])]
        if sid in req.outage:
            state = 'OUTAGE_SIMULATED'
        elif latest is None and recorded and all(hidden[i, j] for i in recorded):
            state = 'LOSS_MASKED'
        elif latest is None:
            state = 'NO_READING'
        elif age > DONOR_MAX_AGE:
            state = 'STALE'
        elif d_km < 0.05 or d_km > 30:
            state = 'OUT_OF_RANGE'
        else:
            state = 'USED'
        donors.append({
            'station': sid,
            'name': stations[sid]['name'],
            'distance_km': round(d_km, 2),
            'state': state,
            'value': latest['value'] if latest and state != 'OUTAGE_SIMULATED' else None,
            'timestamp': _iso(pd.Timestamp(latest['timestamp'])) if latest else None,
            'age_hours': age,
        })

    j = ids.index(req.station)
    target_time = cutoff + pd.Timedelta(hours=1)
    actual = _num(wide.at[target_time, req.station]) if target_time in wide.index else None
    at_cutoff = _num(wide.iat[ix, j])
    errors = None
    if prediction.get('value') is not None and actual is not None:
        b = prediction['baselines']
        errors = {
            'ml': abs(prediction['value'] - actual),
            'idw': abs(b['idw'] - actual) if b.get('idw') is not None else None,
            'persistence': abs(b['persistence'] - actual) if b.get('persistence') is not None else None,
            'inside_interval': prediction['interval'][0] <= actual <= prediction['interval'][1],
        }

    # The 23 recorded hours before the forecast hour, as visible in this scenario.
    if req.mode == 'unseen':
        aqi_part = {'reason': 'The station’s own readings are withheld in the unseen-location scenario'}
    else:
        measured = []
        for i in range(ix - 22, ix + 1):
            v = _num(wide.iat[i, j]) if i >= 0 else None
            if v is not None and (hidden[i, j] or (req.target_offline and i in window)):
                v = None
            measured.append(v)
        aqi_part = {'measured': measured, 'forecast': prediction.get('value')}

    return {
        'model_artifact': f"{pollutant}_{excluded or 'network'}",
        'prediction': prediction,
        'target_reading_at_cutoff': {'value': at_cutoff, 'recorded': at_cutoff is not None},
        'reference': {
            'value': actual,
            'time': _iso(target_time),
            'units': 'ug/m3',
            'category': 'MEASURED',
            'note': 'Recorded value for the forecast hour, read after the prediction; never passed to predict().',
        },
        'errors': errors,
        'donors': donors,
        'observations_used': len(payload['observations']),
        'weather': {'reference_time': payload['weather'].get('timestamp'), 'source': 'ERA5', 'delay_days': CONFIG['weather_delay_days'], 'available': prediction.get('reliability', {}).get('weather_available')},
        '_aqi_part': aqi_part,
    }


def run_replay(req: Replay) -> dict:
    """Both PM2.5 and PM10 for one station and hour, plus the estimated PM-based AQI.
    Top-level prediction/reference/errors/donors are for req.pollutant (unchanged contract)."""
    _validate(req)
    cutoff = _cutoff(req)
    target_time = cutoff + pd.Timedelta(hours=1)
    results = {pol: _replay_one(req, pol, cutoff) for pol in CONFIG['pollutants']}
    aqi = estimated_aqi({pol: r.pop('_aqi_part') for pol, r in results.items()}, target_time - pd.Timedelta(hours=23), target_time)
    main = results[req.pollutant]
    value = lambda pol: results[pol]['prediction'].get('value')
    return {
        'mode': 'HISTORICAL_REPLAY',
        'live': False,
        'request': req.model_dump(),
        'cutoff': _iso(cutoff),
        'target_time': _iso(target_time),
        **{k: main[k] for k in ('model_artifact', 'prediction', 'target_reading_at_cutoff', 'reference', 'errors', 'donors', 'observations_used', 'weather')},
        'pollutants': results,
        'predicted_pm25': value('pm25'),
        'predicted_pm10': value('pm10'),
        **{k: aqi[k] for k in ('aqi', 'aqi_category', 'aqi_status', 'aqi_type')},
        'aqi_detail': aqi,
        'network_status': network_status(cutoff),
        'data_end': _iso(load()[1][req.pollutant].index.max()),
    }


def network_status(cutoff: pd.Timestamp) -> list[dict]:
    """PM2.5 and PM10 reading state of all 13 stations at the cutoff hour, from the recorded data."""
    out = []
    for sid, d in stations_config().items():
        readings = {}
        for pol in CONFIG['pollutants']:
            frame = all_station_frames()[pol]
            window = frame.loc[cutoff - pd.Timedelta(hours=LOOKBACK_HOURS): cutoff]
            col = window[sid].dropna() if sid in window else pd.Series(dtype=float)
            last_t = col.index.max() if len(col) else None
            now_v = _num(window[sid].get(cutoff)) if sid in window else None
            readings[pol] = {
                'state': 'REPORTING' if now_v is not None else ('LATE' if last_t is not None else 'MISSING'),
                'value': now_v,
                'last_reading': _iso(last_t) if last_t is not None else None,
                'age_hours': (cutoff - last_t).total_seconds() / 3600 if last_t is not None else None,
            }
        out.append({'station': sid, 'name': d['name'], 'verified': d.get('latitude') is not None, 'readings': readings})
    return out


# ------------------------------------------------------------------ endpoints

@app.get('/task2/stations')
def task2_stations():
    _, frames, _ = load()
    out = []
    for sid, d in stations_config().items():
        verified = d.get('latitude') is not None
        row = {
            'station': sid,
            'name': d['name'],
            'city': d.get('city'),
            'verified': verified,
            'latitude': d.get('latitude'),
            'longitude': d.get('longitude'),
            'coordinate_status': d.get('coordinate_status'),
            'coordinate_source': d.get('coordinate_source'),
            'models': [f'{p}_network' for p in CONFIG['pollutants']] + [f'{p}_{sid}' for p in CONFIG['pollutants']] if verified else [],
        }
        if verified:
            test = {p: frames[p].loc[TEST_START:, sid] for p in CONFIG['pollutants']}
            row['test_coverage'] = {p: round(float(s.notna().mean()), 3) for p, s in test.items()}
        out.append(row)
    last = frames['pm25'].index.max()
    return {'stations': out, 'test_start': _iso(TEST_START), 'data_end': _iso(last), 'horizon_hours': CONFIG['horizon_hours'], 'version': CONFIG['version'], 'live': False}


@app.get('/task2/models')
def task2_models():
    """Loads all 12 artifacts and reports their metadata (proof they load, not of accuracy)."""
    rows = []
    for pol in CONFIG['pollutants']:
        for ex in [None] + verified_ids():
            m = load_model(pol, ex)['metadata']
            rows.append({'name': m['name'], 'pollutant': m['pollutant'], 'excluded_station': m.get('excluded_station'), 'algorithm': m.get('algorithm'), 'version': m.get('version'), 'features': len(m['features']), 'calibration_radius': m['calibration_radius']})
    return {'loaded': len(rows), 'models': rows}


@app.post('/task2/replay')
def task2_replay(req: Replay):
    return run_replay(req)


@lru_cache(maxsize=24)
def _predictions(pollutant: str, fold: str) -> pd.DataFrame:
    f = pd.read_csv(ROOT / 'evaluation/predictions' / f'{pollutant}_{fold}_random_0_17.csv.gz')
    f['cutoff'] = pd.to_datetime(f.cutoff, utc=True)
    return f


@app.get('/task2/cases')
def task2_cases(station: str, pollutant: Literal['pm25', 'pm10'] = 'pm25'):
    """Genuine test-period hours from the package's saved evaluation, for the hour picker."""
    if station not in verified_ids():
        raise HTTPException(422, 'Cases exist only for the five coordinate-verified stations.')
    net = _predictions(pollutant, 'network')
    net = net[net.station == station]
    unseen = _predictions(pollutant, station)
    unseen = unseen[unseen.station == station]

    def pick(df: pd.DataFrame, n: int = 6) -> list[str]:
        if df.empty:
            return []
        idx = np.unique(np.linspace(0, len(df) - 1, n).round().astype(int))
        return [_iso(t) for t in df.cutoff.iloc[idx]]

    # Hours where the default replay also yields an estimated AQI: both pollutants forecast, and
    # at least 15 recorded hours in the 23 before the forecast hour (16 with the forecast).
    _, frames, _ = load()
    enough = None
    for pol in CONFIG['pollutants']:
        recorded = frames[pol][station].notna().astype(int).rolling(AQI_MIN_HOURS + 7, min_periods=1).sum() >= AQI_MIN_HOURS - 1
        other = _predictions(pol, 'network')
        forecast = other[(other.station == station) & other.ml.notna()].cutoff
        ok = recorded.reindex(net.cutoff).fillna(False).to_numpy() & net.cutoff.isin(forecast).to_numpy()
        enough = ok if enough is None else enough & ok
    net = net.assign(aqi_ok=enough)
    missing = net[net.target_current_missing & net.ml.notna()]

    return {
        'station': station,
        'pollutant': pollutant,
        # Sensor reading missing at the cutoff; hours where the AQI can still be estimated come first.
        'missing': pick(missing[missing.aqi_ok]) or pick(missing),
        'normal': pick(net[~net.target_current_missing & net.ml.notna()]),
        'with_aqi': pick(net[net.aqi_ok & net.ml.notna()]),
        'abstain': pick(net[net.ml.isna()]),
        'unseen': pick(unseen[unseen.ml.notna()]),
        'first': _iso(net.cutoff.min()) if len(net) else None,
        'last': _iso(net.cutoff.max()) if len(net) else None,
    }


@lru_cache
def _evaluation() -> dict:
    s = json.loads((ROOT / 'evaluation/summary.json').read_text(encoding='utf-8'))
    m = pd.read_csv(ROOT / 'evaluation/metrics.csv')
    keep = ['pollutant', 'method', 'n', 'mae', 'rmse', 'r2', 'coverage', 'mean_width']
    normal = [{k: _num(r[k]) if k not in ('pollutant', 'method') else r[k] for k in keep} for r in s['normal_comparison']]
    unseen = []
    for r in s['unseen_scores']:
        idw = m[(m.pollutant == r['pollutant']) & (m.fold == r['fold']) & (m.loss_level == 0) & (m.seed == 17) & (m.method == 'idw') & (m.cohort == 'common_spatial') & (m.pattern == 'random')]
        unseen.append({'pollutant': r['pollutant'], 'station': r['fold'], 'n': r['n'], 'ml_mae': _num(r['mae']), 'idw_mae': _num(idw.mae.iloc[0]) if len(idw) else None, 'coverage': _num(r['coverage']), 'r2': _num(r['r2'])})
    curves = []
    net = m[m.fold == 'network']
    for (pol, pat, lvl, meth), g in net[net.cohort == 'common_three'].groupby(['pollutant', 'pattern', 'loss_level', 'method']):
        avail = net[(net.cohort == 'available') & (net.pollutant == pol) & (net.pattern == pat) & (net.loss_level == lvl) & (net.method == meth)]
        curves.append({'pollutant': pol, 'pattern': pat, 'loss_level': float(lvl), 'method': meth, 'mae': _num(g.mae.mean()), 'n': _num(g.n.mean()), 'coverage': _num(g.coverage.mean()), 'availability': _num(avail.availability.mean()) if len(avail) else None})
    return {'normal': normal, 'unseen': unseen, 'loss_curves': curves, 'models': s['models'], 'baseline_improvements': s['baseline_improvements'], 'seeds': list(SEEDS), 'source': 'evaluation/summary.json and evaluation/metrics.csv from the Task 2 package'}


@app.get('/task2/evaluation')
def task2_evaluation():
    return _evaluation()


@app.get('/task2/demos')
def task2_demos():
    out = []
    for p in sorted((ROOT / 'examples').glob('[ABCD]_*.json')):
        e = json.loads(p.read_text(encoding='utf-8'))
        i = e['input']
        out.append({
            'scenario': e['scenario'],
            'mode': e['mode'],
            'configuration': e['configuration'],
            'station': i['station'],
            'pollutant': i['pollutant'],
            'cutoff': _iso(pd.Timestamp(i['cutoff'])),
            'excluded_station': i.get('excluded_station'),
            'observations': len(i['observations']),
            'prediction': e['prediction'],
            'reference': e['independent_reference'],
            'absolute_error': e['absolute_error'],
        })
    return {'demos': out}


@app.post('/task2/plan')
def task2_plan(req: PlanRequest):
    """planning.analyze on a server-computed prediction; costs and effects are caller assumptions."""
    replay = run_replay(req.replay)
    try:
        result = analyze(replay['prediction'], [a.model_dump() for a in req.actions], req.budget)
    except ValueError as err:
        raise HTTPException(422, str(err)) from err
    return {'replay': {k: replay[k] for k in ('cutoff', 'target_time', 'prediction', 'model_artifact')}, 'analysis': result, 'causal_effects_estimated': False}


if __name__ == '__main__':
    import os

    import uvicorn

    uvicorn.run(app, host='127.0.0.1', port=int(os.getenv('TASK2_PORT', '8030')))
