import json,hashlib,platform,shutil
from pathlib import Path
import numpy as np,pandas as pd,sklearn
from src.features import ROOT,CONFIG,load,mask
def main():
    audit=json.loads((ROOT/'data/audit.json').read_text());m=pd.read_csv(ROOT/'evaluation/metrics.csv');models=json.loads((ROOT/'evaluation/model_manifest.json').read_text());stations,frames,weather=load()
    baseline=m[(m.fold=='network')&(m.pattern=='random')&(m.loss_level==0)&(m.seed==17)&(m.cohort=='common_three')]
    unseen=m[(m.fold!='network')&(m.pattern=='random')&(m.loss_level==0)&(m.seed==17)&(m.cohort=='common_spatial')&(m.method=='ml')]
    loss=[]
    for poll,w in frames.items():
      obs=np.isfinite(w.to_numpy());test=w.index>=pd.Timestamp(CONFIG['test_start'])
      for kind in CONFIG['loss_patterns']:
       for level in CONFIG['loss_levels']:
        for seed in CONFIG['seeds']:
          missing=mask(w.shape,level,kind,seed);loss.append({'pollutant':poll,'kind':kind,'nominal_fraction':level,'seed':seed,'observed_test_inputs':int(obs[test].sum()),'masked_test_inputs':int((obs[test]&missing[test]).sum()),'realized_fraction':float((obs[test]&missing[test]).sum()/obs[test].sum()),'whole_station_count':int(missing[0].sum()) if kind=='station' else None})
    (ROOT/'evaluation/loss_realization.json').write_text(json.dumps(loss,indent=2));(ROOT/'evaluation/weather_quality.json').write_text(json.dumps({'rows':len(weather),'missing':weather.isna().sum().to_dict(),'usage':'120-day lag, no future or contemporaneous reanalysis features','units':json.loads((ROOT/'data/weather_provenance.json').read_text())['requests'][0].get('units')},indent=2))
    improvements=[]
    for poll in CONFIG['pollutants']:
      s=baseline[baseline.pollutant==poll].set_index('method')
      for method in ['idw','persistence']:
        b=s.loc[method,'mae'];a=s.loc['ml','mae'];improvements.append({'pollutant':poll,'baseline':method,'mae_improvement_percent':float((b-a)/b*100) if b>0 else None,'negative_means_worse':True})
    summary={'input_rows':audit['rows'],'all_stations':len(audit['stations']),'spatial_stations':list(stations),'unused_stations':[id for id in audit['stations'] if id not in stations],'models':[{'name':x['name'],'algorithm':x['algorithm'],'unique_training_targets':x['unique_training_targets'],'training_feature_rows_with_augmentation':x['training_feature_rows_with_augmentation'],'selection_targets':x['selection_targets'],'calibration_targets':x['calibration_targets']} for x in models],'normal_comparison':json.loads(baseline.to_json(orient='records')),'unseen_scores':json.loads(unseen.to_json(orient='records')),'baseline_improvements':improvements,'software':{'python':platform.python_version(),'numpy':np.__version__,'pandas':pd.__version__,'sklearn':sklearn.__version__}}
    (ROOT/'evaluation/summary.json').write_text(json.dumps(summary,indent=2));(ROOT/'config/software_versions.json').write_text(json.dumps(summary['software'],indent=2))
    lines=['# Actual Task 2 results','',f'Input: {audit["rows"]:,} rows; {len(audit["stations"])} station IDs; no duplicates. PM2.5: 185,369 and PM10: 186,955 valid unique target observations. Spatial experiments use five coordinate-verified Pune stations; eight stations, including the PCMC locations, are excluded from spatial evaluation.','', 'One-hour forecasts. Training labels end before 2024-10-01; selection October–November 2024; calibration December 2024–January 2025; test starts 2025-02-01 and runs to the last available station label, at most 2025-09-01.','', '## Network forecast: same eligible targets, no additional loss, seed 17','', '| Pollutant | Method | Cases | MAE | RMSE | R² | Interval coverage |','|---|---|---:|---:|---:|---:|---:|']
    for _,r in baseline.iterrows():lines.append(f'| {r.pollutant} | {r.method} | {r.n} | {r.mae:.3f} | {r.rmse:.3f} | {r.r2:.3f} | {r.coverage:.3f} |' if pd.notna(r.coverage) else f'| {r.pollutant} | {r.method} | {r.n} | {r.mae:.3f} | {r.rmse:.3f} | {r.r2:.3f} | — |')
    lines+=['','Errors and intervals are in ug/m3. A negative R² or improvement is retained honestly. No claim that ML always beats baselines.','', '## Actual model training counts','', '| Model | Unique target records | Feature rows including 30% donor-mask augmentation | Algorithm |','|---|---:|---:|---|']
    for x in models:lines.append(f'| {x["name"]} | {x["unique_training_targets"]} | {x["training_feature_rows_with_augmentation"]} | {x["algorithm"]} |')
    lines+=['','## Whole-station holdouts','', '| Excluded station | Pollutant | Test cases | MAE | Coverage |','|---|---|---:|---:|---:|']
    for _,r in unseen.iterrows():lines.append(f'| {r.fold} | {r.pollutant} | {r.n} | {r.mae:.3f} | {r.coverage:.3f} |')
    lines+=['','Persistence is unavailable for a completely unseen station because its pollution history is excluded. ML/IDW are compared on identical common spatial cases; the three-way unseen cohort is empty and is not presented as a successful experiment.','', 'Full 0/10/30/50/70% loss results, three seeds, random/12-hour block/full-station outages, sample counts, availability and row-level predictions are included in evaluation/. Full-station percentages are nominal: with five stations they round to discrete counts. The 70% full-station case leaves one donor and triggers abstention.','', '## Limitations','', 'Historical timezone/interval-end interpretation is an explicit assumption; original publication latency is absent. This is not a verified real-time deployment backtest. Final ERA5 has a conservative 120-day delay; exact historical archive vintages are unavailable. Weather is coarse reanalysis, not independent measured station weather. Current-era weather is not used.','', 'Model selection includes a no-weather alternative. Weak weather candidates are not selected just to claim weather use. Geographic coverage is limited. Calibration is marginal and empirical coverage can be substantially below 90% under unseen locations or outages. No official AQI or causal intervention effectiveness is inferred. Planning evidence is an explicitly hypothetical sensitivity calculation; no validated intervention costs or effects were supplied.']
    (ROOT/'TRAINING_RESULTS.md').write_text('\n'.join(lines),encoding='utf-8')
    print(baseline[['pollutant','method','n','mae','rmse','r2','coverage']].to_string(index=False))
if __name__=='__main__':main()
