import {useEffect,useRef} from 'react';
import type {Message} from '../types';
import {RichText} from './RichText';
export function ConversationPanel({messages,busy}:{messages:Message[];busy:boolean}){
  const end=useRef<HTMLDivElement>(null);
  // Braces matter: an effect must return nothing or a cleanup function, and newer browsers return a value from scrollIntoView.
  useEffect(()=>{end.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});},[messages,busy]);
  return <div className="as-conversation" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions">
    {messages.map(m=><article className={`as-message as-message--${m.role}`} key={m.id}>
      <div className="as-message-label">{m.role==='user'?'YOU':'AEROSAGE'}{m.status&&<span>{m.status.replaceAll('_',' ')}</span>}</div>
      <div className={`as-message-text ${m.role === 'assistant' ? 'as-message-text--rich' : ''}`}>{m.role === 'assistant' ? <RichText text={m.text} /> : m.text}</div>
      {!!m.sources?.length&&<details><summary>{m.sources.length} source references</summary><ul>{m.sources.map(s=><li key={s.id}>[{s.id}] {s.title??s.path??s.file??s.type}{s.timestamp&&` · ${s.timestamp}`}</li>)}</ul></details>}
      {m.warnings?.map((w,i)=><p className="as-warning" key={i}>{w}</p>)}
    </article>)}
    {busy&&<div className="as-progress" role="status"><span/><span/><span/>Reading the sources…</div>}
    <div ref={end}/>
  </div>;
}
