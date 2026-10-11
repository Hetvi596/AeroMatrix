"""Endpoint tests for the AeroMatrix Task 2 service (aeromatrix_service.py)."""
import json

import pytest
from fastapi.testclient import TestClient

import aeromatrix_service as service
from src.features import ROOT
from src.inference import predict

client = TestClient(service.app)


def demos():
    return client.get('/task2/demos').json()['demos']


def replay_for(d):
    cfg = d['configuration']
    return {'station': d['station'], 'pollutant': d['pollutant'], 'cutoff': d['cutoff'], 'mode': 'unseen' if d['excluded_station'] else 'network', 'loss_level': cfg['loss_level'], 'loss_pattern': cfg['pattern'], 'seed': cfg['seed']}


def test_all_twelve_artifacts_load():
    r = client.get('/task2/models').json()
    assert r['loaded'] == 12
    assert {m['name'] for m in r['models']} == {p.stem for p in (ROOT / 'models').glob('*.joblib')}


def test_package_endpoints_unchanged():
    assert client.get('/task2/health').json()['status'] == 'ok'
    case = json.loads((ROOT / 'examples/A_normal.json').read_text())
    r = client.post('/task2/predict', json=case['input'])
    assert r.status_code == 200 and r.json()['value'] == pytest.approx(case['prediction']['value'])


def test_replay_reproduces_the_four_packaged_scenarios():
    ds = demos()
    assert [d['scenario'] for d in ds] == ['A_normal', 'B_missing_readings', 'C_unseen_station', 'D_severe_loss']
    for d in ds:
        r = client.post('/task2/replay', json=replay_for(d)).json()
        assert r['mode'] == 'HISTORICAL_REPLAY' and r['live'] is False
        assert r['prediction']['status'] == d['prediction']['status']
        if d['prediction']['value'] is None:
            assert r['prediction']['value'] is None and r['errors'] is None
        else:
            assert r['prediction']['value'] == pytest.approx(d['prediction']['value'])
            assert r['prediction']['category'] == 'FORECAST_ML'
        assert r['reference']['value'] == pytest.approx(d['reference']['value'])


def test_unseen_mode_uses_the_holdout_artifact_and_withholds_target_history():
    d = next(x for x in demos() if x['scenario'] == 'C_unseen_station')
    r = client.post('/task2/replay', json=replay_for(d)).json()
    assert r['model_artifact'] == 'pm25_site_5407' and r['prediction']['model'] == 'pm25_site_5407'
    for pol in ('pm25', 'pm10'):
        assert r['pollutants'][pol]['model_artifact'] == f'{pol}_site_5407'
        assert r['pollutants'][pol]['prediction']['baselines']['persistence'] is None
    assert r['aqi'] is None and r['aqi_status'] == 'insufficient_data'


def test_outage_simulation_removes_donors_and_can_force_abstention():
    d = next(x for x in demos() if x['scenario'] == 'A_normal')
    base = client.post('/task2/replay', json=replay_for(d)).json()
    used = [x['station'] for x in base['donors'] if x['state'] == 'USED']
    assert len(used) >= 2
    one = client.post('/task2/replay', json={**replay_for(d), 'outage': used[:1]}).json()
    assert next(x for x in one['donors'] if x['station'] == used[0])['state'] == 'OUTAGE_SIMULATED'
    allout = client.post('/task2/replay', json={**replay_for(d), 'outage': used}).json()
    assert allout['prediction']['status'] == 'UNAVAILABLE' and allout['prediction']['value'] is None
    assert 'donor' in allout['prediction']['reason']


def test_target_offline_drops_persistence_but_not_the_spatial_forecast():
    d = next(x for x in demos() if x['scenario'] == 'A_normal')
    on = client.post('/task2/replay', json=replay_for(d)).json()
    off = client.post('/task2/replay', json={**replay_for(d), 'target_offline': True}).json()
    assert on['prediction']['baselines']['persistence'] is not None
    assert off['prediction']['baselines']['persistence'] is None
    assert off['prediction']['value'] == pytest.approx(on['prediction']['value'])


def test_reference_value_is_never_an_input():
    d = next(x for x in demos() if x['scenario'] == 'A_normal')
    req = replay_for(d)
    r = client.post('/task2/replay', json=req).json()
    from demos import payload_for
    payload = payload_for(req['station'], req['pollutant'], req['cutoff'])
    assert all(o['timestamp'] <= payload['cutoff'] for o in payload['observations'])
    assert predict(payload)['value'] == pytest.approx(r['prediction']['value'])


