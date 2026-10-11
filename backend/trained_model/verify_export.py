"""Run real HTTP tests against this extracted package; never trains a model."""
from pathlib import Path
import ast
import hashlib
import json
import math
import os
import socket
import subprocess
import sys
import time
from urllib.request import urlopen, Request
from urllib.error import HTTPError

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
os.environ.pop('PYTHONPATH',None)
os.environ['PYTHONWARNINGS']='ignore::DeprecationWarning'
import pandas as pd
from api import inference
from preprocessing.features import features,predict
from preprocessing.aqi import calculate_aqi,subindex

def main():
    checks=[]
    def check(condition,label):
        if not condition: raise AssertionError(label)
        checks.append(label)
    for filename in list((ROOT/'api').glob('*.py'))+list((ROOT/'preprocessing').glob('*.py')):
        tree=ast.parse(filename.read_text(encoding='utf-8'))
        check(not any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr in ('fit','fit_transform','partial_fit') for n in ast.walk(tree)),f'No training calls: {filename.relative_to(ROOT)}')
    before={p:hashlib.sha256((ROOT/m['artifact']).read_bytes()).hexdigest() for p,m in inference.MANIFEST['models'].items()}
    check(all(before[p]==m['sha256'] for p,m in inference.MANIFEST['models'].items()),'All 12 artifact SHA256 hashes match manifest')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    env=os.environ.copy();env.pop('PYTHONPATH',None)
    env['AEROMATRIX_HOST']='127.0.0.1';env['AEROMATRIX_PORT']=str(port)
    log=open(ROOT/'verification/server.log','w',encoding='utf-8')
    command=['cmd.exe','/d','/c','START_MODEL_API.bat'] if os.name=='nt' else [sys.executable,'-m','api.main']
    process=subprocess.Popen(command,cwd=ROOT,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    def get(path):
        with urlopen(f'http://127.0.0.1:{port}{path}',timeout=60) as response: return json.load(response)
    def post(payload):
        request=Request(f'http://127.0.0.1:{port}/forecast',json.dumps(payload,allow_nan=False).encode(),{'Content-Type':'application/json'})
        with urlopen(request,timeout=60) as response: return json.load(response)
    try:
        for attempt in range(120):
            if process.poll() is not None: raise RuntimeError('API exited; inspect verification/server.log')
            try: health=get('/health');break
            except OSError: time.sleep(.5)
        else: raise TimeoutError('API startup exceeded 60 seconds')
        check(health['model_count']==12 and health['training_on_startup'] is False,'Independent HTTP health and startup model loading through START_MODEL_API.bat')
        reference=json.loads((ROOT/'verification/direct_inference_reference.json').read_text())
        count=0;max_error=0.;examples={};comparison=[]
        for station,targets in reference.items():
            response=get(f'/forecast?region={station}&allow_historical=true')
            for pollutant,expected in targets.items():
                result=response['pollutants'][pollutant]
                check(result['status']=='PREDICTED',f'{station}/{pollutant} available')
                check(result['historical'] and result['source']=='bundled_real_observation_context',f'{station}/{pollutant} truthful source and historical label')
                frame,item=inference.stored_history(station,pollutant)
                bundle,meta=inference.artifact(pollutant)
                engineered,_=features(frame,pollutant,24)
                row=engineered[engineered.time==pd.Timestamp(item['issued_at'])].copy()
                for column in bundle['features']:
                    if column not in row: row[column]=float('nan')
                direct=float(predict(bundle,row)[0])
                error=max(abs(result['value']-expected['value']),abs(result['value']-direct))
                check(error<1e-8,f'{station}/{pollutant} HTTP = direct artifact = full-data reference')
                check(result['model']['artifact_sha256']==before[pollutant] and result['unit']==meta['unit'],f'{station}/{pollutant} artifact provenance and unit')
                max_error=max(max_error,error);count+=1
                comparison.append({'station':station,'pollutant':pollutant,'api_value':result['value'],'original_direct_value':expected['value'],'portable_direct_value':direct,'absolute_error':error})
        for region in ('Hadapsar','Alandi','Shivajinagar'):
            response=get(f'/forecast?region={region}&allow_historical=true');examples[region]=response
            check(response['pollutants']['pm25']['status']=='PREDICTED',f'Supported alias {region}')
        check(len({examples[x]['pollutants']['pm25']['value'] for x in examples})==3,'Three real station contexts produce distinct PM2.5 predictions')
        check(get('/forecast?region=Hadapsar')['status']=='UNAVAILABLE','Stale bundled data never shown as a current forecast by default')
        check(get('/forecast?region=Kothrud&allow_historical=true')['status']=='UNAVAILABLE','Kothrud forecast withheld; no false Karve Road mapping')
        check(get('/forecast?region=Hadapsar&pollutant=spm&allow_historical=true')['status']=='UNAVAILABLE','Unsupported SPM withheld')
        check(get('/aqi/history?region=Kothrud')['status']=='SOURCE_REPORTED_AQI','Kothrud historical AQI available separately')
        regions=get('/regions');check(len(regions['station_locations'])==12 and len(regions['wards'])==58,'12 monitored station locations and 58 separately labelled wards')
        check(all(s['coordinate_status']=='unavailable' for s in regions['station_locations']),'Missing station coordinates never invented')
        check(get('/location?longitude=73.85&latitude=18.52')['status']=='UNAVAILABLE','Unmonitored spatial prediction withheld')
        check(len(get('/boundaries')['features'])==58,'Active boundary endpoint')
        check(get('/industry?longitude=73.85&latitude=18.52')['used_in_trained_forecasts'] is False,'Industry coverage and feature exclusion explicit')
        check(get('/industry/district-emissions')['status']=='DISTRICT_AGGREGATE','District emissions remain aggregates')
        measured=get('/pollution?region=Hadapsar');examples['measured_Hadapsar']=measured
        check(measured['historical'] and measured['status']=='MEASURED','Measured data source separated from forecasts')
        frame,_=inference.stored_history('site_5407','pm25')
        records=json.loads(frame[['time']+[p for p in inference.UNITS if p in frame]].assign(time=frame.time.map(lambda t:t.isoformat())).to_json(orient='records'))
        payload={'region':'Hadapsar','pollutants':['pm25'],'allow_historical':True,'units':inference.UNITS,
                 'observations':[{'time':r.pop('time'),'values':r} for r in records]}
        posted=post(payload);examples['POST_forecast']=posted
        check(abs(posted['pollutants']['pm25']['value']-reference['site_5407']['pm25']['value'])<1e-8,'POST real hourly input reproduces original direct inference')
        check(posted['pollutants']['pm25']['source']=='caller_supplied_observations','Caller history provenance explicit')
        check(posted['aqi']['status']=='UNAVAILABLE','A point forecast is not an AQI averaging window')
        check(calculate_aqi(frame.tail(15))['status']=='UNAVAILABLE','AQI rejects fewer than 16 observed hours')
        check(calculate_aqi(frame[['time','station','pm25']])['status']=='UNAVAILABLE','AQI rejects fewer than three eligible pollutants')
        check(subindex('pm25',30)['value']==50 and subindex('pm25',60)['value']==100 and subindex('co',1)['value']==50,'CPCB published breakpoint checks')
        check(subindex('o3',209) is None,'High ozone requires separately implemented one-hour rule')
        check(subindex('pm25',251)=={'value':401,'bounded':True},'Severe open-ended AQI is a lower bound')
        real_aqi=calculate_aqi(frame)
        if real_aqi['status'] in ('AVAILABLE','LOWER_BOUND'):
            check(real_aqi['value']==max(x['value'] for x in real_aqi['subindices'].values()),'Real AQI is maximum eligible subindex')
        for invalid,label in [({**payload,'units':{**inference.UNITS,'pm25':'mg/m3'}},'Wrong units rejected'),({**payload,'observations':payload['observations'][:-1]+[payload['observations'][0]]},'Duplicate timestamps rejected')]:
            try: post(invalid)
            except HTTPError as exc: check(exc.code==422,label)
            else: raise AssertionError(label)
        with urlopen(Request(f'http://127.0.0.1:{port}/health',headers={'Origin':'http://localhost:5173'})) as response:
            check(response.headers.get('access-control-allow-origin')=='http://localhost:5173','Default frontend CORS origin works')
        after={p:hashlib.sha256((ROOT/m['artifact']).read_bytes()).hexdigest() for p,m in inference.MANIFEST['models'].items()}
        check(before==after,'Model bytes unchanged by startup and inference')
        check(all(str(Path(module.__file__).resolve()).startswith(str(ROOT)) for module in [sys.modules['api.inference'],sys.modules['preprocessing.features']]),'Application imports resolved inside extracted package')
        for filename in ('api/main.py','api/inference.py','preprocessing/features.py'):
            check('AeroMatrix-main' not in (ROOT/filename).read_text(),f'No original project path in {filename}')
        check(Path(sys.prefix).resolve()==(ROOT/'.venv').resolve(),'Test runs in the extracted package own virtual environment')
        result={'status':'PASS','checked_at':pd.Timestamp.now(tz='UTC').isoformat(),'python':sys.version,'package_root':ROOT.name,'interpreter':str(Path(sys.executable).resolve().relative_to(ROOT)),
                'http_prediction_pairs':count,'maximum_absolute_parity_error':max_error,'checks_passed':len(checks),'checks':checks,'model_hashes':after,
                'limitations':['This is a local extracted-package test; not a test on the teammate laptop.','Fresh installation requires internet and Python 3.12.','No live input connector, verified station coordinates or unmonitored spatial model.']}
        (ROOT/'verification/results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        (ROOT/'verification/prediction_comparisons.json').write_text(json.dumps(comparison,indent=2),encoding='utf-8')
        (ROOT/'RESPONSE_EXAMPLES.json').write_text(json.dumps(examples,indent=2,ensure_ascii=False),encoding='utf-8')
        (ROOT/'verification/real_history_request.json').write_text(json.dumps(payload,indent=2),encoding='utf-8')
        print(json.dumps({k:v for k,v in result.items() if k not in ('checks','model_hashes')},indent=2))
    finally:
        if os.name=='nt':
            # Only terminate the exact process tree this verifier created.
            subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)
        else: process.terminate()
        try: process.wait(timeout=10)
        except subprocess.TimeoutExpired: process.kill();process.wait()
        log.close()

if __name__=='__main__': main()
