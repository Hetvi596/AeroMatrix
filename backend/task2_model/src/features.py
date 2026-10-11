from pathlib import Path
from functools import lru_cache
import json,warnings
import numpy as np,pandas as pd
ROOT=Path(__file__).resolve().parents[1]
CONFIG=json.loads((ROOT/'config/experiment.json').read_text())
BASE=['latitude','longitude','hour_sin','hour_cos','dow','month_sin','month_cos','idw','neighbor_mean','neighbor_std','neighbor_min','neighbor_max','neighbor_count','nearest_km','mean_distance_km','max_donor_age']
WEATHER=['temperature_2m','relative_humidity_2m','dew_point_2m','wind_speed_10m','wind_direction_10m','precipitation','surface_pressure']
FEATURES=BASE+['era5_lag120d_'+v for v in WEATHER]
@lru_cache
def load():
    allstations=json.loads((ROOT/'config/stations.json').read_text());stations={s:d for s,d in allstations.items() if d.get('latitude') is not None};f=pd.read_csv(ROOT/'data/pollution.csv.gz');f['timestamp']=pd.to_datetime(f.timestamp,utc=True)
    frames={}
    for pollutant in CONFIG['pollutants']:
        x=f[(f.pollutant==pollutant)&f.station_id.isin(stations)].pivot(index='timestamp',columns='station_id',values='value').sort_index();x=x.reindex(pd.date_range(x.index.min(),x.index.max(),freq='h')).reindex(columns=list(stations));frames[pollutant]=x
    weather=pd.read_csv(ROOT/'data/weather.csv.gz') if (ROOT/'data/weather.csv.gz').exists() else pd.DataFrame()
    if not weather.empty:weather['timestamp']=pd.to_datetime(weather.timestamp,utc=True)
    return stations,frames,weather
def distance(lat,lon,coords):
    c=np.radians(coords);a,b=np.radians([lat,lon]);return 6371*2*np.arcsin(np.sqrt(np.clip(np.sin((c[:,0]-a)/2)**2+np.cos(a)*np.cos(c[:,0])*np.sin((c[:,1]-b)/2)**2,0,1)))
def mask(shape,level,pattern,seed):
    rng=np.random.default_rng(seed)
    if level==0:return np.zeros(shape,bool)
    if pattern=='random':return rng.random(shape)<level
    if pattern=='block12h':return np.repeat(rng.random(((shape[0]+11)//12,shape[1]))<level,12,axis=0)[:shape[0]]
    out=np.zeros(shape,bool);out[:,rng.choice(shape[1],max(1,round(level*shape[1])),replace=False)]=True;return out
def recent(values,limit):
    """Forward carry only with explicit age; never use future or unlimited filling."""
    x=np.asarray(values,float);v=x.copy();age=np.where(np.isfinite(x),0,np.nan)
    for n in range(1,limit+1):
        old=np.roll(x,n,axis=0);old[:n]=np.nan;take=~np.isfinite(v)&np.isfinite(old);v[take]=old[take];age[take]=n
    return v,age
def build(stations,wide,weather,pollutant,excluded=None,level=0,pattern='random',seed=17,targets=None):
    ids=list(wide.columns);coords=np.array([[stations[s]['latitude'],stations[s]['longitude']] for s in ids]);raw=wide.to_numpy();hidden=mask(raw.shape,level,pattern,seed);visible=raw.copy();visible[hidden]=np.nan
    if excluded:visible[:,ids.index(excluded)]=np.nan
    donor,ages=recent(visible,CONFIG['donor_max_age_hours']);past,pastage=recent(visible,CONFIG['persistence_max_age_hours']);times=wide.index;local=times.tz_convert('Asia/Kolkata');rows=[]
    for j,id in enumerate(ids):
        if targets is None and id==excluded:continue
        if targets is not None and id not in targets:continue
        values=donor.copy();age=ages.copy();d=distance(*coords[j],coords);values[:,(d<.05)|(d>30)]=np.nan;age[:,(d<.05)|(d>30)]=np.nan
        ok=np.isfinite(values);count=ok.sum(axis=1);weights=ok/np.maximum(d,.1)**2
        with warnings.catch_warnings():
            warnings.simplefilter('ignore',RuntimeWarning)
            idw=np.nansum(values*weights,axis=1)/np.maximum(weights.sum(axis=1),1e-30);mean=np.nanmean(values,axis=1);std=np.nanstd(values,axis=1);lo=np.nanmin(values,axis=1);hi=np.nanmax(values,axis=1);maxage=np.nanmax(age,axis=1)
        nearest=np.where(ok,d,np.inf).min(axis=1);meand=(ok*d).sum(axis=1)/np.maximum(count,1)
        a=np.column_stack([np.full(len(times),coords[j,0]),np.full(len(times),coords[j,1]),np.sin(local.hour*2*np.pi/24),np.cos(local.hour*2*np.pi/24),local.dayofweek,np.sin(local.month*2*np.pi/12),np.cos(local.month*2*np.pi/12),idw,mean,std,lo,hi,count,nearest,meand,maxage]);f=pd.DataFrame(a,columns=BASE)
        weather_time=times.floor('h')-pd.Timedelta(days=CONFIG['weather_delay_days'])
        for variable in WEATHER:f['era5_lag120d_'+variable]=np.nan
        if not weather.empty:
            w=weather[weather.grid==stations[id]['weather_grid']].drop_duplicates('timestamp').set_index('timestamp');matched=w.reindex(weather_time)
            for variable in WEATHER:f['era5_lag120d_'+variable]=matched[variable].to_numpy()
        f['eligible']=(count>=CONFIG['minimum_donors'])&(nearest<=CONFIG['maximum_nearest_km'])&np.isfinite(a).all(axis=1);f.loc[~f.eligible,'idw']=np.nan
        f['actual']=wide[id].shift(-CONFIG['horizon_hours']).to_numpy();f['persistence']=past[:,j] if id!=excluded else np.nan;f['persistence_age']=pastage[:,j] if id!=excluded else np.nan;f['station']=id;f['pollutant']=pollutant;f['cutoff']=times;f['target_time']=times+pd.Timedelta(hours=CONFIG['horizon_hours']);f['weather_reference_time']=weather_time;f['target_current_missing']=~np.isfinite(visible[:,j]);f['nominal_loss']=level;rows.append(f)
    return pd.concat(rows,ignore_index=True)
