"""Portable inference from documented recent donor observations, independent of raw training CSV."""
import json
from functools import lru_cache
import joblib,numpy as np,pandas as pd
from .features import ROOT,CONFIG,BASE,WEATHER,distance
@lru_cache(maxsize=12)
def load_model(pollutant,excluded):
    if pollutant not in CONFIG['pollutants']:raise ValueError('Supported pollutants: pm25, pm10')
    stations=json.loads((ROOT/'config/stations.json').read_text())
    if excluded and (excluded not in stations or stations[excluded]['latitude'] is None):raise ValueError('Unknown/unverified held-out station')
    key=pollutant+'_'+(excluded or 'network');return joblib.load(ROOT/'models'/f'{key}.joblib')
def predict(payload):
    pollutant=payload.get('pollutant','pm25');target=payload['station'];excluded=payload.get('excluded_station');stations=json.loads((ROOT/'config/stations.json').read_text());s=stations.get(target)
    unavailable=lambda reason:{'status':'UNAVAILABLE','value':None,'reason':reason,'pollutant':pollutant,'units':'ug/m3'}
    if not s or s['latitude'] is None:return unavailable('Station coordinates unverified; unsupported spatial target')
    if excluded and excluded!=target:return unavailable('Whole-location fold target must equal excluded station')
    cutoff=pd.Timestamp(payload['cutoff'])
    if cutoff.tzinfo is None:return unavailable('Timezone-aware cutoff required')
    cutoff=cutoff.tz_convert('UTC');local=cutoff.tz_convert('Asia/Kolkata')
    if local.minute or local.second:return unavailable('Cutoff must match a whole IST hour')
    donors={};target_history=[]
    for r in payload.get('observations',[]):
        id=r.get('station');st=stations.get(id)
        if r.get('pollutant')!=pollutant or r.get('category')!='MEASURED' or r.get('units')!='ug/m3' or not st or st['latitude'] is None:continue
        try:
            t=pd.Timestamp(r['timestamp']);available=pd.Timestamp(r.get('available_at',r['timestamp']));v=float(r['value'])
            if t.tzinfo is None or available.tzinfo is None or available>cutoff or t>cutoff or not np.isfinite(v) or v<0:continue
            age=(cutoff-t).total_seconds()/3600
            if id==target and not excluded and age<=6:target_history.append((t,v))
            if id==target or id==excluded or age>2:continue
            if id not in donors or t>donors[id][0]:donors[id]=(t,v,age)
        except (KeyError,TypeError,ValueError):continue
    coords=np.array([[stations[id]['latitude'],stations[id]['longitude']] for id in donors]);values=np.array([v[1] for v in donors.values()]);ages=np.array([v[2] for v in donors.values()])
    if len(donors)<2:return unavailable('At least two distinct valid measured donor stations within the prior two hours are required')
    d=distance(s['latitude'],s['longitude'],coords);valid=(d>=.05)&(d<=30);d=d[valid];values=values[valid];ages=ages[valid]
    if len(values)<2 or min(d)>20:return unavailable('Insufficient geographically supported donor measurements')
    weights=1/np.maximum(d,.1)**2;idw=float(sum(values*weights)/sum(weights));features=dict(zip(BASE,[s['latitude'],s['longitude'],np.sin(local.hour*2*np.pi/24),np.cos(local.hour*2*np.pi/24),local.dayofweek,np.sin(local.month*2*np.pi/12),np.cos(local.month*2*np.pi/12),idw,np.mean(values),np.std(values),min(values),max(values),len(values),min(d),np.mean(d),max(ages)]))
    weather=payload.get('weather',{});wt=pd.Timestamp(weather['timestamp']) if weather.get('timestamp') else None;expected=cutoff.floor('h')-pd.Timedelta(days=120)
    weather_ok=wt is not None and wt.tzinfo is not None and wt.tz_convert('UTC')==expected and weather.get('source')=='ERA5' and weather.get('grid')==s.get('weather_grid')
    for var in WEATHER:
        value=weather.get(var) if weather_ok else None
        features['era5_lag120d_'+var]=float(value) if value is not None and np.isfinite(float(value)) else np.nan
    artifact=load_model(pollutant,excluded);meta=artifact['metadata'];x=pd.DataFrame([features])[meta['features']]
    value=float(max(0,artifact['pipeline'].predict(x)[0]));q=meta['calibration_radius'];out=[]
    for name in meta['features']:
        lo,hi=meta['feature_bounds'][name];v=features[name]
        if np.isfinite(v) and lo is not None and (v<lo or v>hi):out.append(name)
    return {'status':'AVAILABLE','category':'FORECAST_ML','pollutant':pollutant,'units':'ug/m3','station':target,'value':value,'cutoff':cutoff.isoformat(),'target_time':(cutoff+pd.Timedelta(hours=1)).isoformat(),'horizon_hours':1,'interval':[max(0,value-q),value+q],'model':meta['name'],'version':meta['version'],'baselines':{'idw':idw,'persistence':max(target_history)[1] if target_history else None},'reliability':{'status':'LOW' if excluded or out or len(values)<3 else 'CAUTION','donor_count':len(values),'nearest_km':float(min(d)),'oldest_donor_hours':float(max(ages)),'out_of_training_bounds':out,'weather_available':weather_ok,'weather_delay_days':120,'weather_missing_handling':'Training-only median plus missing indicators, if selected model includes weather','nominal_interval_coverage':.9,'coverage_warning':'Empirical coverage is in evaluation; 90% is not a guaranteed confidence probability for this case.'},'causal_effects_estimated':False}
