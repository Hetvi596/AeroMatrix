export type Language = 'en' | 'hi' | 'hinglish';
export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'happy' | 'error';
export interface AppContext {
  selected_region?: string; selected_station?: string; selected_pollutant?: string;
  dashboard_time?: string; scenario_id?: string; scenario_description?: string;
  active_section?: string; selected_factory?: string; graph_description?: string;
  map_location?: { longitude: number; latitude: number; zoom?: number };
}
export interface ChatReply {
  session_id: string; session_token: string; answer: string; intent: string; data_status: string;
  sources: {id:string; title?:string; path?:string; file?:string; timestamp?:string; type:string}[];
  warnings: string[]; model_used: string | null; latency_ms: number;
}
export interface Message { id:string; role:'user'|'assistant'; text:string; status?:string; sources?:ChatReply['sources']; warnings?:string[] }
