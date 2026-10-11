"""Portable inference only. No training code, network data fetches or demo fallback."""
from __future__ import annotations
from functools import lru_cache
from pathlib import Path
import hashlib
import json
import math
import os

import joblib
import numpy as np
import pandas as pd
from shapely.geometry import Point, shape

from preprocessing.features import features, predict
from preprocessing.aqi import calculate_aqi

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=json.loads((ROOT/'metadata/model_manifest.json').read_text(encoding='utf-8'))
STATIONS=json.loads((ROOT/'geographic_data/stations.json').read_text(encoding='utf-8'))
CONTEXT=json.loads((ROOT/'runtime_context/index.json').read_text(encoding='utf-8'))
UNITS=MANIFEST['units']

def normalize(value):
    return ' '.join(str(value).lower().replace('_',' ').replace('-',' ').split())

def resolve(region):
    key=normalize(region)
    matches=[s for s in STATIONS if key in {normalize(s['station']),normalize(s['station_name']),*[normalize(x) for x in s['aliases']]}]
    return matches[0] if len(matches)==1 else None

@lru_cache(maxsize=16)
def artifact(pollutant):
    item=MANIFEST['models'].get(pollutant)
    if not item: raise ValueError(f'No validated artifact for {pollutant}')
    path=ROOT/item['artifact']
    if hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']: raise RuntimeError(f'Model integrity check failed: {pollutant}')
    bundle=joblib.load(path)
    meta=json.loads((ROOT/item['metadata']).read_text(encoding='utf-8'))
    return bundle,meta

def validate_artifacts():
    return {p:artifact(p)[1]['version'] for p in MANIFEST['models']}

@lru_cache(maxsize=160)
def stored_history(station,pollutant):
    item=CONTEXT.get(station,{}).get(pollutant)
    if not item: return None,None
    frame=pd.read_csv(ROOT/item['history'])
    frame['time']=pd.to_datetime(frame.time,utc=True).dt.tz_convert('Asia/Kolkata')
    return frame,item

def unavailable(reason,**extra):
    return {'status':'UNAVAILABLE','reason':reason,**extra}

def infer_one(station,pollutant,allow_historical=False,history=None):
    if pollutant not in MANIFEST['models']: return unavailable('No model for pollutant',pollutant=pollutant)
    bundle,meta=artifact(pollutant)
    if station['station'] not in meta['stations']: return unavailable('Station not represented in this model',pollutant=pollutant)
    frame,item=stored_history(station['station'],pollutant) if history is None else (history,None)
    if frame is None or frame.empty: return unavailable('No eligible observed history for this station and pollutant',pollutant=pollutant)
    if pollutant not in frame: return unavailable('Target pollutant history is required',pollutant=pollutant)
    generated,_=features(frame,pollutant,meta['horizon_hours'])
    if item:
        row=generated[generated.time==pd.Timestamp(item['issued_at'])].copy()
    else:
        # User supplied history must end in a usable actual observation, not a silently backdated prediction.
        row=generated.tail(1).copy()
    if len(row)!=1 or row.lag_0.isna().any() or row.history_count_24.iloc[0]<16:
        return unavailable('At least 16 observed target hours in the trailing 24h and a valid latest value are required',pollutant=pollutant)
    for name in bundle['features']:
        if name not in row: row[name]=np.nan
    observed_start=row.time.iloc[0]; target_start=row.y_time.iloc[0]
    # Feature timestamps label hour starts; a complete average is available at hour end.
    issued=observed_start+pd.Timedelta(hours=1); valid=target_start+pd.Timedelta(hours=1); now=pd.Timestamp.now(tz='UTC')
    if issued>now+pd.Timedelta(minutes=1): return unavailable('Future timestamps are not observations',pollutant=pollutant)
    stale=bool(now-issued>pd.Timedelta(hours=3) or valid<now)
    if stale and not allow_historical:
        return unavailable('Bundled readings are historical. Supply recent hourly observations or set allow_historical=true explicitly.',
                           pollutant=pollutant,issued_at=issued.isoformat(),valid_at=valid.isoformat(),historical=True)
    value=float(predict(bundle,row)[0])
    if not math.isfinite(value): return unavailable('Model produced a nonfinite value',pollutant=pollutant)
    radius=meta['interval']['radius']; test=meta['results'][meta['chosen_model']]['test']
    reliability=[]
    if test['r2'] is None or test['r2']<0: reliability.append('WEAK_MODEL_NEGATIVE_OR_UNDEFINED_TEST_R2')
    elif test['r2']<.3: reliability.append('LOW_EXPLAINED_TEST_VARIANCE')
    if meta['interval']['test_coverage']<.8: reliability.append('EMPIRICAL_INTERVAL_TEST_COVERAGE_BELOW_80_PERCENT')
    imputed=[name for name in bundle['features'] if pd.isna(row[name].iloc[0])]
    return {'status':'PREDICTED','pollutant':pollutant,'value':value,'unit':meta['unit'],'issued_at':issued.isoformat(),
            'valid_at':valid.isoformat(),'generated_at':now.isoformat(),'horizon_hours':meta['horizon_hours'],'historical':stale,
            'observation_window':{'start':observed_start.isoformat(),'end':issued.isoformat()},
            'prediction_window':{'start':target_start.isoformat(),'end':valid.isoformat(),'statistic':'hourly_mean'},
            'model':{'algorithm':meta['chosen_model'],'version':meta['version'],'artifact_sha256':MANIFEST['models'][pollutant]['sha256'],
                     'kind':'statistical_baseline' if meta['chosen_model'] in ('persistence','seasonal_average') else 'fitted_ml_model'},
            'lower':max(0,value-radius),'upper':value+radius,'uncertainty':meta['interval'],
            'test_metrics':test,'reliability_warnings':reliability,'imputed_features':imputed,
            'source':'bundled_real_observation_context' if history is None else 'caller_supplied_observations',
            'spatial_scope':'Monitoring station; not a locality-wide or street-level forecast'}

