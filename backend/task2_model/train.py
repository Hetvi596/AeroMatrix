"""Train all folds; checkpoints permit restart without repeated completed model fits."""
import os
os.environ.setdefault('OMP_NUM_THREADS','4')
import json,hashlib,warnings
import numpy as np,pandas as pd,joblib
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.ensemble import HistGradientBoostingRegressor,ExtraTreesRegressor
from sklearn.metrics import r2_score
from src.features import ROOT,CONFIG,BASE,FEATURES,load,build
warnings.filterwarnings('ignore',message="The 'generic' unit for NumPy timedelta is deprecated",category=DeprecationWarning)
def metrics(y,p,lo=None,hi=None):
    y=np.asarray(y);p=np.asarray(p);valid=np.isfinite(y)&np.isfinite(p);e=p[valid]-y[valid];n=int(valid.sum());r={'n':n,'mae':float(np.mean(abs(e))) if n else None,'rmse':float(np.sqrt(np.mean(e**2))) if n else None,'bias':float(np.mean(e)) if n else None,'r2':float(r2_score(y[valid],p[valid])) if n>1 and np.var(y[valid])>0 else None}
    if lo is not None:r.update(coverage=float(np.mean((y[valid]>=lo[valid])&(y[valid]<=hi[valid]))) if n else None,mean_width=float(np.mean(hi[valid]-lo[valid])) if n else None)
    return r
