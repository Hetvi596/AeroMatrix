import {afterEach,describe,it,expect,vi} from 'vitest';
import {createRecognition,type Recognition} from '../services/speechToText';
import {Speaker} from '../services/textToSpeech';
afterEach(()=>vi.unstubAllGlobals());
describe('speech lifecycle (mocked browser engines, not microphone/audio tests)',()=>{
  it('does not start late speech in a hidden tab',()=>{const speak=vi.fn();vi.stubGlobal('document',{hidden:true});vi.stubGlobal('window',{speechSynthesis:{speak,cancel:vi.fn(),getVoices:()=>[{lang:'en-IN'}]}});new Speaker(vi.fn(),vi.fn()).speak('Late reply','en');expect(speak).not.toHaveBeenCalled();});
  it('does not start recording during initialization',()=>{
    const start=vi.fn();class Engine{start=start;stop=vi.fn();abort=vi.fn();}
    vi.stubGlobal('window',{isSecureContext:true,SpeechRecognition:Engine});
    const r=createRecognition('en-IN',{start:vi.fn(),end:vi.fn(),error:vi.fn(),result:vi.fn()});
    expect(start).not.toHaveBeenCalled();expect(r.continuous).toBe(false);r.start();expect(start).toHaveBeenCalledTimes(1);
  });
  it('reports denied microphone permission',()=>{
    class Engine{}vi.stubGlobal('window',{isSecureContext:true,SpeechRecognition:Engine});const error=vi.fn();const r=createRecognition('hi-IN',{start:vi.fn(),end:vi.fn(),error,result:vi.fn()});r.onerror?.({error:'not-allowed'});expect(error.mock.calls[0][0]).toContain('denied');expect(r.lang).toBe('hi-IN');
  });
  it('handles an unsupported engine',()=>{vi.stubGlobal('window',{isSecureContext:true});expect(()=>createRecognition('en-IN',{start:vi.fn(),end:vi.fn(),error:vi.fn(),result:vi.fn()})).toThrow('unavailable');});
  it('captures interim and final transcript separately',()=>{class Engine{}vi.stubGlobal('window',{isSecureContext:true,SpeechRecognition:Engine});const result=vi.fn();const r=createRecognition('en-IN',{start:vi.fn(),end:vi.fn(),error:vi.fn(),result});r.onresult?.({resultIndex:0,results:{length:1,0:{isFinal:true,0:{transcript:'Open the map'}}}});expect(result).toHaveBeenCalledWith('Open the map',true);});
  it('cancels owned output and avoids stale completion',()=>{
    const speak=vi.fn(),cancel=vi.fn(),state=vi.fn();class Utterance{onstart?:()=>void;onend?:()=>void;constructor(public text:string){}}
    vi.stubGlobal('SpeechSynthesisUtterance',Utterance);vi.stubGlobal('window',{speechSynthesis:{speak,cancel,getVoices:()=>[{lang:'en-IN'}]}});
    const speaker=new Speaker(state,vi.fn());speaker.speak('One','en');const first=speak.mock.calls[0][0];speaker.speak('Two','en');const second=speak.mock.calls[1][0];second.onstart();first.onend();expect(state.mock.lastCall).toEqual([true]);speaker.stop();expect(state.mock.lastCall).toEqual([false]);expect(cancel).toHaveBeenCalledTimes(2);
  });
  it('reports missing Hindi voice rather than claiming Hindi speech',()=>{const error=vi.fn();vi.stubGlobal('window',{speechSynthesis:{getVoices:()=>[],cancel:vi.fn()}});new Speaker(vi.fn(),error).speak('नमस्ते','hi');expect(error.mock.calls[0][0]).toContain('Hindi');});
});

describe('English voice selection', () => {
  const v = (lang: string, localService = true) => ({ lang, localService, name: lang }) as SpeechSynthesisVoice;
  it('uses an installed British or US voice when no Indian English voice exists', async () => {
    const { pickVoice } = await import('../services/textToSpeech');
    expect(pickVoice([v('en-US'), v('en-GB')], 'en')?.lang).toBe('en-GB');
    expect(pickVoice([v('en-US')], 'en')?.lang).toBe('en-US');
    expect(pickVoice([v('en_AU')], 'en')?.lang).toBe('en_AU');
    expect(pickVoice([v('en-IN', false), v('en-IN', true)], 'hinglish')?.localService).toBe(true);
    expect(pickVoice([v('en-GB')], 'hi')).toBeUndefined();
  });

  it('waits for voices that load after the first call instead of failing', async () => {
    vi.useFakeTimers();
    const speak = vi.fn(), error = vi.fn();
    let voices: SpeechSynthesisVoice[] = [];
    let onChange: (() => void) | undefined;
    class Utterance { lang = ''; voice?: SpeechSynthesisVoice; constructor(public text: string) {} }
    vi.stubGlobal('document', { hidden: false });
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    vi.stubGlobal('window', { speechSynthesis: { speak, cancel: vi.fn(), getVoices: () => voices, addEventListener: (_: string, f: () => void) => (onChange = f), removeEventListener: vi.fn() } });
    new Speaker(vi.fn(), error).speak('Hello', 'en');
    expect(speak).not.toHaveBeenCalled();
    voices = [v('en-GB')];
    onChange?.();
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0].lang).toBe('en-GB');
    expect(error).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
