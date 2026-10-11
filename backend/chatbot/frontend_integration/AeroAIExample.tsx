import { useRef, useState } from 'react';
import { AeroAIClient, type AppContext, type ChatReply } from './aeroai';

// Optional unstyled component. Reuse your existing panel, colors and animations.
export function AeroAIExample({ context, apiUrl = 'http://127.0.0.1:8010' }: { context: AppContext; apiUrl?: string }) {
  const client = useRef(new AeroAIClient(apiUrl));
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [replies, setReplies] = useState<ChatReply[]>([]), [error, setError] = useState('');
  const [language, setLanguage] = useState('auto'), [historical, setHistorical] = useState(false);
  async function send() {
    if (!message.trim() || busy) return;
    setBusy(true); setError('');
    try { const reply = await client.current.chat(message, context, language, historical); setReplies(old => [...old, reply]); setMessage(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  return <section aria-label="AeroAI chat">
    <p>Hi, I’m AeroSage. Ask about AeroMatrix, pollution, or a general question.</p>
    <div aria-live="polite">{replies.map((r, i) => <article key={i}>
      <p style={{ whiteSpace: 'pre-wrap' }}>{r.answer}</p>
      <small>{r.data_status} · {r.model_used ?? 'Verified retrieval / API'}</small>
      <ul>{r.sources.map(s => <li key={s.id}>[{s.id}] {s.title ?? s.path ?? s.type} {s.timestamp}</li>)}</ul>
      {r.warnings.map((w, n) => <p key={n}>{w}</p>)}
    </article>)}</div>
    <select aria-label="Answer language" value={language} onChange={e => setLanguage(e.target.value)}>
      <option value="auto">Automatic</option><option value="en">English</option><option value="hi">Hindi</option><option value="hinglish">Hinglish</option>
    </select>
    <label><input type="checkbox" checked={historical} onChange={e => setHistorical(e.target.checked)} />Allow labeled historical data</label>
    <textarea aria-label="Message" value={message} onChange={e => setMessage(e.target.value)} maxLength={4000} />
    <button disabled={busy || !message.trim()} onClick={send}>{busy ? 'Preparing answer…' : 'Send'}</button>
    <button disabled={busy} onClick={async () => { try { await client.current.reset(); setReplies([]); } catch { setError('Session reset failed'); } }}>Reset conversation</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
