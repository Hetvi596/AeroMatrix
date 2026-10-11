import type { AppContext,ChatReply,Language } from '../types';

export class ChatbotAdapter {
  private session?:{id:string;token:string};
  constructor(readonly base:string) {}
  private headers() { return {'Content-Type':'application/json',...(this.session?{'X-Session-Token':this.session.token}:{})}; }
  async health(signal?:AbortSignal) {
    const response=await fetch(this.base+'/health',{signal});
    if(!response.ok)throw new Error(`Chatbot HTTP ${response.status}`);
    return response.json();
  }
  async chat(message:string,context:AppContext,language:Language,allowHistorical:boolean,signal:AbortSignal):Promise<ChatReply> {
    let response:Response;
    try{response=await fetch(this.base+'/chat',{method:'POST',headers:this.headers(),signal,body:JSON.stringify({message,session_id:this.session?.id,context,language,allow_historical:allowHistorical})});}
    catch(e){if(e instanceof DOMException&&e.name==='AbortError')throw e;throw new Error(`The AeroSage service isn’t reachable at ${this.base}. Start it with RUN_AEROMATRIX.bat (or backend/chatbot/START_CHATBOT.bat), then try again. No answer was generated.`);}
    if(!response.ok)throw new Error(response.status===403||response.status===404?'Conversation expired or credentials changed. Clear the conversation and retry.':`Chatbot HTTP ${response.status}. Check backend connection and configuration.`);
    const data=await response.json();
    if(typeof data.answer!=='string'||typeof data.session_id!=='string'||typeof data.session_token!=='string')throw new Error('Invalid chatbot response');
    this.session={id:data.session_id,token:data.session_token};return data;
  }
  async reset() {
    if(this.session){
      const response=await fetch(this.base+'/session/reset',{method:'POST',headers:this.headers(),body:JSON.stringify({session_id:this.session.id})});
      if(!response.ok && response.status!==403 && response.status!==404)throw new Error('Backend could not clear the conversation');
    }
    this.session=undefined;
  }
}
