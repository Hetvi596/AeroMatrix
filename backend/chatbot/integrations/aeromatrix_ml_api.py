import json
import httpx

class MLAPI:
    def __init__(self,settings):self.s=settings

    async def get(self,path,params=None):
        allowed={'/health','/regions','/pollution','/forecast','/aqi/history','/model/metrics'}
        if path not in allowed:raise ValueError('Endpoint not allowed')
        if not self.s.ml_url:return {'status':'UNAVAILABLE','reason':'ML backend URL is not configured'}
        try:
            async with httpx.AsyncClient(timeout=self.s.ml_timeout,trust_env=False,follow_redirects=False) as client:
                async with client.stream('GET',self.s.ml_url+path,params=params) as response:
                    if not response.is_success:return {'status':'UNAVAILABLE','reason':f'ML backend returned HTTP {response.status_code}'}
                    chunks=[];size=0
                    async for chunk in response.aiter_bytes():
                        size+=len(chunk)
                        if size>3_000_000:return {'status':'UNAVAILABLE','reason':'ML response exceeded limit'}
                        chunks.append(chunk)
            data=json.loads(b''.join(chunks))
            if not isinstance(data,dict):return {'status':'UNAVAILABLE','reason':'Unexpected ML response schema'}
            return data
        except httpx.TimeoutException:return {'status':'UNAVAILABLE','reason':'ML backend timed out'}
        except (httpx.HTTPError,ValueError):return {'status':'UNAVAILABLE','reason':'ML backend is unreachable or returned invalid JSON'}