@pytest.mark.parametrize('body, code', [
    ({'station': 'site_5404', 'cutoff': '2025-06-30T17:00:00+05:30'}, 422),  # unverified coordinates
    ({'station': 'site_9999', 'cutoff': '2025-06-30T17:00:00+05:30'}, 404),
    ({'station': 'site_5766', 'cutoff': '2024-06-30T17:00:00+05:30'}, 422),  # training period
    ({'station': 'site_5766', 'cutoff': '2025-06-30T17:30:00+05:30'}, 422),  # not a whole IST hour
    ({'station': 'site_5766', 'cutoff': '2025-06-30T17:00:00'}, 422),  # no timezone
    ({'station': 'site_5766', 'cutoff': '2025-06-30T17:00:00+05:30', 'loss_level': 0.2}, 422),  # not evaluated
    ({'station': 'site_5766', 'cutoff': '2025-06-30T17:00:00+05:30', 'observations': []}, 422),  # browser cannot send readings
])
def test_bad_requests_are_rejected(body, code):
    assert client.post('/task2/replay', json=body).status_code == code


def test_network_status_covers_all_thirteen_stations():
    d = demos()[0]
    r = client.post('/task2/replay', json=replay_for(d)).json()
    assert len(r['network_status']) == 13
    assert sum(s['verified'] for s in r['network_status']) == 5
    assert {s['readings'][p]['state'] for s in r['network_status'] for p in ('pm25', 'pm10')} <= {'REPORTING', 'LATE', 'MISSING'}


def test_cases_come_from_saved_evaluation():
    r = client.get('/task2/cases', params={'station': 'site_5766', 'pollutant': 'pm25'}).json()
    assert r['missing'] and r['normal'] and r['unseen']
    first = client.post('/task2/replay', json={'station': 'site_5766', 'cutoff': r['missing'][0]}).json()
    assert first['target_reading_at_cutoff']['recorded'] is False and first['prediction']['status'] == 'AVAILABLE'
    assert client.get('/task2/cases', params={'station': 'site_5404'}).status_code == 422


def test_evaluation_reports_persistence_honestly():
    e = client.get('/task2/evaluation').json()
    by = {(r['pollutant'], r['method']): r['mae'] for r in e['normal']}
    assert by[('pm25', 'persistence')] < by[('pm25', 'ml')]
    assert len(e['unseen']) == 10
    assert {c['loss_level'] for c in e['loss_curves']} == {0, 0.1, 0.3, 0.5, 0.7}


def test_plan_is_hypothetical_and_validated():
    d = demos()[0]
    actions = [{'id': 'a', 'cost': 80, 'fraction': 0.2, 'source': 'test assumption'}, {'id': 'b', 'cost': 45, 'fraction': 0.12, 'source': 'test assumption'}]
    r = client.post('/task2/plan', json={'replay': replay_for(d), 'actions': actions, 'budget': 100}).json()
    assert r['analysis']['status'] == 'HYPOTHETICAL_SENSITIVITY' and r['causal_effects_estimated'] is False
    assert r['analysis']['central']['cost'] <= 100
    bad = [{**actions[0], 'fraction': 1.5}]
    assert client.post('/task2/plan', json={'replay': replay_for(d), 'actions': bad, 'budget': 100}).status_code == 422
    severe = next(x for x in demos() if x['scenario'] == 'D_severe_loss')
    r = client.post('/task2/plan', json={'replay': replay_for(severe), 'actions': actions, 'budget': 100}).json()
    assert r['analysis']['status'] == 'UNAVAILABLE'


# ------------------------------------------------------------------ PM-based AQI

@pytest.mark.parametrize('pol, conc, expected', [
    ('pm25', 0, 0), ('pm25', 30, 50), ('pm25', 30.4, 50), ('pm25', 31, 51), ('pm25', 60, 100), ('pm25', 61, 101), ('pm25', 90, 200),
    ('pm25', 91, 201), ('pm25', 120, 300), ('pm25', 121, 301), ('pm25', 250, 400), ('pm25', 251, 401),
    ('pm10', 50, 50), ('pm10', 51, 51), ('pm10', 100, 100), ('pm10', 101, 101), ('pm10', 250, 200), ('pm10', 251, 201),
    ('pm10', 350, 300), ('pm10', 351, 301), ('pm10', 430, 400), ('pm10', 431, 401),
])
def test_cpcb_subindex_breakpoints(pol, conc, expected):
    assert service.subindex(pol, conc)['value'] == expected
    assert service.subindex(pol, conc)['bounded'] is (expected == 401)