def main():
    stations,frames,weather=load();select_start=pd.Timestamp(CONFIG['selection_start']);cal_start=pd.Timestamp(CONFIG['calibration_start']);test_start=pd.Timestamp(CONFIG['test_start']);manifests=[];summary=[]
    (ROOT/'evaluation/predictions').mkdir(parents=True,exist_ok=True)
    for pollutant,wide in frames.items():
      for excluded in [None]+list(stations):
        name=pollutant+'_'+(excluded or 'network');path=ROOT/'models'/f'{name}.joblib';print('MODEL',name,flush=True)
        if path.exists():artifact=joblib.load(path);meta=artifact['metadata'];print('Loaded checkpoint',name,flush=True)
        else:
          regular=build(stations,wide,weather,pollutant,excluded);aug=build(stations,wide,weather,pollutant,excluded,.3,'random',17)
          t=pd.concat([regular,aug]);t=t[(t.target_time<select_start)&t.eligible&t.actual.notna()];v=regular[(regular.cutoff>=select_start)&(regular.target_time<cal_start)&regular.eligible&regular.actual.notna()];c=regular[(regular.cutoff>=cal_start)&(regular.target_time<test_start)&regular.eligible&regular.actual.notna()]
          if min(len(t),len(v),len(c))<100:raise RuntimeError(f'{name}: insufficient development cases: {len(t)}/{len(v)}/{len(c)}')
          candidates={};scores={}
          for weather_enabled,cols in [(False,BASE),(True,FEATURES)]:
           for algorithm,est in [('extra_trees',ExtraTreesRegressor(n_estimators=48,max_depth=12,min_samples_leaf=12,n_jobs=4,random_state=17)),('hist_gradient_boosting',HistGradientBoostingRegressor(max_iter=100,max_leaf_nodes=15,l2_regularization=5,learning_rate=.08,early_stopping=False,random_state=17))]:
            key=algorithm+('_delayed_weather' if weather_enabled else '_no_weather');p=make_pipeline(SimpleImputer(strategy='median',add_indicator=True,keep_empty_features=True),est);p.fit(t[cols],t.actual);scores[key]=metrics(v.actual,np.maximum(0,p.predict(v[cols])));candidates[key]=(p,cols);print(key,scores[key]['mae'],flush=True)
          best=min(scores,key=lambda k:scores[k]['mae']);p,cols=candidates[best];cp=np.maximum(0,p.predict(c[cols]));res=abs(cp-c.actual.to_numpy());radius=float(np.quantile(res,min(1,np.ceil((len(res)+1)*.9)/len(res)),method='higher'))
          meta={'name':name,'version':CONFIG['version'],'pollutant':pollutant,'unit':'ug/m3','horizon_hours':CONFIG['horizon_hours'],'excluded_station':excluded,'training_stations':[s for s in stations if s!=excluded],'unique_training_targets':len(t.drop_duplicates(['station','target_time'])),'training_feature_rows_with_augmentation':len(t),'selection_targets':len(v),'calibration_targets':len(c),'train_label_end':str(t.target_time.max()),'selection_start':str(v.cutoff.min()),'selection_label_end':str(v.target_time.max()),'calibration_start':str(c.cutoff.min()),'calibration_label_end':str(c.target_time.max()),'test_start':CONFIG['test_start'],'algorithm':best,'validation_candidates':scores,'features':cols,'calibration_radius':radius,'nominal_coverage':.9,'feature_bounds':{x:[float(t[x].min()) if pd.notna(t[x].min()) else None,float(t[x].max()) if pd.notna(t[x].max()) else None] for x in cols},'target_station_history_used':False,'weather_delay_days':120,'publication_caveat':'Final reanalysis delayed 120 days; exact as-of weather vintages unavailable. Pollution publication delays unknown. Historical evaluation is not a verified operational backtest.'}
          artifact={'pipeline':p,'metadata':meta};joblib.dump(artifact,path,compress=3);(ROOT/'models'/f'{name}.json').write_text(json.dumps(meta,indent=2));print('SAVED',name,len(t),'rows',flush=True)
        manifests.append(meta)
        # Multiple losses are evaluated for network and unseen folds; repeat seeds for all.
        patterns=CONFIG['loss_patterns'] if excluded is None else ['random']
        for pattern in patterns:
         for level in CONFIG['loss_levels']:
          for seed in CONFIG['seeds']:
            out=ROOT/'evaluation/predictions'/f'{name}_{pattern}_{int(level*100)}_{seed}.csv.gz';metrics_path=out.with_suffix('.metrics.json')
            if out.exists() and metrics_path.exists():summary+=json.loads(metrics_path.read_text());continue
            f=build(stations,wide,weather,pollutant,excluded,level,pattern,seed,targets=[excluded] if excluded else None);f=f[(f.cutoff>=test_start)&f.actual.notna()].copy();valid=f.eligible.to_numpy();pred=np.full(len(f),np.nan)
            if valid.any():pred[valid]=np.maximum(0,artifact['pipeline'].predict(f.loc[valid,meta['features']]))
            f['ml']=pred;f['lower']=np.maximum(0,pred-meta['calibration_radius']);f['upper']=pred+meta['calibration_radius'];records=[]
            allmethods=np.isfinite(f[['ml','idw','persistence']]).all(axis=1).to_numpy();spatial=np.isfinite(f[['ml','idw']]).all(axis=1).to_numpy()
            for cohort,keep in [('available',np.ones(len(f),bool)),('common_three',allmethods),('common_spatial',spatial),('target_missing_common',allmethods&f.target_current_missing.to_numpy())]:
              for method in ['ml','idw','persistence']:
                g=f.loc[keep];m=metrics(g.actual,g[method],g.lower.to_numpy() if method=='ml' else None,g.upper.to_numpy() if method=='ml' else None);records.append({'pollutant':pollutant,'fold':excluded or 'network','pattern':pattern,'loss_level':level,'seed':seed,'method':method,'cohort':cohort,'reference_targets':len(f),'availability':float(np.isfinite(f[method]).mean()) if len(f) else 0,'station_coverage':int(f.loc[np.isfinite(f[method]),'station'].nunique()),'horizon_hours':1,'period_start':str(f.target_time.min()),'period_end':str(f.target_time.max()),**m})
            summary+=records;metrics_path.write_text(json.dumps(records,indent=2));f[['station','pollutant','cutoff','target_time','weather_reference_time','actual','ml','idw','persistence','persistence_age','lower','upper','neighbor_count','nearest_km','max_donor_age','target_current_missing']].to_csv(out,index=False,compression='gzip')
        (ROOT/'evaluation/metrics.json').write_text(json.dumps(summary,indent=2));(ROOT/'evaluation/model_manifest.json').write_text(json.dumps(manifests,indent=2))
    pd.DataFrame(summary).to_csv(ROOT/'evaluation/metrics.csv',index=False);print('COMPLETE',len(manifests),'models',len(summary),'metric entries',flush=True)
if __name__=='__main__':main()
