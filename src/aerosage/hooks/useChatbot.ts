import {useCallback,useEffect,useRef,useState} from 'react';
import {ChatbotAdapter} from '../services/chatbotAdapter';
import type {AppContext,Language,Message} from '../types';
export function useChatbot(url:string){
  const adapter=useRef(new ChatbotAdapter(url));
  const controller=useRef<AbortController|null>(null),generation=useRef(0);
  const [messages,setMessages]=useState<Message[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [connected,setConnected]=useState<boolean|null>(null);
  useEffect(()=>{adapter.current=new ChatbotAdapter(url);const c=new AbortController();adapter.current.health(c.signal).then(()=>setConnected(true)).catch(()=>setConnected(false));return()=>{c.abort();controller.current?.abort();};},[url]);
  const append=useCallback((message:Omit<Message,'id'>)=>setMessages(old=>[...old,{...message,id:crypto.randomUUID()}]),[]);
  const cancel=useCallback(()=>{generation.current++;controller.current?.abort();controller.current=null;setBusy(false);},[]);
  const send=useCallback(async(message:string,context:AppContext,language:Language,allowHistorical:boolean)=>{
    if(controller.current)return null;
    const version=++generation.current,c=new AbortController();controller.current=c;setBusy(true);setError('');append({role:'user',text:message});
    try{const r=await adapter.current.chat(message,context,language,allowHistorical,c.signal);if(generation.current!==version)return null;append({role:'assistant',text:r.answer,status:r.data_status,sources:r.sources,warnings:r.warnings});setConnected(true);return r;}
    catch(e){if(generation.current===version&&!(e instanceof DOMException&&e.name==='AbortError')){setError(e instanceof Error?e.message:'Chatbot unavailable');setConnected(false);}return null;}
    finally{if(generation.current===version){controller.current=null;setBusy(false);}}
  },[append]);
  const clear=async()=>{cancel();try{await adapter.current.reset();setMessages([]);setError('');}catch(e){setError(e instanceof Error?e.message:'Reset failed');}};
  return {messages,busy,error,connected,send,cancel,clear,append};
}
