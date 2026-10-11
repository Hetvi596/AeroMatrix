from __future__ import annotations
from contextlib import asynccontextmanager
import json
import os
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict
from . import inference as service

@asynccontextmanager
async def lifespan(app):
    service.validate_artifacts()
    yield

app=FastAPI(title='AeroMatrix Portable Trained Backend',version='1.0.0',lifespan=lifespan,
            description='Real station observations and 24h forecasts. Historical snapshots are explicitly labelled. No retraining on startup.')
origins=os.environ.get('AEROMATRIX_CORS_ORIGINS','http://localhost:5173,http://localhost:5174,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:3000').split(',')
app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in origins],allow_methods=['GET','POST'],allow_headers=['Content-Type'])

class HourlyObservation(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False)
    time: str = Field(description='ISO timestamp with explicit timezone; already aggregated hourly observations')
    values: dict[str,float|None] = Field(description='Canonical parameter names. Missing values must be null, not zero.')

class ForecastRequest(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False)
    region: str
    pollutants: list[str]|None=None
    allow_historical: bool=False
    units: dict[str,str] = Field(description='Required for every submitted parameter; exact canonical units from /health')
    observations: list[HourlyObservation] = Field(min_length=16,max_length=24*14)

@app.get('/health')
def health():
    return {'status':'ok','model_loaded':True,'model_count':len(service.validate_artifacts()),'supported_pollutants':list(service.MANIFEST['models']),
            'station_count':len(service.STATIONS),'units':service.UNITS,'training_on_startup':False,
            'bundled_data_is_historical':True,'spatial_estimation_available':False}

@app.get('/regions')
def regions(): return service.regions()

@app.get('/pollution')
def pollution(region:str): return service.pollution(region)

@app.get('/forecast')
def forecast(region:str,pollutant:str|None=None,allow_historical:bool=False):
    return service.forecast(region,[pollutant] if pollutant else None,allow_historical)

@app.post('/forecast')
def forecast_with_observations(request:ForecastRequest):
    station=service.resolve(request.region)
    if station is None: return service.unavailable('Unsupported or ambiguous station',region=request.region)
    rows=[]
    for record in request.observations:
        try:
            timestamp=pd.Timestamp(record.time)
            if timestamp.tzinfo is None: raise ValueError('Every timestamp requires a timezone offset')
            timestamp=timestamp.tz_convert('Asia/Kolkata')
            if timestamp.minute or timestamp.second or timestamp.microsecond: raise ValueError('Submit hourly-aggregated values at hour boundaries')
            if timestamp+pd.Timedelta(hours=1)>pd.Timestamp.now(tz='UTC')+pd.Timedelta(minutes=1): raise ValueError('Observation hour must be complete; future or unfinished hourly means are invalid')
        except (TypeError,ValueError) as exc: raise HTTPException(422,str(exc))
        for p,value in record.values.items():
            if p not in service.UNITS or request.units.get(p)!=service.UNITS[p]: raise HTTPException(422,f'Unknown parameter or incorrect/missing unit: {p}')
            if value is not None and not np.isfinite(value): raise HTTPException(422,'Values must be finite or null')
            if value is not None and ((p not in ('temperature',) and value<0) or (p=='humidity' and value>100) or (p=='wind_direction' and value>360)):
                raise HTTPException(422,f'Invalid physical range for {p}')
            if value is not None and ((p=='temperature' and not -20<=value<=60) or (p=='pressure' and not 700<=value<=1100) or (p=='co' and value>100) or (p in service.MANIFEST['models'] and p!='co' and value>5000)):
                raise HTTPException(422,f'Value outside preprocessing plausibility limits: {p}')
        rows.append({'time':timestamp.tz_convert('Asia/Kolkata'),'station':station['station'],**record.values})
    frame=pd.DataFrame(rows).sort_values('time')
    for name in frame.columns:
        if name not in ('time','station'): frame[name]=pd.to_numeric(frame[name],errors='raise').astype(float)
    if frame.time.duplicated().any(): raise HTTPException(422,'Duplicate timestamps must be resolved before inference')
    if frame.time.max()-frame.time.min()>pd.Timedelta(days=14): raise HTTPException(422,'At most 14 days of inference context allowed')
    result=service.forecast(request.region,request.pollutants,request.allow_historical,frame)
    result['input_observed_aqi']=service.calculate_aqi(frame)
    return result

@app.get('/model/metrics')
def metrics(pollutant:str|None=None):
    if pollutant and pollutant not in service.MANIFEST['models']: return service.unavailable('Unsupported pollutant')
    return {p:service.artifact(p)[1] for p in ([pollutant] if pollutant else service.MANIFEST['models'])}

@app.get('/location')
def location(longitude:float=Query(ge=-180,le=180),latitude:float=Query(ge=-90,le=90)):
    return service.location(longitude,latitude)

@app.get('/boundaries')
def boundaries(version:str='pune-electoral-wards_2022.geojson'):
    versions=json.loads((service.ROOT/'geographic_data/boundary_versions.json').read_text(encoding='utf-8'))
    if version not in versions: raise HTTPException(404,'Unknown boundary version')
    return versions[version]

@app.get('/industry')
def industry(longitude:float=Query(ge=-180,le=180),latitude:float=Query(ge=-90,le=90),radius_km:float=Query(default=5,gt=0,le=30)):
    return service.industry(longitude,latitude,radius_km)

@app.get('/industry/district-emissions')
def district_emissions():
    frame=pd.read_csv(service.ROOT/'geographic_data/pune_district_2021_sector_emissions.csv')
    return {'status':'DISTRICT_AGGREGATE','records':json.loads(frame.to_json(orient='records')),
            'warning':'Pune district 2021 inventory, tonnes/year. Not ambient concentrations or individual factory emissions; not a model feature.'}

@app.get('/aqi/history')
def historical_aqi(region:str):
    station=service.resolve(region)
    sid=station['station'] if station else ('historical:mit-kothrud-iitm' if service.normalize(region) in ('kothrud','mit kothrud') else None)
    frame=pd.read_csv(service.ROOT/'runtime_context/historical_aqi_latest.csv')
    subset=frame[frame.station==sid]
    if subset.empty: return service.unavailable('No historical source-reported AQI for this region')
    return {'status':'SOURCE_REPORTED_AQI','historical':True,'records':json.loads(subset.to_json(orient='records')),
            'note':'AQI source values, not pollutant concentrations. Dominant pollutant and subindices unavailable.'}

if __name__=='__main__':
    import uvicorn
    uvicorn.run('api.main:app',host=os.environ.get('AEROMATRIX_HOST','127.0.0.1'),port=int(os.environ.get('AEROMATRIX_PORT','8000')))
