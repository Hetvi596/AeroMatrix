export type AppContext = {
  selected_region?: string; selected_station?: string; selected_pollutant?: string;
  dashboard_time?: string; scenario_id?: string; scenario_description?: string;
};
export type ChatReply = {
  session_id: string; session_token: string; answer: string; intent: string;
  sources: { id: string; type: string; title?: string; file?: string; path?: string; timestamp?: string }[];
  data_status: string; warnings: string[]; language: string; data: unknown[];
  model_used: string | null; timestamp: string | null; generated_at: string; latency_ms: number;
};
// Use a same-origin server proxy in a hosted app. NEVER put the Gemini key here.
export class AeroAIClient {
  private session?: { id: string; token: string };
  constructor(private base = 'http://127.0.0.1:8010') {}
  private headers() {
    return { 'Content-Type': 'application/json', ...(this.session ? { 'X-Session-Token': this.session.token } : {}) };
  }
  async chat(message: string, context: AppContext = {}, language = 'auto', allowHistorical = false, signal?: AbortSignal): Promise<ChatReply> {
    const response = await fetch(`${this.base}/chat`, { method: 'POST', headers: this.headers(), signal,
      body: JSON.stringify({ message, session_id: this.session?.id, context, language, allow_historical: allowHistorical }) });
    if (!response.ok) throw new Error(`AeroAI HTTP ${response.status}: ${await response.text()}`);
    const reply: ChatReply = await response.json();
    this.session = { id: reply.session_id, token: reply.session_token };
    return reply;
  }
  async stream(message: string, context: AppContext, onDelta: (text: string) => void, signal?: AbortSignal): Promise<ChatReply> {
    const response = await fetch(`${this.base}/chat/stream`, { method: 'POST', headers: this.headers(), signal,
      body: JSON.stringify({ message, session_id: this.session?.id, context }) });
    if (!response.ok || !response.body) throw new Error(`AeroAI HTTP ${response.status}`);
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '', final: ChatReply | undefined;
    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let split: number;
        while ((split = buffer.indexOf('\n\n')) >= 0) {
          const event = buffer.slice(0, split); buffer = buffer.slice(split + 2);
          const type = event.split('\n').find(l => l.startsWith('event: '))?.slice(7);
          const raw = event.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
          if (!raw) continue;
          const data = JSON.parse(raw);
          if (type === 'delta') onDelta(data.text);
          if (type === 'error') throw new Error(data.detail);
          if (type === 'done') final = data as ChatReply;
        }
        if (done) break;
      }
    } finally { reader.releaseLock(); }
    if (!final) throw new Error('AeroAI stream ended before completion');
    this.session = { id: final.session_id, token: final.session_token };
    return final;
  }
  async reset() {
    if (this.session) {
      const r = await fetch(`${this.base}/session/reset`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ session_id: this.session.id }) });
      if (!r.ok) throw new Error(`Reset failed: ${r.status}`);
    }
    this.session = undefined;
  }
}
