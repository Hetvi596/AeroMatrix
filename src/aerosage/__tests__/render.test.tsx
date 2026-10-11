import {describe,it,expect,vi,afterEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {AeroSageAvatar} from '../components/AeroSageAvatar';
import {AeroSageChat} from '../components/AeroSageChat';
import type {AvatarState} from '../types';
// Read the stylesheet as text (vitest does not process CSS imports).
const fs: { readFileSync(p: URL, enc: string): string } = await import(/* @vite-ignore */ 'node:' + 'fs');
const css = fs.readFileSync(new URL('../styles/aerosage.css', import.meta.url), 'utf8');
afterEach(()=>vi.unstubAllGlobals());
describe('actual React markup and responsive styling',()=>{
  it.each(['idle','listening','thinking','speaking','happy','error'] as AvatarState[])('renders %s avatar',state=>{const html=renderToStaticMarkup(<AeroSageAvatar state={state}/>);expect(html).toContain(`data-state="${state}"`);expect(html).toContain('<img');expect(html).toContain(`AeroSage, ${state}`);});
  it('renders complete accessible controls without starting speech',()=>{vi.stubGlobal('window',{});const html=renderToStaticMarkup(<AeroSageChat context={{selected_region:'Hadapsar'}}/>);for(const s of ['AeroSage','Start microphone','Stop speaking','Message AeroSage','Conversation language','Allow historical data','Hadapsar'])expect(html).toContain(s);expect(html).not.toContain('283');});
  it('includes mobile and reduced-motion rules',()=>{expect(css).toContain('@media(max-width:600px)');expect(css).toContain('@media(prefers-reduced-motion:reduce)');expect(css).toContain('animation:none!important');});
});
