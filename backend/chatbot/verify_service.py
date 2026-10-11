"""Real HTTP checks. LLM absence is recorded as NOT_RUN, never a successful intelligence test."""
import argparse,json,os,socket,subprocess,sys,time
from pathlib import Path
import httpx
from chatbot.config import Settings

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--start',action='store_true');parser.add_argument('--url');parser.add_argument('--output',default='runtime/service_test_results.json');args=parser.parse_args()
    settings=Settings();process=None;results=[];headers={'X-API-Key':settings.service_key} if settings.service_key else {}
    base=args.url or f'http://127.0.0.1:{settings.port}'
    try:
        if args.start:
            with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
            env={**os.environ,'CHATBOT_PORT':str(port),'CHATBOT_HOST':'127.0.0.1','REQUESTS_PER_MINUTE':'200'}
            process=subprocess.Popen([sys.executable,'-m','chatbot.main'],cwd=Path(__file__).resolve().parent,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            base=f'http://127.0.0.1:{port}'
        with httpx.Client(base_url=base,timeout=settings.llm_timeout*2+20,headers=headers,trust_env=False) as client:
            for _ in range(60):
                try:
                    if client.get('/health').status_code==200:break
                except httpx.HTTPError:pass
                time.sleep(.5)
            else:raise RuntimeError('Chatbot failed to start')
            caps=client.get('/capabilities').json()
            for message in ['What is AeroMatrix?','Which Pune locations have actual monitoring stations?','Predict historical PM2.5 in Hadapsar.','What is the current AQI in Hadapsar?']:
                begin=time.perf_counter();r=client.post('/chat',json={'message':message});r.raise_for_status();d=r.json()
                assert d.get('answer')
                results.append({'question':message,'status':'PASS' if d['data_status']!='unavailable' else 'UNAVAILABLE','answer':d['answer'],'intent':d['intent'],'data_status':d['data_status'],'seconds':round(time.perf_counter()-begin,3)})
            first=client.post('/chat',json={'message':'What is the AQI in Hadapsar?'}).json()
            follow=client.post('/chat',headers={'X-Session-Token':first['session_token']},json={'session_id':first['session_id'],'message':'What about Kothrud?'}).json()
            assert follow['intent']=='observation' and follow['data'][0]['region']=='Kothrud'
            results.append({'test':'multi_turn_followup','status':'PASS'})
            if caps.get('llm',{}).get('available'):
                for lang,question in [('en','Explain machine learning in two sentences.'),('en','Write a Python function that squares a number.'),('en','What is 7 times 8?'),('en','Explain climate change briefly.'),('hi','वायु प्रदूषण क्या है?'),('hinglish','Machine learning kya hai? Simple Hinglish mein samjhao.')]:
                    begin=time.perf_counter();r=client.post('/chat',json={'message':question,'language':lang});r.raise_for_status();d=r.json()
                    results.append({'question':question,'language':lang,'status':'GENERATED_REVIEW_REQUIRED' if d['model_used'] else 'FAILED','answer':d['answer'],'seconds':round(time.perf_counter()-begin,3),'model_used':d['model_used']})
            else:results.append({'test':'live_general_English_Hindi_Hinglish','status':'NOT_RUN','reason':'Configured language model unavailable or key missing; no offline intelligence claimed'})
        report={'capabilities':caps,'results':results,'original_project_needed':False,'test_time':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
        path=Path(args.output);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
        print(json.dumps({'report':str(path),'checks':len(results),'live_llm':caps.get('llm'),'note':'Review saved answers for factual and language quality; NOT_RUN is not PASS.'}))
    finally:
        if process:
            process.terminate()
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:process.kill();process.wait()

if __name__=='__main__':main()
