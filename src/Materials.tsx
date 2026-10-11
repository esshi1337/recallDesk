import { createId } from '../shared/id';
import { usePhoneLayout, useDrawer } from './mobile';
import { api } from './platform';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, Check, Download, List, X, ExternalLink, Plus, Search } from 'lucide-react';
import { documentHeadings, type StudyResource } from '../shared/materials';
import { localDate } from '../shared/timeline';
import type { Library } from '../shared/model';
import './materials.css';

function plain(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(plain).join('');
  if (children && typeof children === 'object' && 'props' in children) return plain((children as { props: { children?: ReactNode } }).props.children);
  return '';
}
export default function Materials({ data, initial, onChange, onImport }: { data: Library; initial?: { resourceId: string; headingId?: string }; onChange: (data: Library) => void; onImport: () => void }) {
  const phone = usePhoneLayout();
  const [contentsOpen, setContentsOpen] = useState(false);
  useDrawer(phone && contentsOpen, '.materials-nav', () => setContentsOpen(false));
  const [resourceId, setResourceId] = useState(initial?.resourceId || data.resources.find(r => r.kind === 'roadmap')?.id || data.resources[0]?.id || '');
  const [headingId, setHeadingId] = useState(initial?.headingId || '');
  const [query, setQuery] = useState('');
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'document' | 'modules'>('document');
  const resource = data.resources.find(r => r.id === resourceId);
  const pack = data.studyPacks.find(p => p.id === resource?.packId);
  const headings = useMemo(() => documentHeadings(resource?.markdown || ''), [resource]);
  const headingMap = useMemo(() => new Map(headings.map(h => [h.title, h.id])), [headings]);
  const baselineComplete = data.attempts.some(a => pack?.examIds.includes(a.exam.id) && a.status === 'submitted');
  const guarded = !!resource && !unlocked.includes(resource.id) && (resource.kind === 'answer-key' || (resource.kind === 'guide' && !baselineComplete));
  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setMessage('');
    try { await fn(); onChange(await api.library()); } catch (e) { setMessage(String(e)); }
    finally { setBusy(false); }
  }
  function openResource(id: string, heading = '') { setContentsOpen(false); setResourceId(id); setHeadingId(heading); setQuery(''); setView('document'); setMessage(''); }
  useEffect(() => { if (initial) openResource(initial.resourceId, initial.headingId); }, [initial]);
  useEffect(() => {
    if (guarded) return;
    if (headingId) document.getElementById(`resource-${headingId}`)?.scrollIntoView({ block: 'start' });
    else document.querySelector('.material-document')?.scrollTo({ top: 0 });
  }, [resourceId, headingId, guarded, view]);
  function followLink(href?: string) {
    if (!href) return;
    if (href.startsWith('#')) {
      const slug = decodeURIComponent(href.slice(1));
      const heading = headings.find(h => h.id === slug || h.title.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-') === slug);
      if (heading) setHeadingId(heading.id); else setMessage('This heading was not found in the imported document.');
      return;
    }
    const [location, hash] = href.split('#');
    const fileName = decodeURIComponent(location.split('/').pop() || '');
    const target = data.resources.find(r => r.fileName === fileName && r.packId === resource?.packId);
    if (target) { openResource(target.id, hash || ''); return; }
    if (/^https?:\/\//i.test(href)) { void run(() => api.openReference(href)); return; }
    setMessage(`Referenced file is not included: ${fileName || href}. The original reference is preserved; no file was downloaded.`);
  }
  const logReading = () => {
    if (!resource || !pack) return;
    void run(async () => {
      const heading = headings.find(h => h.id === headingId);
      await api.saveManualActivity({ id: createId(), goalId: pack.goalId, title: `Read: ${heading?.title || resource.title}`, kind: 'reading', date: localDate(), minutes: 0, note: `Reference: ${resource.fileName}${heading ? ` — ${heading.title}` : ''}` });
      setMessage('Reading entry added to the timeline.');
    });
  };
  const header = (level: number, children: ReactNode) => {
    const id = headingMap.get(plain(children));
    const props = { id: id ? `resource-${id}` : undefined, children };
    if (level === 1) return <h1 {...props}/>;
    if (level === 2) return <h2 {...props}/>;
    if (level === 3) return <h3 {...props}/>;
    return <h4 {...props}/>;
  };
  return <section className={`materials-view ${contentsOpen ? 'contents-open' : ''}`}>{phone && contentsOpen && <button className="mobile-backdrop" aria-label="Close contents panel" onClick={() => setContentsOpen(false)}/>}<header className="materials-toolbar"><h1>Study materials</h1><button className="mobile-only" aria-label="Open contents" onClick={() => setContentsOpen(true)}><List size={16}/> Contents</button>{resource && !guarded && view === 'document' && pack && <button disabled={busy} onClick={logReading}>Log reading</button>}<button onClick={onImport}><Download size={14}/> Import study pack</button>{pack && <><button onClick={() => setView('document')} className={view === 'document' ? 'active-tab' : ''}>Document</button><button onClick={() => setView('modules')} className={view === 'modules' ? 'active-tab' : ''}>Optional modules ({pack.modules.length})</button></>}</header>
    {message && <div className="material-message" role="status">{message}<button onClick={() => setMessage('')}>Dismiss</button></div>}
    {!resource ? <div className="material-empty"><p>Import a study pack to read its guide and connect its roadmap to the timeline.</p></div> : <div className="materials-layout"><aside className="materials-nav" role={phone && contentsOpen ? 'dialog' : undefined} aria-modal={phone && contentsOpen ? true : undefined} aria-label="Study documents and sections"><button className="mobile-only panel-close" aria-label="Close contents" onClick={() => setContentsOpen(false)}><X size={20}/></button><h2>Documents</h2>{data.resources.map(r => <button className={r.id === resourceId ? 'selected' : ''} key={r.id} onClick={() => openResource(r.id)}><BookOpen size={13}/><span>{r.title}<small>{r.kind}</small></span></button>)}<label className="search"><Search size={13}/><input aria-label="Find section" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find section…"/></label><nav aria-label="Document sections">{headings.filter(h => !query || h.title.toLowerCase().includes(query.toLowerCase())).map(h => <button key={h.id} className={headingId === h.id ? 'selected' : ''} style={{ paddingLeft: `${10 + Math.min(h.level - 1, 2) * 9}px` }} onClick={() => { setView('document'); setHeadingId(h.id); setContentsOpen(false); }}>{h.title}</button>)}</nav></aside>
      {view === 'modules' && pack ? <div className="material-document module-list"><h2>Choose modules after evaluating the baseline</h2><p className="hint">These are optional repair targets from your roadmap. Adding a module creates an undated, planned milestone; it does not mark any study completed. The roadmap recommends at most three active targets.</p>{pack.modules.map(m => { const added = data.milestones.some(x => x.id === m.id); return <article key={m.id}><h3>{m.title}</h3><Markdown remarkPlugins={[remarkGfm]}>{m.description}</Markdown><div className="row wrap"><button disabled={busy || added} onClick={() => void run(() => api.addStudyModule(pack.id, m.id))}>{added ? <Check size={13}/> : <Plus size={13}/>} {added ? 'Added to timeline' : 'Add to timeline'}</button>{(m.resourceRefs || []).map(ref => { const doc = data.resources.find(r => r.id === ref.resourceId); const heading = documentHeadings(doc?.markdown || '').find(h => h.id === ref.headingId); return <button key={`${ref.resourceId}:${ref.headingId}`} className="text-button" onClick={() => openResource(ref.resourceId, ref.headingId)}>{heading?.title || 'Open guide section'}</button>; })}</div></article>; })}</div> : <article className="material-document">
        {guarded ? <div className="material-gate"><h2>{resource.kind === 'answer-key' ? 'Answer key and explanations' : 'Study guide before the baseline'}</h2><p>{resource.kind === 'answer-key' ? 'This document reveals the answers to the baseline. Your saved candidate answers will remain unchanged.' : 'The guide teaches the tested concepts. Your roadmap recommends finishing the unassisted baseline first. If you read it now, record that exposure in your attempt.'}</p><button className="primary" onClick={() => setUnlocked([...unlocked, resource.id])}>Open {resource.kind === 'answer-key' ? 'answer key' : 'study guide'}</button></div> : <><Markdown remarkPlugins={[remarkGfm]} urlTransform={url => /^(https?:|sandbox:|#)/i.test(url) || !/^[a-z][a-z\d+.-]*:/i.test(url) ? url : ''} components={{ h1: ({ children }) => header(1, children), h2: ({ children }) => header(2, children), h3: ({ children }) => header(3, children), h4: ({ children }) => header(4, children), a: ({ href, children }) => <button className="inline-reference" onClick={() => followLink(href)} title={href}>{children}{/^https?:/.test(href || '') && <ExternalLink size={10}/>}</button> }}>{resource.markdown}</Markdown><footer><span>{resource.fileName} · original source preserved</span>{pack && <button disabled={busy} onClick={() => void run(async () => { const heading = headings.find(h => h.id === headingId); await api.saveManualActivity({ id: createId(), goalId: pack.goalId, title: `Read: ${heading?.title || resource.title}`, kind: 'reading', date: localDate(), minutes: 0, note: `Reference: ${resource.fileName}${heading ? ` — ${heading.title}` : ''}` }); setMessage('Reading entry added to the timeline.'); })}>Log this reading in timeline</button>}</footer></>}
      </article>}
    </div>}
  </section>;
}