@pytest.mark.parametrize('value, category', [(0, 'Good'), (50, 'Good'), (51, 'Satisfactory'), (100, 'Satisfactory'), (101, 'Moderately Polluted'), (200, 'Moderately Polluted'), (201, 'Poor'), (300, 'Poor'), (301, 'Very Poor'), (400, 'Very Poor'), (401, 'Severe')])
def test_cpcb_categories(value, category):
    assert service.aqi_category(value) == category


def test_aqi_needs_sixteen_hours_for_both_pollutants():
    import pandas as pd
    t0, t1 = pd.Timestamp('2025-05-01T00:00Z'), pd.Timestamp('2025-05-01T23:00Z')
    full = {'measured': [40.0] * 23, 'forecast': 40.0}
    ok = service.estimated_aqi({'pm25': full, 'pm10': {'measured': [80.0] * 23, 'forecast': 80.0}}, t0, t1)
    assert ok['aqi_status'] == 'estimated' and ok['aqi_type'] == 'ESTIMATED_PM_BASED' and ok['official'] is False
    assert ok['aqi'] == 80 and ok['aqi_category'] == 'Satisfactory' and ok['dominant_pollutant'] == 'pm10'
    short = {'measured': [40.0] * 14 + [None] * 9, 'forecast': 40.0}  # 15 valid hours
    r = service.estimated_aqi({'pm25': short, 'pm10': full}, t0, t1)
    assert r['aqi'] is None and r['aqi_status'] == 'insufficient_data' and 'pm25' in r['excluded']
    r = service.estimated_aqi({'pm25': {'measured': [40.0] * 23, 'forecast': None}, 'pm10': full}, t0, t1)
    assert r['aqi'] is None  # no forecast for the hour: no "predicted" AQI


def test_replay_returns_both_pollutants_and_a_consistent_aqi():
    import pandas as pd
    c = client.get('/task2/cases', params={'station': 'site_5996', 'pollutant': 'pm25'}).json()
    found = False
    for t in c['normal']:
        r = client.post('/task2/replay', json={'station': 'site_5996', 'cutoff': t}).json()
        assert r['predicted_pm25'] == r['pollutants']['pm25']['prediction']['value']
        assert r['predicted_pm10'] == r['pollutants']['pm10']['prediction']['value']
        if r['aqi_status'] != 'estimated':
            continue
        found = True
        d = r['aqi_detail']
        w = service.load()[1]['pm25']['site_5996']
        cut = pd.Timestamp(t).tz_convert('UTC')
        vals = w.loc[cut - pd.Timedelta(hours=22):cut].dropna().tolist() + [r['predicted_pm25']]
        assert d['subindices']['pm25']['concentration_24h'] == pytest.approx(sum(vals) / len(vals))
        assert r['aqi'] == max(v['value'] for v in d['subindices'].values())
        assert r['aqi_category'] == service.aqi_category(r['aqi'])
    assert found


def test_offline_sensor_hour_gives_unavailable_aqi():
    # Katraj Dairy, 1 Apr 2025 08:00 IST: reading missing and only 8 of 24 hours recorded.
    r = client.post('/task2/replay', json={'station': 'site_5766', 'cutoff': '2025-04-01T08:00:00+05:30'}).json()
    assert r['predicted_pm25'] is not None and r['target_reading_at_cutoff']['recorded'] is False
    assert r['aqi'] is None and r['aqi_category'] is None and r['aqi_status'] == 'insufficient_data'


@pytest.mark.parametrize('station', ['site_5409', 'site_5407', 'site_5766', 'site_5996', 'site_6012'])
def test_suggested_hours_yield_an_estimated_aqi(station):
    c = client.get('/task2/cases', params={'station': station, 'pollutant': 'pm25'}).json()
    assert c['with_aqi']
    for t in c['missing'][:2] + c['with_aqi'][:2]:
        r = client.post('/task2/replay', json={'station': station, 'cutoff': t}).json()
        assert r['aqi_status'] == 'estimated' and r['aqi'] is not None
