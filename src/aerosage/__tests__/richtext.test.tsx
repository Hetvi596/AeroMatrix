import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RichText, speakable } from '../components/RichText';

describe('assistant reply formatting', () => {
  const md = '### Verified implementation\n* **Frontend:** React and Cesium\n* Backend\n\n1. First\n2. Second\nUse `npm test` <script>alert(1)</script>';
  it('renders headings, lists, bold and code as elements', () => {
    const html = renderToStaticMarkup(<RichText text={md} />);
    expect(html).toContain('<p class="as-md-h">Verified implementation</p>');
    expect(html).toContain('<ul class="as-md-list"><li><strong>Frontend:</strong> React and Cesium</li><li>Backend</li></ul>');
    expect(html).toContain('<ol class="as-md-list as-md-ol"><li>First</li><li>Second</li></ol>');
    expect(html).toContain('<code>npm test</code>');
    expect(html).not.toContain('###');
  });
  it('never injects HTML from the model', () => {
    const html = renderToStaticMarkup(<RichText text={md} />);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('removes Markdown symbols for speech', () => {
    expect(speakable(md)).not.toMatch(/[#*`]/);
  });
});
