import {useEffect,useRef,useState} from 'react';
import {ArrowUp,ArrowUpRight,Maximize2,Minimize2,Minus,RotateCcw,Sparkles,X,MapPin} from 'lucide-react';
import {AeroSageAvatar} from './AeroSageAvatar';
import {VoiceControls} from './VoiceControls';
import {ConversationPanel} from './ConversationPanel';
import {useVoiceAssistant} from '../hooks/useVoiceAssistant';
import {useChatbot} from '../hooks/useChatbot';
import {parseAction,executeActions,disruptive,type Action,type ActionAdapter} from '../services/aeromatrixActions';
import type {AppContext,AvatarState,Language} from '../types';
import '../styles/aerosage.css';
import character from '../assets/avatar/aerosage.svg';

export function AeroSageChat({apiUrl='http://127.0.0.1:8010',context={},actions,initiallyOpen=true,previewState,onOpenChange}:{apiUrl?:string;context?:AppContext;actions?:ActionAdapter;initiallyOpen?:boolean;previewState?:AvatarState;onOpenChange?:(open:boolean)=>void}){
  const [open,setOpenState]=useState(initiallyOpen),[expanded,setExpanded]=useState(false),[text,setText]=useState(''),[language,setLanguage]=useState<Language>('en');
  const [historical,setHistorical]=useState(false),[pending,setPending]=useState<Action[]|null>(null),[clearing,setClearing]=useState(false),[actionBusy,setActionBusy]=useState(false),[positive,setPositive]=useState(false);
  // Host layouts (e.g. a docked panel) need to know when the panel opens or closes.
  const setOpen=(v:boolean)=>{setOpenState(v);onOpenChange?.(v);};
  const chat=useChatbot(apiUrl),sendRef=useRef<(text:string)=>void>(()=>{}),positiveTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const actionInFlight=useRef(false),actionVersion=useRef(0);
  const voice=useVoiceAssistant(language,t=>sendRef.current(t));
  const busy=chat.busy||actionBusy;
  const doActions=async(list:Action[],confirmed=false)=>{
    if(actionInFlight.current)return;
    actionInFlight.current=true;const version=actionVersion.current;
    setActionBusy(true);
    try{const outcomes=await executeActions(list,actions,confirmed);const answer=outcomes.map(o=>o.message).join('\n');chat.append({role:'assistant',text:answer,status:outcomes.every(o=>o.status==='executed')?'application_action':'action_unavailable'});if(version===actionVersion.current)voice.say(answer);}
    finally{actionInFlight.current=false;setActionBusy(false);setPending(null);}
  };
  const send=async(message:string)=>{
    if(!message.trim()||busy||pending)return;voice.stopSpeaking();voice.stopListening();setText('');
    const commands=parseAction(message);
    if(commands){chat.append({role:'user',text:message});if(commands.some(disruptive)){setPending(commands);return;}await doActions(commands);return;}
    const answer=await chat.send(message,context,language,historical);
    if(answer){voice.say(answer.answer);setPositive(true);if(positiveTimer.current)clearTimeout(positiveTimer.current);positiveTimer.current=setTimeout(()=>setPositive(false),3000);}
  };
  sendRef.current=t=>void send(t);
  useEffect(()=>()=>{if(positiveTimer.current)clearTimeout(positiveTimer.current);},[]);
  const minimize=()=>{actionVersion.current++;voice.stopListening();voice.stopSpeaking();chat.cancel();setOpen(false);};
  const state:AvatarState=previewState??(voice.listening?'listening':voice.speaking?'speaking':busy?'thinking':chat.error||voice.error?'error':positive?'happy':'idle');
  if(!open)return <button className="as-launcher" aria-label="Open AeroSage" title="Ask AeroSage" onClick={()=>setOpen(true)}><img className="as-launcher-avatar" src={character} alt="" width="34" height="34" draggable={false}/><span>AeroSage</span><i/></button>;
  return <section className={`aerosage ${expanded?'aerosage--expanded':''}`} aria-label="AeroSage environmental copilot">
    <header className="as-header"><div className="as-brand"><span className="as-brand-mark"><Sparkles size={18}/></span><div>AeroSage<small>YOUR AI ENVIRONMENTAL COPILOT</small></div></div><div className="as-header-actions"><button className="as-icon" aria-label={expanded?'Restore panel size':'Expand panel'} onClick={()=>setExpanded(!expanded)}>{expanded?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button><button className="as-icon" aria-label="Minimize AeroSage" onClick={minimize}><Minus size={19}/></button></div></header>
    <div className={`as-character-area ${voice.voiceEnabled?'as-character-area--voice':''}`}>
      <AeroSageAvatar state={state} compact={chat.messages.length>0&&!voice.voiceEnabled}/>
      {!chat.messages.length&&<><h1>Hello. Let’s explore together.</h1><p>I can help you understand air pollution, explore Pune, and make sense of environmental scenarios. Type or speak to me.</p></>}
      {(voice.listening||voice.speaking||previewState==='listening'||previewState==='speaking')&&<div className="as-wave" aria-label="Voice activity animation, not a measured waveform">{Array.from({length:21},(_,i)=><i key={i} style={{animationDelay:`${i*.07}s`,height:`${8+((i*13)%22)}px`}}/>)}</div>}
    </div>
    <div className="as-context"><MapPin size={12}/><span>{context.selected_region??'PUNE'} · {context.active_section??'ASSISTANT'}</span><span className={chat.connected?'as-connected':'as-offline'}>{chat.connected===null?'CONNECTING':chat.connected?'BACKEND CONNECTED':'BACKEND OFFLINE'}</span></div>
    {!chat.messages.length&&<div className="as-welcome"><span>WHERE SHALL WE BEGIN?</span><div className="as-suggestions">{['What is PM2.5?','Explore AeroMatrix','Open the What-If simulator'].map(q=><button key={q} onClick={()=>void send(q)}>{q}<ArrowUpRight size={13}/></button>)}</div></div>}
    <ConversationPanel messages={chat.messages} busy={busy}/>
    {pending&&<div className="as-confirm" role="alert"><strong>Confirm application changes</strong><p>{pending.map(a=>a.type==='update_scenario_parameter'?`Set traffic reduction to ${a.value}%`:a.type.replaceAll('_',' ')).join(' → ')}</p><small>These change the application scenario, not measured pollution.</small><div><button disabled={actionBusy} onClick={()=>void doActions(pending,true)}>Confirm</button><button disabled={actionBusy} onClick={()=>setPending(null)}>Cancel</button></div></div>}
    {clearing&&<div className="as-confirm" role="alert"><p>Clear this conversation and its server-side history?</p><button onClick={async()=>{voice.stopSpeaking();voice.stopListening();await chat.clear();setClearing(false);}}>Clear conversation</button><button onClick={()=>setClearing(false)}>Keep it</button></div>}
    {(chat.error||voice.error)&&<div className="as-error" role="alert">{chat.error||voice.error}</div>}
    {voice.interim&&<p className="as-caption" aria-live="polite">{voice.interim}</p>}
    <footer className="as-footer"><form onSubmit={e=>{e.preventDefault();void send(text);}}><textarea aria-label="Message AeroSage" placeholder="Ask AeroSage anything…" value={text} onChange={e=>setText(e.target.value)} maxLength={4000} rows={2} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send(text);}}}/>{chat.busy?<button type="button" className="as-send" onClick={chat.cancel} aria-label="Cancel response"><X size={18}/></button>:<button className="as-send" type="submit" disabled={busy||!text.trim()||!!pending} aria-label="Send message"><ArrowUp size={20}/></button>}</form>
      <VoiceControls listening={voice.listening} speaking={voice.speaking} enabled={voice.voiceEnabled} supported={voice.speechSupported} language={language} onLanguage={setLanguage} onListen={voice.startListening} onStopListen={voice.stopListening} onStopSpeak={voice.stopSpeaking} onToggle={voice.toggleVoice} disabled={busy||!!pending}/>
      <div className="as-bottom"><label><input type="checkbox" checked={historical} onChange={e=>setHistorical(e.target.checked)}/> Allow historical data</label><button className="as-clear" onClick={()=>setClearing(true)} disabled={busy}><RotateCcw size={11}/>Clear</button></div>
      <p className="as-privacy">Mic starts only when tapped. Browser speech may use online services. Voice recordings are not stored by this module.</p>
    </footer>
  </section>;
}
