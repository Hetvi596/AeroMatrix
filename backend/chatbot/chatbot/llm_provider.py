"""Gemini REST, Ollama, or explicitly configured compatible endpoint; no tools execute here."""
import json
import re
from urllib.parse import quote
import httpx

class LLMError(Exception): pass

class LLM:
    def __init__(self, settings): self.s=settings

    def configured(self):
        return self.s.provider!='disabled' and (self.s.provider!='gemini' or bool(self.s.api_key))

    async def generate(self, messages, schema=None):
        if not self.configured():raise LLMError('Language model is not configured. Set GEMINI_API_KEY locally or configure Ollama.')
        s=self.s
        headers={}
        if s.provider=='gemini':
            headers['x-goog-api-key']=s.api_key
            url=f'{s.llm_url}/models/{quote(s.model,safe="-")}:generateContent'
            system='\n'.join(x['content'] for x in messages if x['role']=='system')
            body={'systemInstruction':{'parts':[{'text':system}]},'contents':[{'role':'model' if m['role']=='assistant' else 'user','parts':[{'text':m['content']}]} for m in messages if m['role']!='system'], 'generationConfig':{'temperature':0.2,'maxOutputTokens':1200}}
            if schema:body['generationConfig'].update(responseMimeType='application/json',responseJsonSchema=schema)
        elif s.provider=='ollama':
            url=s.llm_url+'/api/chat'
            body={'model':s.model,'messages':messages,'stream':False,'think':False,'options':{'temperature':0.2,'num_ctx':8192,'num_predict':1000}}
            if schema:body['format']=schema
        else:
            url=s.llm_url+'/chat/completions'
            if s.api_key:headers['Authorization']='Bearer '+s.api_key
            body={'model':s.model,'messages':messages,'temperature':0.2,'max_tokens':1200,'stream':False}
            if schema:body['response_format']={'type':'json_schema','json_schema':{'name':'route','strict':True,'schema':schema}}
        try:
            async with httpx.AsyncClient(timeout=s.llm_timeout,follow_redirects=False,trust_env=False) as client:
                response=await client.post(url,headers=headers,json=body)
            if response.status_code>=400:
                raise LLMError(f'Language provider returned HTTP {response.status_code}. Check model access, key, quota or provider availability.')
            if len(response.content)>2_000_000:raise LLMError('Language provider response exceeded limit')
            result=response.json()
            if s.provider=='gemini':
                candidates=result.get('candidates',[])
                answer=''.join(p.get('text','') for p in (candidates[0].get('content',{}).get('parts',[]) if candidates else []) if not p.get('thought'))
            elif s.provider=='ollama':answer=result['message']['content']
            else:answer=result['choices'][0]['message']['content']
            answer=re.sub(r'<think>.*?</think>','',answer or '',flags=re.S).strip()
            if not answer:raise LLMError('Language provider returned no text; the request may have been blocked')
            return answer
        except httpx.TimeoutException:raise LLMError('Language model timed out. Retry or select a faster model.') from None
        except (httpx.HTTPError,ValueError,KeyError,IndexError,TypeError):raise LLMError('Language model connection or response failed') from None

    async def health(self):
        if not self.configured():return {'configured':False,'available':False,'provider':self.s.provider,'model':self.s.model}
        try:
            async with httpx.AsyncClient(timeout=5,trust_env=False) as client:
                if self.s.provider=='gemini':
                    response=await client.get(f'{self.s.llm_url}/models/{quote(self.s.model,safe="-")}',headers={'x-goog-api-key':self.s.api_key})
                else:response=await client.get(self.s.llm_url+('/api/tags' if self.s.provider=='ollama' else '/models'),headers={'Authorization':'Bearer '+self.s.api_key} if self.s.api_key else {})
            available=response.is_success
            if available and self.s.provider=='ollama': available=any(x['name']==self.s.model for x in response.json().get('models',[]))
            return {'configured':True,'available':available,'provider':self.s.provider,'model':self.s.model,'http_status':response.status_code,'inference_tested':False}
        except (httpx.HTTPError,ValueError):return {'configured':True,'available':False,'provider':self.s.provider,'model':self.s.model}
