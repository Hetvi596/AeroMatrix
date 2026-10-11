"""Four actual-data scenarios and independent inference reconstruction checks."""
import json
import numpy as np,pandas as pd
from src.features import ROOT,CONFIG,load,mask,WEATHER
from src.inference import predict
from src.planning import analyze
def payload_for(station,pollutant,cutoff,excluded=None,level=0,pattern='random',seed=17):
    stations,frames,weather=load();w=frames[pollutant];cutoff=pd.Timestamp(cutoff);visible=w.to_numpy().copy();visible[mask(visible.shape,level,pattern,seed)]=np.nan
    if excluded:visible[:,list(w.columns).index(excluded)]=np.nan
    observations=[];ix=w.index.get_loc(cutoff)
    for i in range(max(0,ix-6),ix+1):
     for j,id in enumerate(w.columns):
      if np.isfinite(visible[i,j]):observations.append({'station':id,'pollutant':pollutant,'value':float(visible[i,j]),'timestamp':w.index[i].isoformat(),'available_at':w.index[i].isoformat(),'category':'MEASURED','units':'ug/m3'})
    targetweather=cutoff.floor('h')-pd.Timedelta(days=120);grid=stations[station]['weather_grid'];matched=weather[(weather.grid==grid)&(weather.timestamp==targetweather)] if not weather.empty else weather
    context={'timestamp':targetweather.isoformat(),'source':'ERA5','grid':grid}
    if not matched.empty:context.update({k:float(matched.iloc[0][k]) if pd.notna(matched.iloc[0][k]) else None for k in WEATHER})
    return {'station':station,'pollutant':pollutant,'cutoff':cutoff.isoformat(),'excluded_station':excluded,'observations':observations,'weather':context}
def main():
    out=ROOT/'examples';out.mkdir(exist_ok=True);rows=[]
    definitions=[('A_normal','network',0,False),('B_missing_readings','network',.5,True),('C_unseen_station','site_5407',0,False),('D_severe_loss','network',.7,True)]
    for name,fold,level,missing in definitions:
        f=pd.read_csv(ROOT/'evaluation/predictions'/f'pm25_{fold}_random_{int(level*100)}_17.csv.gz')
        if name=='D_severe_loss':eligible=f[f.ml.isna()]
        else:eligible=f[f.ml.notna()&f.idw.notna()]
        if missing and name!='D_severe_loss':eligible=eligible[eligible.target_current_missing]
        if eligible.empty:raise RuntimeError('No genuine supported case for '+name)
        row=eligible.iloc[len(eligible)//2];payload=payload_for(row.station,'pm25',row.cutoff,None if fold=='network' else fold,level);prediction=predict(payload)
        if pd.notna(row.ml):assert abs(prediction['value']-row.ml)<1e-7,(name,prediction['value'],row.ml)
        else:assert prediction['value'] is None
        example={'scenario':name,'mode':'HISTORICAL_REPLAY','configuration':{'loss_level':level,'pattern':'random','seed':17,'fold':fold},'input':payload,'prediction':prediction,'independent_reference':{'value':float(row.actual),'timestamp':row.target_time,'units':'ug/m3','source':'Unmodified supplied CSV target; never passed to predict()'},'absolute_error':abs(prediction['value']-row.actual) if prediction['value'] is not None else None}
        (out/f'{name}.json').write_text(json.dumps(example,indent=2));rows.append(example)
    assumptions=[{'id':'illustrative_A','cost':80,'fraction':.2,'source':'Explicit mathematical sensitivity assumption only; not a validated real-world intervention'},{'id':'illustrative_B','cost':45,'fraction':.12,'source':'Explicit mathematical sensitivity assumption only; not a validated real-world intervention'}]
    planning=analyze(rows[0]['prediction'],assumptions,100);(ROOT/'evaluation/intervention_sensitivity.json').write_text(json.dumps(planning,indent=2));(out/'demo_manifest.json').write_text(json.dumps([{'name':r['scenario'],'status':r['prediction']['status'],'actual':r['independent_reference']['value'],'prediction':r['prediction']['value'],'absolute_error':r['absolute_error']} for r in rows],indent=2));print('Four scenarios verified against saved predictions. Intervention sensitivity explicitly hypothetical.')
if __name__=='__main__':main()
