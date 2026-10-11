// Minimal, safe rendering of the Markdown the language model tends to produce
// (headings, bullet/numbered lists, **bold**, `code`). Everything becomes React
// elements; no HTML from the model is ever injected.

import type { ReactNode } from 'react';

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith('**') ? <strong key={`${key}-${i++}`}>{t.slice(2, -2)}</strong> : <code key={`${key}-${i++}`}>{t.slice(1, -1)}</code>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = (k: number) => {
    if (!list) return;
    const items = list.items.map((it, j) => <li key={j}>{inline(it, `l${k}-${j}`)}</li>);
    blocks.push(list.ordered ? <ol key={`o${k}`} className="as-md-list as-md-ol">{items}</ol> : <ul key={`u${k}`} className="as-md-list">{items}</ul>);
    list = null;
  };
  text.split('\n').forEach((raw, k) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) {
        flush(k);
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      return;
    }
    flush(k);
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) blocks.push(<p key={k} className="as-md-h">{inline(heading[1], `h${k}`)}</p>);
    else if (line.trim()) blocks.push(<p key={k}>{inline(line, `p${k}`)}</p>);
  });
  flush(-1);
  return <>{blocks}</>;
}

/** Plain text for speech: Markdown symbols removed. */
export function speakable(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}
