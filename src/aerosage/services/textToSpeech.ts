import type { Language } from '../types';
import { speakable } from '../components/RichText';
const norm=(lang:string)=>lang.replace('_','-').toLowerCase();
/** Best installed voice: Hindi for hi; otherwise English, preferring Indian, then British, then US, local voices first. */
export function pickVoice(voices:SpeechSynthesisVoice[],language:Language):SpeechSynthesisVoice|undefined{
  const sorted=[...voices].sort((a,b)=>Number(b.localService)-Number(a.localService));
  if(language==='hi')return sorted.find(v=>norm(v.lang)==='hi-in')??sorted.find(v=>norm(v.lang).startsWith('hi'));
  for(const code of ['en-in','en-gb','en-us']){const v=sorted.find(x=>norm(x.lang)===code);if(v)return v;}
  return sorted.find(v=>norm(v.lang).startsWith('en'));
}
export class Speaker {
  private generation=0;
  private owned=false;
  private utterance:SpeechSynthesisUtterance|null=null;
  constructor(private state:(speaking:boolean)=>void,private error:(message:string)=>void){}
  stop(){this.generation++;if(this.owned&&'speechSynthesis'in window)window.speechSynthesis.cancel();this.owned=false;this.utterance=null;this.state(false);}
  voices(){return 'speechSynthesis'in window?window.speechSynthesis.getVoices():[];}
  speak(text:string,language:Language){
    this.stop();if(typeof document!=='undefined'&&document.hidden)return;
    if(!('speechSynthesis'in window)){this.error('Speech output is unavailable. The text answer remains visible.');return;}
    const token=++this.generation;const synth=window.speechSynthesis;
    const go=()=>{
      if(token!==this.generation)return;
      const available=this.voices();const voice=pickVoice(available,language);
      // Hindi needs a Hindi voice; English falls back to the browser's default voice when the list is still empty.
      if(!voice&&(language==='hi'||available.length)){this.error(`No ${language==='hi'?'Hindi':'English'} voice is installed. Use text, or add one in Windows Settings → Time & language → Speech.`);return;}
      const u=new SpeechSynthesisUtterance(speakable(text.replace(/```[\s\S]*?```/g,' Code is shown in the chat. ')).replace(/\[(?:KB|API)\d+\]/g,'').slice(0,3500));
      u.lang=voice?.lang??'en-IN';if(voice)u.voice=voice;u.rate=.98;
      u.onstart=()=>{if(token===this.generation)this.state(true);};
      u.onend=()=>{if(token===this.generation){this.owned=false;this.utterance=null;this.state(false);}};
      u.onerror=e=>{if(token===this.generation){this.owned=false;this.state(false);if(e.error!=='canceled'&&e.error!=='interrupted')this.error('Speech output failed; read the text answer.');}};
      this.utterance=u;this.owned=true;synth.speak(u);
    };
    // Browsers load voices asynchronously: the first getVoices() call is often empty.
    if(this.voices().length||typeof synth.addEventListener!=='function'){go();return;}
    let done=false;const once=()=>{if(done)return;done=true;synth.removeEventListener?.('voiceschanged',once);go();};
    synth.addEventListener('voiceschanged',once);setTimeout(once,1500);
  }
}
