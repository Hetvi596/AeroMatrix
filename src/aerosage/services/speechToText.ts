// Native browser engine may send audio to its provider. No recordings are retained by this module.
type ResultEvent={resultIndex:number;results:{length:number;[index:number]:{isFinal:boolean;0:{transcript:string}}}};
export interface Recognition {
  lang:string;continuous:boolean;interimResults:boolean;
  onstart:(()=>void)|null;onend:(()=>void)|null;onerror:((e:{error:string})=>void)|null;onresult:((e:ResultEvent)=>void)|null;
  start():void;stop():void;abort():void;
}
export function recognitionConstructor(): (new()=>Recognition)|undefined {
  const w=window as unknown as {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
  return w.SpeechRecognition??w.webkitSpeechRecognition;
}
export function createRecognition(lang:string,callbacks:{start:()=>void;end:()=>void;error:(message:string)=>void;result:(text:string,final:boolean)=>void}):Recognition {
  const Engine=recognitionConstructor();if(!Engine)throw new Error('Speech recognition is unavailable in this browser. Type your message or try Chrome/Edge.');
  if(!window.isSecureContext)throw new Error('Microphone use requires HTTPS or localhost.');
  const r=new Engine();r.lang=lang;r.continuous=false;r.interimResults=true;
  r.onstart=callbacks.start;r.onend=callbacks.end;
  r.onerror=e=>callbacks.error(({ 'not-allowed':'Microphone permission was denied. Enable it in browser settings or use typing.', 'audio-capture':'No working microphone was found.','no-speech':'No speech detected. Tap the microphone to try again.','network':'The browser speech service could not connect. Use typing or check connectivity.','aborted':'Listening cancelled.'} as Record<string,string>)[e.error]??'Speech recognition failed. You can still type.');
  r.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++)callbacks.result(e.results[i][0].transcript,e.results[i].isFinal);};
  return r;
}
