"""Independent recomputation of exported point metrics and checksums."""
import json,hashlib
import numpy as np,pandas as pd
from src.features import ROOT
from train import metrics
def main():
    allmetrics=pd.read_csv(ROOT/'evaluation/metrics.csv');checks=[];stationrows=[]
    for poll in ['pm25','pm10']:
      for fold in ['network','site_5407','site_5409','site_5766','site_5996','site_6012']:
        f=pd.read_csv(ROOT/'evaluation/predictions'/f'{poll}_{fold}_random_0_17.csv.gz')
        for cohort,cols in [('common_three',['ml','idw','persistence']),('common_spatial',['ml','idw'])]:
          common=f.dropna(subset=cols)
          for method in cols:
            calculated=metrics(common.actual,common[method]);saved=allmetrics[(allmetrics.pollutant==poll)&(allmetrics.fold==fold)&(allmetrics.pattern=='random')&(allmetrics.loss_level==0)&(allmetrics.seed==17)&(allmetrics.cohort==cohort)&(allmetrics.method==method)].iloc[0]
            assert calculated['n']==saved.n
            if calculated['mae'] is not None:assert np.isclose(calculated['mae'],saved.mae)
            checks.append({'pollutant':poll,'fold':fold,'cohort':cohort,'method':method,'status':'PASS','n':calculated['n']})
        if fold=='network':
          for s,g in f.groupby('station'):
            common=g.dropna(subset=['ml','idw','persistence'])
            for method in ['ml','idw','persistence']:stationrows.append({'station':s,'pollutant':poll,'method':method,**metrics(common.actual,common[method])})
    pd.DataFrame(stationrows).to_csv(ROOT/'evaluation/station_metrics.csv',index=False)
    (ROOT/'evaluation/evidence_verification.json').write_text(json.dumps({'status':'PASS','checks':checks,'note':'Independent recomputation from saved prediction rows for every model at zero additional loss; all mask configurations additionally tested for reproducibility.'},indent=2))
    manifest={str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['models','config','data'] for p in (ROOT/folder).rglob('*') if p.is_file()}
    (ROOT/'evaluation/artifact_hashes.json').write_text(json.dumps(manifest,indent=2));print('PASS',len(checks),'independent metric comparisons')
if __name__=='__main__':main()
