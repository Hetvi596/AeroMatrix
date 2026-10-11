import json
import numpy as np,pandas as pd,pytest,joblib
from src.features import ROOT,CONFIG,load,mask,build
from src.inference import predict
from demos import payload_for
def examples():return [json.loads(p.read_text()) for p in sorted((ROOT/'examples').glob('[ABCD]_*.json'))]
def test_artifacts_and_splits():
    models=list((ROOT/'models').glob('*.joblib'));assert len(models)==12
    for path in models:
        a=joblib.load(path);m=a['metadata'];assert m['excluded_station'] not in m['training_stations'];assert not m['target_station_history_used'];assert pd.Timestamp(m['train_label_end'])<pd.Timestamp(CONFIG['selection_start']);assert pd.Timestamp(m['selection_label_end'])<pd.Timestamp(CONFIG['calibration_start']);assert pd.Timestamp(m['calibration_label_end'])<pd.Timestamp(CONFIG['test_start'])
def test_four_real_scenarios():
    e=examples();assert len(e)==4
    for x in e:
        p=predict(x['input']);assert p['status']==x['prediction']['status'];assert p['value']==pytest.approx(x['prediction']['value']) if p['value'] is not None else x['prediction']['value'] is None
    assert e[3]['prediction']['status']=='UNAVAILABLE'
def test_all_models_reload_and_predict():
    for path in (ROOT/'models').glob('*.joblib'):
        m=joblib.load(path)['metadata'];f=pd.read_csv(ROOT/'evaluation/predictions'/f'{m["name"]}_random_0_17.csv.gz');r=f[f.ml.notna()].iloc[0];payload=payload_for(r.station,m['pollutant'],r.cutoff,m['excluded_station']);p=predict(payload);assert np.isfinite(p['value']);assert p['value']==pytest.approx(r.ml);assert p['target_time']==pd.Timestamp(r.target_time).isoformat()
def test_unseen_target_history_cannot_change_prediction():
    e=next(x for x in examples() if x['scenario']=='C_unseen_station');payload=e['input'];before=predict(payload)
    payload['observations'].append({'station':payload['station'],'pollutant':'pm25','value':999999,'timestamp':payload['cutoff'],'available_at':payload['cutoff'],'category':'MEASURED','units':'ug/m3'})
    after=predict(payload);assert before['value']==after['value'];assert after['baselines']['persistence'] is None
def test_future_values_and_external_model_not_used():
    e=examples()[0];payload=e['input'];before=predict(payload)
    for r in payload['observations']:r['category']='MODELLED_EXTERNAL'
    assert predict(payload)['value'] is None
    payload=examples()[0]['input'];future=(pd.Timestamp(payload['cutoff'])+pd.Timedelta(hours=1)).isoformat()
    for r in payload['observations']:r['available_at']=future
    assert predict(payload)['value'] is None
@pytest.mark.parametrize('pattern',['random','block12h','station'])
@pytest.mark.parametrize('level',[0,.1,.3,.5,.7])
def test_reproducible_masks(pattern,level):assert np.array_equal(mask((100,5),level,pattern,17),mask((100,5),level,pattern,17))
def test_whole_station_pollution_cannot_affect_development_features():
    stations,frames,weather=load();w=frames['pm25'].iloc[-100:].copy();a=build(stations,w,weather,'pm25','site_5407');w['site_5407']=999999;b=build(stations,w,weather,'pm25','site_5407');pd.testing.assert_frame_equal(a,b)
def test_weather_is_delayed_not_contemporaneous():
    stations,frames,weather=load();f=build(stations,frames['pm25'].iloc[-100:],weather,'pm25');assert ((f.cutoff-f.weather_reference_time)>=pd.Timedelta(days=120)).all()
def test_uncertainty_evidence_and_baseline_comparison():
    m=pd.read_csv(ROOT/'evaluation/metrics.csv');assert set(m.loss_level)=={0,.1,.3,.5,.7};assert (m[(m.fold!='network')&(m.method=='persistence')].n==0).all()
    c=m[m.cohort=='common_three'];assert c.groupby(['pollutant','fold','pattern','loss_level','seed']).n.nunique().max()==1
def test_hypothetical_planning_feasible():
    r=json.loads((ROOT/'evaluation/intervention_sensitivity.json').read_text());assert r['status']=='HYPOTHETICAL_SENSITIVITY';assert all(x['feasible'] for x in r['scenarios']);assert any(not x['original_package_feasible'] for x in r['scenarios'])