def forecast(region,pollutants=None,allow_historical=False,history=None):
    station=resolve(region)
    if station is None: return unavailable('No unambiguous supported monitoring station matches this region. Use /regions; no nearest-station substitution is performed.',region=region)
    selected=pollutants or list(MANIFEST['models'])
    values={p:infer_one(station,p,allow_historical,history) for p in selected}
    available=sum(v['status']=='PREDICTED' for v in values.values())
    return {'status':'PREDICTED' if available==len(values) else ('PARTIAL' if available else 'UNAVAILABLE'),
            'region':station,'pollutants':values,'aqi':unavailable('Single-horizon point forecasts do not supply official AQI averaging windows'),
            'scenario_note':'Forecasts may supply a modeled scenario baseline. Intervention effects are not validated by these observational models.'}

def pollution(region):
    station=resolve(region)
    if station is None: return unavailable('No matching measured monitoring station; unmonitored locations require separately validated spatial estimation',region=region)
    return json.loads((ROOT/'runtime_context'/f"{station['station']}_observations.json").read_text(encoding='utf-8'))

def regions():
    boundaries=json.loads((ROOT/'geographic_data/regions.geojson').read_text(encoding='utf-8'))
    return {'station_locations':[{**s,'available_snapshot_pollutants':list(CONTEXT.get(s['station'],{})),
                                  'geographic_scope':'monitoring_station','coordinate_status':'unavailable' if s['longitude'] is None else 'verified'} for s in STATIONS],
            'wards':[{'id':f['properties']['aeromatrix_id'],'name':f['properties'].get('Name2',f['properties'].get('name')),
                      'centroid':list(shape(f['geometry']).centroid.coords)[0],
                      'prediction_status':'UNAVAILABLE','reason':'Station coordinates and spatial validation absent'} for f in boundaries['features']],
            'primary_boundary':'pune-electoral-wards_2022.geojson',
            'notice':'Ward centroids are boundary-derived map locations, never monitoring station coordinates. Pune ward boundaries do not establish full PCMC coverage.'}

def location(longitude,latitude):
    doc=json.loads((ROOT/'geographic_data/regions.geojson').read_text(encoding='utf-8'))
    point=Point(longitude,latitude)
    hits=[f['properties'] for f in doc['features'] if shape(f['geometry']).covers(point)]
    return unavailable('No verified station coordinates or validated unmonitored-location model. Boundary lookup is available; pollution prediction is withheld.',
                       longitude=longitude,latitude=latitude,regions=hits,coverage='within_primary_boundary' if hits else 'outside_primary_boundary')

def industry(longitude,latitude,radius_km):
    doc=json.loads((ROOT/'geographic_data/industries.geojson').read_text(encoding='utf-8'))
    found=[]
    for f in doc['features']:
        point=shape(f['geometry']).representative_point(); lon,lat=point.x,point.y
        a=math.sin(math.radians(lat-latitude)/2)**2+math.cos(math.radians(latitude))*math.cos(math.radians(lat))*math.sin(math.radians(lon-longitude)/2)**2
        distance=6371*2*math.asin(math.sqrt(min(1,max(0,a))))
        if distance<=radius_km: found.append({**f['properties'],'longitude':lon,'latitude':lat,'distance_km':distance})
    return {'status':'MAPPED_GEOMETRY_ONLY','sites':sorted(found,key=lambda x:x['distance_km']),
            'coverage':'PARTIAL: only one of four recovery OSM tiles succeeded','emissions':None,
            'used_in_trained_forecasts':False,'reason':'No verified station coordinates or historical industrial features; factory location does not measure emissions.'}
