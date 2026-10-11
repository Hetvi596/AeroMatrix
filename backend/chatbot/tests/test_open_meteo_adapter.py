"""Open-Meteo fallback: real recorded response (10 Oct 2026), CPCB parity with the ML
backend's preprocessing/aqi.py, and precedence (ML station data first). No live network."""
import asyncio
import json
import shutil
from datetime import datetime
from pathlib import Path
import httpx
import pytest
from fastapi.testclient import TestClient
from chatbot.config import ROOT, Settings
from chatbot.main import create_app
from chatbot.schemas import AppContext
from integrations import open_meteo_adapter as om

FIX = Path(__file__).parent / 'fixtures'
SWARGATE = json.loads((FIX / 'openmeteo-air-quality-swargate.json').read_text(encoding='utf-8'))
RECORDED_AT = 1791652800  # 10 Oct 2026 22:50 IST


@pytest.fixture
def mock_open_meteo(monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        if 'air-quality' in str(request.url):
            return httpx.Response(200, json=SWARGATE)
        return httpx.Response(503)  # ML backend "down"

    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, 'AsyncClient', lambda *a, **k: real(*a, **{**k, 'transport': httpx.MockTransport(handler)}))
    return calls


def settings(tmp_path, **kw):
    for folder in ('metadata', 'knowledge_base'):
        shutil.copytree(ROOT / folder, tmp_path / folder, dirs_exist_ok=True)
    return Settings(root=tmp_path, provider='disabled', ml_url='http://127.0.0.1:1', rate_limit=10000, ml_timeout=.5, **kw)


def test_cpcb_parity_with_ml_backend():
    for c in json.loads((FIX / 'aqi-parity-backend.json').read_text(encoding='utf-8')):
        end = datetime.fromisoformat(c['end']).timestamp()
        series = {p: [(end - i * 3600, v) for i, v in enumerate(vals)] for p, vals in c['series'].items()}
        a = om.calculate_aqi(series, end)
        assert a['status'] == c['status'] and a['value'] == c['value'] and a['dominant_pollutant'] == c['dominant'] and a['subindices'] == c['sub']


def test_places_resolve_verified_points_and_never_guess(tmp_path):
    places = om.Places(ROOT)
    lat, lon, ref = places.resolve('Revenue Colony-Shivajinagar', AppContext())
    assert (lat, lon) == (18.52946, 73.84782) and 'OSM' in ref
    assert places.resolve('Mhada Colony', AppContext()) is None
    assert places.resolve('Wakad', AppContext()) is None
    ctx = AppContext(selected_region='Wakad', map_location={'longitude': 73.76, 'latitude': 18.6})
    assert places.resolve('Wakad', ctx)[:2] == (18.6, 73.76)


def test_current_values_units_and_labels(tmp_path, mock_open_meteo):
    asyncio.run(_current_values(tmp_path))


async def _current_values(tmp_path):
    client = om.OpenMeteo(settings(tmp_path))
    r = await client.current('Swargate', 'pm25', AppContext(), now=RECORDED_AT)
    assert r['available'] and r['data']['status'] == 'MODEL_DATA'
    assert r['data']['value'] == SWARGATE['current']['pm2_5'] and r['data']['unit'] == 'ug/m3'
    assert r['timestamp'] == datetime.fromtimestamp(SWARGATE['current']['time'], tz=__import__('datetime').timezone.utc).isoformat()
    co = await client.current('Swargate', 'co', AppContext(), now=RECORDED_AT)
    assert co['data']['unit'] == 'mg/m3' and co['data']['value'] == round(SWARGATE['current']['carbon_monoxide'] / 1000, 3)
    aqi = await client.current('Swargate', 'aqi', AppContext(), now=RECORDED_AT)
    assert aqi['data']['status'] == 'MODEL_DATA_AQI_ESTIMATE' and 'not an official' in aqi['data']['method']
    assert await client.current('Swargate', 'nh3', AppContext()) is None
    assert await client.current('Mhada Colony', 'pm25', AppContext()) is None


def test_chat_uses_model_data_when_station_data_is_not_current(tmp_path, mock_open_meteo):
    app = create_app(settings(tmp_path))
    with TestClient(app) as c:
        d = c.post('/chat', json={'message': 'What is PM2.5 in Shivajinagar?'}).json()
    assert d['intent'] == 'observation' and d['data_status'] == 'available'
    assert d['data'][0]['data']['status'] == 'MODEL_DATA'
    assert 'not a station measurement' in d['answer'] and 'Model data' in d['answer']
    assert d['sources'][0]['type'] == 'open_meteo'


def test_disabled_model_data_keeps_original_behaviour(tmp_path, mock_open_meteo):
    app = create_app(settings(tmp_path, open_meteo_url=''))
    with TestClient(app) as c:
        d = c.post('/chat', json={'message': 'What is PM2.5 in Shivajinagar?'}).json()
    assert d['data_status'] == 'unavailable'
    assert not any('air-quality' in str(r.url) for r in mock_open_meteo)


def test_historical_requests_stay_with_the_ml_backend(tmp_path, mock_open_meteo):
    app = create_app(settings(tmp_path))
    with TestClient(app) as c:
        d = c.post('/chat', json={'message': 'What is PM2.5 in Shivajinagar?', 'allow_historical': True}).json()
    assert d['data'][0]['endpoint'] == '/pollution'
    assert not any('air-quality' in str(r.url) for r in mock_open_meteo)


def test_uses_the_dashboards_model_points_and_caches_them(tmp_path, mock_open_meteo):
    # Same 0.1° lattice as src/services/liveData.ts (modelPoint), so answers match the dashboard.
    assert om.model_point(18.52946, 73.84782) == (18.5, 73.8)
    assert om.model_point(18.66077, 73.77783) == (18.7, 73.8)
    client = om.OpenMeteo(settings(tmp_path))
    asyncio.run(client.current('Shivajinagar', 'pm25', AppContext(), now=RECORDED_AT))
    asyncio.run(client.current('Shivajinagar', 'pm10', AppContext(), now=RECORDED_AT))
    calls = [r for r in mock_open_meteo if 'air-quality' in str(r.url)]
    assert len(calls) == 1
    assert calls[0].url.params['latitude'] == '18.5000' and calls[0].url.params['longitude'] == '73.8000'
