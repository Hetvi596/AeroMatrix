"""Shared, hourly cache in front of the Open-Meteo air-quality and weather APIs.

Every browser that opens AeroMatrix asks this service instead of Open-Meteo, so one upstream
request per distinct query per hour serves everyone (Open-Meteo's free tier is about 10,000
calls a day per IP, counted per coordinate). Responses are Open-Meteo's own JSON, unchanged.
The cache is written to disk so a restart does not spend quota again. If Open-Meteo refuses
(daily limit) or is unreachable, the last good response is served as stale, at most 24 hours
old; its hourly timestamps are Open-Meteo's own, so the app still shows the real data time.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

UPSTREAM = {
    'air-quality': os.getenv('OPEN_METEO_AIR_QUALITY_URL', 'https://air-quality-api.open-meteo.com/v1/air-quality'),
    'forecast': os.getenv('OPEN_METEO_FORECAST_URL', 'https://api.open-meteo.com/v1/forecast'),
}
TTL_SECONDS = int(os.getenv('OPEN_METEO_CACHE_SECONDS', '3600'))
STALE_LIMIT_SECONDS = 24 * 3600
MAX_ENTRIES = 400
MAX_COORDINATES = 200
ALLOWED_PARAMS = {'latitude', 'longitude', 'hourly', 'current', 'daily', 'timezone', 'forecast_days', 'past_days', 'domains', 'cell_selection', 'timeformat', 'models', 'wind_speed_unit', 'temperature_unit', 'precipitation_unit'}


class OpenMeteoCache:
    def __init__(self, path: Path, ttl: int = TTL_SECONDS, client: httpx.AsyncClient | None = None):
        self.path = path
        self.ttl = ttl
        self.client = client
        self.entries: dict[str, dict] = {}
        self.locks: dict[str, asyncio.Lock] = {}
        self.upstream_calls = 0
        try:
            self.entries = json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            self.entries = {}

    def _save(self) -> None:
        if len(self.entries) > MAX_ENTRIES:
            for key in sorted(self.entries, key=lambda k: self.entries[k]['fetched_at'])[: len(self.entries) - MAX_ENTRIES]:
                del self.entries[key]
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix('.tmp')
            tmp.write_text(json.dumps(self.entries), encoding='utf-8')
            tmp.replace(self.path)
        except OSError:
            pass  # the in-memory cache still works

    async def get(self, kind: str, params: dict[str, str]) -> tuple[dict, str, float]:
        """(Open-Meteo JSON, 'HIT' | 'MISS' | 'STALE', fetched_at epoch seconds)."""
        url = UPSTREAM[kind] + '?' + urlencode(sorted(params.items()))
        lock = self.locks.setdefault(url, asyncio.Lock())
        async with lock:  # concurrent identical requests share one upstream call
            hit = self.entries.get(url)
            now = time.time()
            if hit and now - hit['fetched_at'] < self.ttl:
                return hit['body'], 'HIT', hit['fetched_at']
            try:
                self.upstream_calls += 1
                client = self.client or httpx.AsyncClient(timeout=15)
                try:
                    res = await client.get(url)
                finally:
                    if self.client is None:
                        await client.aclose()
                body = res.json() if res.content else None
                if res.status_code != 200 or not isinstance(body, (dict, list)):
                    reason = body.get('reason') if isinstance(body, dict) else None
                    raise UpstreamError(res.status_code, reason or f'Open-Meteo returned HTTP {res.status_code}')
            except (httpx.HTTPError, ValueError, UpstreamError) as err:
                if hit and now - hit['fetched_at'] < STALE_LIMIT_SECONDS:
                    return hit['body'], 'STALE', hit['fetched_at']
                status = err.status if isinstance(err, UpstreamError) else 502
                raise UpstreamError(status, str(err) if isinstance(err, UpstreamError) else 'Open-Meteo is unreachable') from err
            self.entries[url] = {'fetched_at': now, 'body': body}
            self._save()
            return body, 'MISS', now


class UpstreamError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def validate(request: Request) -> dict[str, str]:
    params = dict(request.query_params)
    unknown = set(params) - ALLOWED_PARAMS
    if unknown:
        raise HTTPException(422, f'Unsupported parameter: {sorted(unknown)[0]}')
    lat, lon = params.get('latitude', ''), params.get('longitude', '')
    try:
        lats = [float(x) for x in lat.split(',')]
        lons = [float(x) for x in lon.split(',')]
    except ValueError as err:
        raise HTTPException(422, 'latitude and longitude must be numbers') from err
    if not lat or len(lats) != len(lons) or len(lats) > MAX_COORDINATES:
        raise HTTPException(422, f'Give matching latitude/longitude lists of at most {MAX_COORDINATES} points')
    if any(not -90 <= a <= 90 for a in lats) or any(not -180 <= b <= 180 for b in lons):
        raise HTTPException(422, 'Coordinates out of range')
    if any(len(v) > 4000 for v in params.values()):
        raise HTTPException(422, 'Parameter too long')
    return params


def router(cache: OpenMeteoCache) -> APIRouter:
    r = APIRouter(prefix='/open-meteo')

    async def serve(kind: str, request: Request):
        params = validate(request)
        try:
            body, state, fetched = await cache.get(kind, params)
        except UpstreamError as err:
            return JSONResponse({'error': True, 'reason': str(err)}, status_code=err.status if 400 <= err.status < 600 else 502)
        return JSONResponse(body, headers={'X-Cache': state, 'X-Fetched-At': str(int(fetched))})

    @r.get('/air-quality')
    async def air_quality(request: Request):
        return await serve('air-quality', request)

    @r.get('/forecast')
    async def forecast(request: Request):
        return await serve('forecast', request)

    @r.get('/status')
    async def status():
        now = time.time()
        return {'entries': len(cache.entries), 'fresh': sum(now - e['fetched_at'] < cache.ttl for e in cache.entries.values()), 'ttl_seconds': cache.ttl, 'upstream_calls_since_start': cache.upstream_calls}

    return r
