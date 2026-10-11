import {Mic,MicOff,Square,Volume2,VolumeX} from 'lucide-react';
import type {Language} from '../types';
export function VoiceControls(p:{listening:boolean;speaking:boolean;enabled:boolean;supported:boolean;language:Language;onLanguage:(l:Language)=>void;onListen:()=>void;onStopListen:()=>void;onStopSpeak:()=>void;onToggle:()=>void;disabled:boolean}){
  return <div className="as-voice-controls">
    <button type="button" className={`as-mic ${p.listening?'is-active':''}`} aria-label={p.listening?'Stop listening':'Start microphone'} aria-pressed={p.listening} disabled={p.disabled||!p.supported} onClick={p.listening?p.onStopListen:p.onListen}>{p.listening?<MicOff size={18}/>:<Mic size={18}/>}</button>
    <div className="as-voice-copy"><span>{p.listening?'I’m listening…':p.speaking?'Speaking to you':p.supported?'Tap to speak':'Typing is available'}</span><small>{p.listening?'Tap again to cancel':p.speaking?'You can interrupt anytime':'Microphone is off'}</small></div>
    <button type="button" className="as-icon" onClick={p.onToggle} aria-label={p.enabled?'Turn voice output off':'Turn voice output on'} aria-pressed={p.enabled}>{p.enabled?<Volume2 size={17}/>:<VolumeX size={17}/>}</button>
    <button type="button" className="as-icon" onClick={p.onStopSpeak} disabled={!p.speaking} aria-label="Stop speaking"><Square size={14}/></button>
    <select value={p.language} onChange={e=>p.onLanguage(e.target.value as Language)} aria-label="Conversation language"><option value="en">EN</option><option value="hi">हिन्दी</option><option value="hinglish">Hinglish</option></select>
  </div>;
}
