import asyncio
import hmac
import json
import time
from collections import defaultdict,deque
from contextlib import asynccontextmanager
from fastapi import FastAPI,Header,HTTPException,Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse,StreamingResponse
from .config import Settings
from .schemas import ChatRequest,ChatResponse,SessionRequest
from .chat_engine import Engine
from integrations.open_meteo_proxy import OpenMeteoCache, router as open_meteo_router

def create_app(settings=None):
    settings=settings or Settings()
    @asynccontextmanager
    async def lifespan(app):
        app.state.engine=Engine(settings)
        yield
    app=FastAPI(title='AeroSage Standalone Chatbot',version='1.0.0',lifespan=lifespan,description='Grounded project retrieval, read-only AeroMatrix API tools, and configurable Gemini/local LLM. No training on startup.')
    app.add_middleware(CORSMiddleware,allow_origins=settings.cors,allow_methods=['GET','POST'],allow_headers=['Content-Type','X-Session-Token','X-API-Key'],expose_headers=['X-Cache','X-Fetched-At'])
    limits=defaultdict(deque)
    # Shared hourly Open-Meteo cache for the web app (cached map data has its own, larger allowance).
    app.include_router(open_meteo_router(OpenMeteoCache(settings.state_dir/'open_meteo_cache.json')))
    @app.middleware('http')
    async def guard(request:Request,call_next):
        if request.method=='OPTIONS':return await call_next(request)
        if settings.service_key and request.url.path not in ('/health',):
            if not hmac.compare_digest(request.headers.get('x-api-key',''),settings.service_key):return JSONResponse({'detail':'Unauthorized'},status_code=401)
        now=time.monotonic();ip=request.client.host if request.client else 'local'
        for key in list(limits):
            if not limits[key] or limits[key][-1]<now-60:del limits[key]
        data_path=request.url.path.startswith('/open-meteo/')
        q=limits[('data:' if data_path else '')+ip]
        while q and q[0]<now-60:q.popleft()
        if len(q)>=(settings.rate_limit*10 if data_path else settings.rate_limit):return JSONResponse({'detail':'Rate limit exceeded'},status_code=429,headers={'Retry-After':'60'})
        q.append(now)
        if request.method=='POST':
            data=bytearray()
            async for chunk in request.stream():
                data.extend(chunk)
                if len(data)>32000:return JSONResponse({'detail':'Request body too large'},status_code=413)
            request._body=bytes(data)
        response=await call_next(request)
        response.headers['Cache-Control']='no-store'
        response.headers['X-Content-Type-Options']='nosniff'
        return response

    @app.get('/health')
    async def health():return {'status':'ok','service':'AeroSage','version':'1.0.0','llm_configured':app.state.engine.llm.configured(),'training_on_startup':False}

    @app.get('/capabilities')
    async def capabilities():
        engine=app.state.engine
        llm,ml=await asyncio.gather(engine.llm.health(),engine.ml.get('/health'))
        return {'identity':'AeroSage — Your AI Environmental Copilot','llm':llm,'ml_backend':ml,'knowledge':engine.kb.status(),'languages':['en','hi','hinglish'],'language_note':'Generative language support depends on configured model; deterministic API cards preserve English technical labels and source reasons.','streaming':'SSE progress and buffered answer chunks; not provider token streaming','memory':'SQLite, token-isolated sessions, bounded history and expiring retention','simulation':'Optional read-only scenario adapter; current frontend simulator is not automatically connected','web_browsing':False,'suggested_questions':['What is AeroMatrix?','Which Pune locations have monitoring stations?','Show historical PM2.5 in Hadapsar.','How reliable are the models?','Explain machine learning.'],'welcome':'Hi, I’m AeroSage. Ask about AeroMatrix, pollution, or a general question.'}

    @app.get('/knowledge/status')
    async def knowledge_status():return app.state.engine.kb.status()

    @app.post('/chat',response_model=ChatResponse)
    async def chat(request:ChatRequest,x_session_token:str|None=Header(default=None)):
        return await app.state.engine.chat(request,x_session_token)

    @app.post('/chat/stream')
    async def stream(request:ChatRequest,x_session_token:str|None=Header(default=None)):
        # Authenticate existing sessions before starting the HTTP event stream.
        if request.session_id and x_session_token:
            app.state.engine.memory.load(request.session_id,x_session_token)
        def event(name,obj):return f'event: {name}\ndata: {json.dumps(obj,ensure_ascii=False)}\n\n'
        async def events():
            task=asyncio.create_task(app.state.engine.chat(request,x_session_token))
            try:
                yield event('status',{'message':'Retrieving sources and preparing an answer','streaming_mode':'buffered'})
                while not task.done():
                    done,_=await asyncio.wait({task},timeout=10)
                    if not done:yield ': keepalive\n\n'
                result=await task
                for start in range(0,len(result['answer']),160):
                    yield event('delta',{'text':result['answer'][start:start+160]})
                yield event('done',result)
            except HTTPException as exc:yield event('error',{'status':exc.status_code,'detail':exc.detail})
            except Exception:yield event('error',{'status':500,'detail':'Answer generation failed'})
            finally:
                if not task.done():task.cancel()
        return StreamingResponse(events(),media_type='text/event-stream',headers={'X-Accel-Buffering':'no'})

    @app.post('/session/reset')
    async def reset(request:SessionRequest,x_session_token:str|None=Header(default=None)):
        engine=app.state.engine
        async with engine.locks[hash(request.session_id)%len(engine.locks)]:engine.memory.reset(request.session_id,x_session_token)
        return {'reset':True,'session_id':request.session_id}
    return app

app=create_app()

if __name__=='__main__':
    import uvicorn
    s=Settings()
    uvicorn.run('chatbot.main:app',host=s.host,port=s.port,workers=1,access_log=False)
