import {afterEach,it,expect,vi} from 'vitest';
import {ChatbotAdapter} from '../services/chatbotAdapter';
afterEach(()=>vi.unstubAllGlobals());
it('passes context and isolates session credentials',async()=>{
  const mock=vi.fn(async()=>({ok:true,json:async()=>({answer:'Protocol test text, not a generated answer',session_id:'test-session',session_token:'test-token'})}));vi.stubGlobal('fetch',mock);
  const adapter=new ChatbotAdapter('http://localhost:8010');const signal=new AbortController().signal;
  await adapter.chat('Hello',{selected_region:'Hadapsar'},'hi',false,signal);await adapter.chat('Follow up',{},'en',false,signal);
  const first=mock.mock.calls[0] as unknown as [string,RequestInit],second=mock.mock.calls[1] as unknown as [string,RequestInit];expect(JSON.parse(first[1].body as string).context.selected_region).toBe('Hadapsar');expect((second[1].headers as Record<string,string>)['X-Session-Token']).toBe('test-token');expect(JSON.parse(second[1].body as string).session_id).toBe('test-session');
});
it('shows disconnected state without a fabricated answer',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('Disconnected');}));await expect(new ChatbotAdapter('http://localhost:8010').chat('AQI?',{},'en',false,new AbortController().signal)).rejects.toThrow(/isn’t reachable.*No answer was generated/);});
it('passes the cancellation signal',async()=>{const signal=new AbortController().signal;const mock=vi.fn(async(_url,options)=>{expect(options.signal).toBe(signal);throw new DOMException('Aborted','AbortError');});vi.stubGlobal('fetch',mock);await expect(new ChatbotAdapter('http://localhost:8010').chat('Hello',{},'en',false,signal)).rejects.toThrow('Aborted');});
