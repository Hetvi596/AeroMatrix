import { useCallback,useEffect,useRef,useState } from 'react';
import {createRecognition,recognitionConstructor,type Recognition} from '../services/speechToText';
import {Speaker} from '../services/textToSpeech';
import type { Language } from '../types';

export function useVoiceAssistant(language:Language,onTranscript:(text:string)=>void){
  const [listening,setListening]=useState(false),[speaking,setSpeaking]=useState(false),[error,setError]=useState(''),[interim,setInterim]=useState('');
  const [voiceEnabled,setVoiceEnabled]=useState(false);
  const enabledRef=useRef(false);enabledRef.current=voiceEnabled;
  const recognition=useRef<Recognition|null>(null),speaker=useRef<Speaker|null>(null),callback=useRef(onTranscript),timeout=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  callback.current=onTranscript;
  if(!speaker.current)speaker.current=new Speaker(setSpeaking,setError);
  const stopListening=useCallback(()=>{if(timeout.current)clearTimeout(timeout.current);const r=recognition.current;recognition.current=null;if(r){r.onend=null;r.onresult=null;r.onerror=null;r.onstart=null;r.abort();}setListening(false);setInterim('');},[]);
  const stopSpeaking=useCallback(()=>speaker.current?.stop(),[]);
  const startListening=useCallback(()=>{
    stopListening();stopSpeaking();setError('');setInterim('');
    try{
      let final='';
      const r=createRecognition(language==='hi'?'hi-IN':language==='hinglish'?'hi-IN':'en-IN',{
        start:()=>{setListening(true);timeout.current=setTimeout(()=>r.stop(),20000);},
        result:(text,isFinal)=>{if(isFinal)final+=' '+text;else setInterim(text);},
        error:setError,
        end:()=>{if(timeout.current)clearTimeout(timeout.current);setListening(false);setInterim('');recognition.current=null;if(final.trim())callback.current(final.trim());}
      });recognition.current=r;r.start();
    }catch(e){setError(e instanceof Error?e.message:'Microphone could not start');setListening(false);}
  },[language,stopListening,stopSpeaking]);
  const say=useCallback((text:string)=>{if(enabledRef.current)speaker.current?.speak(text,language);},[language]);
  const toggleVoice=()=>{enabledRef.current=!enabledRef.current;if(!enabledRef.current)stopSpeaking();setVoiceEnabled(enabledRef.current);};
  useEffect(()=>{stopListening();stopSpeaking();},[language,stopListening,stopSpeaking]);
  useEffect(()=>{const hide=()=>{if(document.hidden){stopListening();stopSpeaking();}};document.addEventListener('visibilitychange',hide);return()=>{document.removeEventListener('visibilitychange',hide);stopListening();stopSpeaking();};},[stopListening,stopSpeaking]);
  return {listening,speaking,error,interim,voiceEnabled,toggleVoice,startListening,stopListening,stopSpeaking,say,speechSupported:!!recognitionConstructor()};
}
