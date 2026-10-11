"""One chunked scan of the exact supplied CSV, with cached cleaned target observations."""
from pathlib import Path
import argparse,json,hashlib
import numpy as np,pandas as pd
ROOT=Path(__file__).resolve().parent
def main():
    p=argparse.ArgumentParser();p.add_argument('--csv',required=True);a=p.parse_args();path=Path(a.csv)
    for name in ['data','models','evaluation','config','documentation','tests']:(ROOT/name).mkdir(exist_ok=True)
    report={'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'rows':0,'schema':[],'stations':{},'parameters':{},'units':{},'sources':{},'missing':{},'invalid_timestamps':0,'nonfinite_values':0,'negative_values':0};hashes=[];keys=[];targets=[]
    for c in pd.read_csv(path,chunksize=200000):
        report['rows']+=len(c);report['schema']=list(c.columns)
        hashes.append(pd.util.hash_pandas_object(c,index=False).to_numpy());keys.append(pd.util.hash_pandas_object(c[['station_id','parameter_name','collected_at']],index=False).to_numpy())
        for field,out in [('parameter_name','parameters'),('source','sources')]:
            for k,v in c[field].value_counts(dropna=False).items():report[out][str(k)]=report[out].get(str(k),0)+int(v)
        for k,v in c.isna().sum().items():report['missing'][k]=report['missing'].get(k,0)+int(v)
        for _,s in c[['station_id','station_name','city_name']].drop_duplicates().iterrows():report['stations'][s.station_id]={'name':s.station_name,'city':s.city_name,'latitude':None,'longitude':None,'coordinate_status':'missing in supplied CSV'}
        for name,g in c.groupby('parameter_name'):
            report['units'][name]=sorted(set(report['units'].get(name,[])+g.unit.dropna().tolist()))
        t=pd.to_datetime(c.collected_at,errors='coerce');report['invalid_timestamps']+=int(t.isna().sum());report['start']=min(report.get('start',str(t.min())),str(t.min()));report['end']=max(report.get('end',str(t.max())),str(t.max()))
        value=pd.to_numeric(c.value,errors='coerce');report['nonfinite_values']+=int((~np.isfinite(value)).sum());report['negative_values']+=int((value<0).sum())
        targets.append(c[c.parameter_name.isin(['PM2.5','PM10'])])
    rowhash=np.concatenate(hashes);keyhash=np.concatenate(keys);report['exact_duplicate_rows']=int(len(rowhash)-len(np.unique(rowhash)));report['duplicate_key_rows']=int(len(keyhash)-len(np.unique(keyhash)));report['duplicate_method']='64-bit pandas row/key hashes for complete-file audit; target conflicts subsequently verified by exact group values'
    f=pd.concat(targets);f['pollutant']=f.parameter_name.map({'PM2.5':'pm25','PM10':'pm10'});f['timestamp']=pd.to_datetime(f.collected_at,errors='coerce').dt.tz_localize('Asia/Kolkata').dt.tz_convert('UTC');f['value']=pd.to_numeric(f.value,errors='coerce')
    valid=np.isfinite(f.value)&(f.value>=0)&f.unit.isin(['µg/m³','μg/m³','ug/m3'])&f.timestamp.notna();report['target_invalid_excluded']=int((~valid).sum());f=f[valid]
    g=f.groupby(['station_id','pollutant','timestamp']).value.agg(['nunique','count','first']).reset_index();report['conflicting_target_keys_excluded']=int((g.nunique if False else g['nunique']>1).sum());report['exact_target_duplicates_removed']=int((g['count']-g['nunique']).sum())
    g=g[g['nunique']==1].rename(columns={'first':'value'})[['station_id','pollutant','timestamp','value']];local=g.timestamp.dt.tz_convert('Asia/Kolkata');off=(local.dt.minute!=0)|(local.dt.second!=0);report['off_hour_target_rows_excluded']=int(off.sum());g=g[~off];report['valid_unique_targets']=g.groupby('pollutant').size().to_dict();report['large_positive_values_retained']=int((g.value>1000).sum())
    report['coverage']=[]
    for (s,poll),z in g.groupby(['station_id','pollutant']):
        t=z.timestamp.sort_values();hours=int((t.max()-t.min()).total_seconds()/3600)+1
        report['coverage'].append({'station':s,'pollutant':poll,'n':len(z),'start':str(t.min()),'end':str(t.max()),'expected_hourly_bins':hours,'missing_hourly_bins':hours-len(z),'non_hourly_gaps':int((t.diff().dropna()!=pd.Timedelta(hours=1)).sum()),'min':float(z.value.min()),'max':float(z.value.max())})
    report['timestamp_assumption']='CSV has naive timestamps. Interpreted as Asia/Kolkata because source is CPCB India; explicit timezone/publication timestamps are absent. Treat as hourly interval-end values, available at cutoff in retrospective evaluation; live arrival latency unverified.'
    report['coordinates_present']=False;report['weather_columns_present']=False
    g.to_csv(ROOT/'data/pollution.csv.gz',index=False,compression='gzip');(ROOT/'data/audit.json').write_text(json.dumps(report,indent=2));(ROOT/'config/stations.json').write_text(json.dumps(report['stations'],indent=2));print(json.dumps({k:report[k] for k in ['rows','start','end','exact_duplicate_rows','duplicate_key_rows','valid_unique_targets','target_invalid_excluded','conflicting_target_keys_excluded']},indent=2))
if __name__=='__main__':main()
