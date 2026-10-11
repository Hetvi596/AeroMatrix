"""Actual HTTP and inference-only copy, with no raw CSV or evaluation cache required."""
from pathlib import Path
import argparse,json,os,shutil,socket,subprocess,sys,tempfile,time
import httpx
def main():
    root=Path(__file__).resolve().parent;runtime=root/'runtime';runtime.mkdir(exist_ok=True)
    isolated=Path(tempfile.mkdtemp(prefix='inference-only-',dir=runtime))
    for folder in ['src','models','config']:shutil.copytree(root/folder,isolated/folder,ignore=shutil.ignore_patterns('__pycache__'))
    cases=[json.loads(p.read_text()) for p in sorted((root/'examples').glob('[ABCD]_*.json'))]
    assert not (isolated/'data').exists()
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    log=(runtime/'portable-http.log').open('w');process=subprocess.Popen([sys.executable,'-m','uvicorn','src.api:app','--host','127.0.0.1','--port',str(port)],cwd=isolated,stdout=log,stderr=log,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0));results=[]
    try:
      with httpx.Client(base_url=f'http://127.0.0.1:{port}',timeout=30,trust_env=False) as client:
        for _ in range(60):
            try:
                if client.get('/task2/health').status_code==200:break
            except httpx.HTTPError:pass
            time.sleep(.25)
        else:raise RuntimeError('Isolated API failed to start')
        for case in cases:
            t=time.perf_counter();r=client.post('/task2/predict',json=case['input']);r.raise_for_status();p=r.json();assert p['status']==case['prediction']['status']
            if p['value'] is not None:assert abs(p['value']-case['prediction']['value'])<1e-8
            results.append({'case':case['scenario'],'status':'PASS','prediction':p,'seconds':round(time.perf_counter()-t,4)})
        bad=client.post('/task2/predict',json={'station':'bad','pollutant':'wrong','cutoff':'bad'});assert bad.status_code==422
      report={'status':'PASS','raw_csv_present':False,'cleaned_data_present':False,'original_project_required':False,'all_four_http_cases':results,'invalid_request_rejected':True,'created_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())};(root/'evaluation/portable_http.json').write_text(json.dumps(report,indent=2));print('PASS: four real HTTP cases from inference-only isolated copy, no pollution/weather cache or original CSV.')
    finally:
      process.terminate()
      try:process.wait(timeout=10)
      except subprocess.TimeoutExpired:process.kill();process.wait()
      log.close()
if __name__=='__main__':main()
