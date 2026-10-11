import { usePhoneLayout, useDrawer } from './mobile';
import Templates from './Templates';
import BrowserStorage from './BrowserStorage';
import { api, isBrowser } from './platform';
import Materials from './Materials';
import DiagnosticSummary from './DiagnosticSummary';
import Modal from './Modal';
import Timeline from './Timeline';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, Clock3, Download, Files, Menu, List, Eye, Flag, FolderOpen, History, Import, LayoutGrid, Monitor, MoreHorizontal, Pause, Play, Plus, RotateCcw, Search, Settings2, ShieldCheck, StickyNote, Strikethrough, Upload, X } from 'lucide-react';
import { ExamSchema, emptyResponse, isCorrect, noteKey, score, type Attempt, type DesktopAPI, type Exam, type Library, type Response, type Settings, type StartOptions } from '../shared/model';
import template from '../examples/exam-template.json';

declare global { interface Window { desktop: DesktopAPI } }

type Session = { exam: Exam; attempt?: Attempt; evaluate: boolean; index: number };
type Job = () => Promise<unknown>;
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const duration = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
function Md({ text }: { text: string }) { return <Markdown remarkPlugins={[remarkGfm]} components={{ a: ({ children }) => <span className="source-text">{children}</span>, img: ({ alt }) => <span className="muted">[Image: {alt || 'embedded images are not supported in this version'}]</span> }}>{text}</Markdown>; }
function StartDialog({ exam, ids, onStart, onClose }: { exam: Exam; ids?: string[]; onStart: (o: StartOptions) => void; onClose: () => void }) {
  const [topic, setTopic] = useState('');
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [limit, setLimit] = useState(ids?.length || exam.questions.length);
  const [minutes, setMinutes] = useState(exam.timeLimitMinutes || 0);
  const [outsideHelp, setOutsideHelp] = useState('');
  const pool = exam.questions.filter(q => (!ids || ids.includes(q.id)) && (!topic || q.tags.includes(topic)));
  return <Modal title="Set up your session" onClose={onClose}><p className="muted">{exam.title}</p><form onSubmit={e => { e.preventDefault(); onStart({ questionIds: pool.map(q => q.id), shuffleQuestions, shuffleOptions, limit: Math.min(limit, pool.length), ...(outsideHelp ? { outsideHelp } : {}), ...(minutes > 0 ? { minutes } : {}) }); }}>
    {exam.instructions && <details className="baseline-instructions"><summary>Candidate instructions</summary><Md text={exam.instructions}/></details>}
    {exam.diagnostic && <label className="field">Outside help or prior study (optional)<textarea value={outsideHelp} onChange={e => setOutsideHelp(e.target.value)}/></label>}
    <label className="field">Topic / section<select value={topic} onChange={e => setTopic(e.target.value)}><option value="">All topics</option>{[...new Set(exam.questions.flatMap(q => q.tags))].map(t => <option key={t}>{t}</option>)}</select></label>
    <div className="two-col"><label className="field">Questions <input type="number" min="1" max={pool.length} value={Math.min(limit, pool.length)} onChange={e => setLimit(Number(e.target.value))}/></label><label className="field">Timer (minutes, 0 = off)<input type="number" min="0" max="1440" value={minutes} onChange={e => setMinutes(Number(e.target.value))}/></label></div>
    <label className="check-field"><input type="checkbox" checked={shuffleQuestions} onChange={e => setShuffleQuestions(e.target.checked)}/> Shuffle questions</label>
    <label className="check-field"><input type="checkbox" checked={shuffleOptions} onChange={e => setShuffleOptions(e.target.checked)}/> Shuffle answer options</label>
    <p className="hint">Exact-match scoring for multiple-answer questions. The timer pauses when you pause or close the app. At zero, you can submit or continue untimed.</p>
    <button className="primary full" disabled={!pool.length || limit < 1} type="submit"><Play size={16}/> Start student session</button>
  </form></Modal>;
}

export default function App() {
  const phone = usePhoneLayout();
  const [mobilePanel, setMobilePanel] = useState<'navigation' | 'questions' | 'notes' | null>(null);
  useDrawer(phone && !!mobilePanel, `[data-mobile-panel="${mobilePanel}"]`, () => setMobilePanel(null));
  const [library, setLibrary] = useState<Library | null>(null);
  const libraryRef = useRef<Library | null>(null);
  const [tab, setTab] = useState<'library' | 'history' | 'timeline' | 'materials' | 'templates' | 'settings'>('library');
  const [resourceLocation, setResourceLocation] = useState<{ resourceId: string; headingId?: string }>();
  const [session, setSessionState] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [setup, setSetup] = useState<{ exam: Exam; ids?: string[] } | null>(null);
  const [confirm, setConfirm] = useState<'submit' | 'reveal' | 'time' | null>(null);
  const [studyNotes, setStudyNotes] = useState(false);
  const [notesVisible, setNotesVisible] = useState(true);
  const [toast, setToast] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bootError, setBootError] = useState('');
  const jobs = useRef<Job[]>([]);
  const processing = useRef<Promise<void> | null>(null);
  const failed = useRef(false);
  const lastTick = useRef(Date.now());

  function notify(message: string) { setToast(message); }
  function updateLibrary(value: Library) { libraryRef.current = value; setLibrary(value); }
  function setSession(value: Session | null) { sessionRef.current = value; setSessionState(value); lastTick.current = Date.now(); }
  async function processJobs() {
    if (processing.current) return processing.current;
    if (failed.current) return;
    const runner = (async () => {
      while (jobs.current.length) {
        try { await jobs.current[0](); jobs.current.shift(); }
        catch (error) { failed.current = true; setSaveError(String(error)); setSaveStatus('error'); return; }
      }
      setSaveStatus('saved'); setSaveError('');
    })();
    processing.current = runner;
    await runner;
    processing.current = null;
  }
  function enqueue(job: Job) { jobs.current.push(job); setSaveStatus('saving'); void processJobs(); }
  async function flush() { await processJobs(); if (failed.current || jobs.current.length) throw new Error('Your changes have not been saved. Use Retry saving before continuing.'); }
  function saveAttempt(attempt: Attempt) {
    const updated = { ...attempt, updatedAt: new Date().toISOString() };
    const current = libraryRef.current;
    if (current) updateLibrary({ ...current, attempts: [updated, ...current.attempts.filter(a => a.id !== updated.id)] });
    enqueue(() => api.saveAttempt(updated));
    return updated;
  }
  function changeAttempt(patch: Partial<Attempt>) {
    const current = sessionRef.current;
    if (!current?.attempt || current.attempt.status === 'submitted') return;
    const elapsedSeconds = current.attempt.elapsedSeconds + (current.attempt.status === 'active' ? (Date.now() - lastTick.current) / 1000 : 0);
    const updated = saveAttempt({ ...current.attempt, elapsedSeconds, ...patch });
    setSession({ ...current, attempt: updated, index: updated.currentIndex });
  }
  function changeResponse(patch: Partial<Response>) {
    const current = sessionRef.current;
    if (!current?.attempt || current.attempt.status !== 'active') return;
    const id = current.attempt.questionOrder[current.index];
    changeAttempt({ responses: { ...current.attempt.responses, [id]: { ...current.attempt.responses[id], ...patch } } });
  }
  function captureTime() {
    const current = sessionRef.current;
    if (current?.attempt?.status === 'active') {
      const elapsed = current.attempt.elapsedSeconds + (Date.now() - lastTick.current) / 1000;
      changeAttempt({ elapsedSeconds: elapsed });
    }
  }
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); } catch (error) { notify(String(error).replace(/^Error: /, '')); }
    finally { setBusy(false); }
  }
  async function leave() {
    captureTime();
    if (sessionRef.current?.attempt?.status === 'active') changeAttempt({ status: 'paused' });
    await flush(); setSession(null); setMobilePanel(null); setFilter('all'); setStudyNotes(false);
  }
  async function openAttempt(attempt: Attempt) {
    await flush();
    const submitted = attempt.status === 'submitted';
    const resumed = submitted ? attempt : saveAttempt({ ...attempt, status: 'active' });
    setSession({ exam: resumed.exam, attempt: resumed, evaluate: submitted, index: resumed.currentIndex });
    setFilter('all'); setStudyNotes(false);
  }
  async function start(exam: Exam, options: StartOptions) {
    if (sessionRef.current) await leave();
    await flush();
    const attempt = await api.start(exam, options);
    const current = libraryRef.current!;
    updateLibrary({ ...current, attempts: [attempt, ...current.attempts] });
    setSession({ exam: attempt.exam, attempt, evaluate: false, index: 0 });
    setSetup(null); setFilter('all');
  }
  function submit() {
    captureTime();
    const current = sessionRef.current;
    if (!current?.attempt || current.attempt.status === 'submitted') return;
    const attempt = saveAttempt({ ...current.attempt, status: 'submitted', submittedAt: new Date().toISOString() });
    setSession({ ...current, attempt, evaluate: true }); setConfirm(null); setMobilePanel(null); setFilter('all');
  }
  function navigate(index: number) {
    const current = sessionRef.current;
    if (!current) return;
    if (current.attempt && current.attempt.status !== 'submitted') {
      captureTime(); changeAttempt({ currentIndex: index });
    } else setSession({ ...current, index });
    setStudyNotes(false);
    if (phone) setMobilePanel(null);
    document.querySelector('.question-scroll')?.scrollTo({ top: 0 });
  }
  function selectOption(id: string) {
    const current = sessionRef.current;
    if (!current?.attempt || current.evaluate) return;
    const q = current.exam.questions.find(q => q.id === current.attempt!.questionOrder[current.index])!;
    const r = current.attempt.responses[q.id];
    const selected = q.type === 'single-choice' ? (r.selected.includes(id) ? [] : [id]) : (r.selected.includes(id) ? r.selected.filter(x => x !== id) : [...r.selected, id]);
    changeResponse({ selected, eliminated: r.eliminated.filter(x => !selected.includes(x)) });
  }
  function saveStudyNote(key: string, text: string) {
    const current = libraryRef.current!;
    updateLibrary({ ...current, notes: { ...current.notes, [key]: text } });
    enqueue(() => api.saveNote(key, text));
  }
  function preferences(patch: Partial<Settings>) {
    const current = libraryRef.current!;
    const settings = { ...current.settings, ...patch };
    updateLibrary({ ...current, settings }); enqueue(() => api.saveSettings(settings));
  }
  useEffect(() => {
    api.library().then(data => {
      updateLibrary(data);
      const recent = data.attempts.find(a => a.status !== 'submitted');
      if (data.settings.resumeOnLaunch && recent) { setSession({ exam: recent.exam, attempt: recent, evaluate: false, index: recent.currentIndex }); if (recent.status === 'active') changeAttempt({ status: 'paused' }); }
    }).catch(e => setBootError(String(e)));
    return api.onBeforeClose(() => { return action(async () => { captureTime(); if (sessionRef.current?.attempt?.status === 'active') changeAttempt({ status: 'paused' }); await flush(); api.readyToClose(); }); });
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 7000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    document.documentElement.dataset.theme = library?.settings.theme || 'dark';
    document.documentElement.style.setProperty('--reading-size', `${library?.settings.fontSize || 17}px`);
  }, [library?.settings]);
  useEffect(() => {
    const interval = setInterval(() => {
      const current = sessionRef.current;
      if (!current?.attempt || current.attempt.status !== 'active') return;
      const elapsed = current.attempt.elapsedSeconds + (Date.now() - lastTick.current) / 1000;
      const limit = current.attempt.timeLimitSeconds;
      changeAttempt({ elapsedSeconds: limit ? Math.min(elapsed, limit) : elapsed, ...(limit && elapsed >= limit ? { status: 'paused' as const } : {}) });
      if (limit && elapsed >= limit) setConfirm('time');
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input,textarea,select,button,a,[contenteditable]') || event.ctrlKey || event.metaKey || event.altKey || setup || confirm) return;
      const current = sessionRef.current;
      if (!current) return;
      const order = current.attempt?.questionOrder || current.exam.questions.map(q => q.id);
      if (event.key === 'ArrowRight' && current.index < order.length - 1) { event.preventDefault(); navigate(current.index + 1); }
      if (event.key === 'ArrowLeft' && current.index > 0) { event.preventDefault(); navigate(current.index - 1); }
      const q = current.exam.questions.find(q => q.id === order[current.index])!;
      const options = current.attempt?.optionOrder[q.id] || q.options.map(o => o.id);
      if (/^[1-9]$/.test(event.key) && options[Number(event.key) - 1]) { event.preventDefault(); selectOption(options[Number(event.key) - 1]); }
      if (event.key.toLowerCase() === 'f' && current.attempt?.status === 'active') changeResponse({ flagged: !current.attempt.responses[q.id].flagged });
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [setup, confirm]);

  useEffect(() => { document.querySelector('.question-grid [aria-current="step"]')?.scrollIntoView({ block: 'nearest' }); }, [session?.index]);

  if (bootError) return <div className="boot"><h1>Could not open your study desk</h1><p>{bootError}</p></div>;
  if (!library) return <div className="boot"><BookOpen/><p>Opening your study desk…</p></div>;
  const exams = library.exams.filter(e => `${e.title} ${e.certification} ${e.description} ${e.questions.flatMap(q => q.tags).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const completed = library.attempts.filter(a => a.status === 'submitted');
  const active = library.attempts.filter(a => a.status !== 'submitted');
  const order = session?.attempt?.questionOrder || session?.exam.questions.map(q => q.id) || [];
  const question = session?.exam.questions.find(q => q.id === order[session.index]);
  const response = question ? session?.attempt?.responses[question.id] || emptyResponse() : emptyResponse();
  const revealed = session?.evaluate || response.revealed;
  const attempt = session?.attempt;
  const editable = attempt?.status === 'active' && !session?.evaluate;
  const review = attempt ? library.attemptReviews.find(r => r.attemptId === attempt.id) : undefined;
  const result = attempt?.status === 'submitted' ? score(attempt, review?.excludedQuestionIds) : null;
  const answered = attempt ? Object.values(attempt.responses).filter(r => r.selected.length).length : 0;
  const flagged = attempt ? Object.values(attempt.responses).filter(r => r.flagged).length : 0;
  const visible = order.map((id, index) => ({ id, index })).filter(({ id }) => {
    const r = attempt?.responses[id];
    if (!r || filter === 'all') return true;
    if (filter === 'flagged') return r.flagged;
    if (filter === 'unanswered') return !r.selected.length;
    if (filter === 'revealed') return r.revealed;
    if (filter === 'incorrect') return !isCorrect(session!.exam.questions.find(q => q.id === id)!, r);
    return true;
  });
  const nav = (target: typeof tab) => void action(async () => { setMobilePanel(null); if (session) await leave(); if (target === 'timeline' || target === 'materials') { await flush(); updateLibrary(await api.library()); } setTab(target); });

  async function importPack() {
    await flush(); const title = await api.importStudyPack();
    if (title) { updateLibrary(await api.library()); notify(`Imported ${title}.`); }
  }
  async function openResource(resourceId: string, headingId?: string) {
    if (sessionRef.current) await leave(); await flush(); updateLibrary(await api.library());
    setResourceLocation({ resourceId, headingId }); setTab('materials');
  }
  function excludeQuestion(excluded: boolean) {
    if (!attempt || !question) return;
    const next = { attemptId: attempt.id, excludedQuestionIds: excluded ? [...(review?.excludedQuestionIds || []), question.id] : (review?.excludedQuestionIds || []).filter(id => id !== question.id), note: review?.note || '' };
    updateLibrary({ ...library!, attemptReviews: [...library!.attemptReviews.filter(r => r.attemptId !== attempt.id), next] });
    enqueue(() => api.saveAttemptReview(next));
  }
  return <div className={`app-shell ${mobilePanel ? `mobile-panel-${mobilePanel}` : ''}`} data-save-state={saveStatus}>
    {phone && mobilePanel && <button className="mobile-backdrop" aria-label="Close panel" onClick={() => setMobilePanel(null)}/>}
    <aside className="sidebar" data-mobile-panel="navigation" role={phone && mobilePanel === 'navigation' ? 'dialog' : undefined} aria-modal={phone && mobilePanel === 'navigation' ? true : undefined} aria-label="Main navigation"><button className="mobile-only panel-close" aria-label="Close navigation" onClick={() => setMobilePanel(null)}><X size={20}/></button><div className="brand" title="Recall Desk"><BookOpen size={22}/></div>
      <nav>
        <button title="Exam library" className={tab === 'library' && !session ? 'nav-active' : ''} onClick={() => nav('library')}><LayoutGrid size={19}/> Exam library <span>{library.exams.length}</span></button>
        <button title="Study materials" className={tab === 'materials' && !session ? 'nav-active' : ''} onClick={() => nav('materials')}><BookOpen size={19}/> Study materials</button>
        <button title="Timeline" className={tab === 'timeline' && !session ? 'nav-active' : ''} onClick={() => nav('timeline')}><Clock3 size={19}/> Timeline</button>
        <button title="Study history" className={tab === 'history' && !session ? 'nav-active' : ''} onClick={() => nav('history')}><History size={19}/> Study history</button>
        <button title="Study templates" className={tab === 'templates' && !session ? 'nav-active' : ''} onClick={() => nav('templates')}><Files size={19}/> Study templates</button>
        <button title="Settings & backups" className={tab === 'settings' && !session ? 'nav-active' : ''} onClick={() => nav('settings')}><Settings2 size={19}/> Settings & backups</button>
      </nav>
      {session && <div className="session-label"><span className="live-dot"/> {session.evaluate ? 'EVALUATE MODE' : 'STUDENT MODE'}<strong>{session.exam.title}</strong><small>{order.length} questions · revision {session.exam.revision}</small></div>}
    </aside>
    <main className="main"><header className="topbar"><button className="mobile-only icon-button" aria-label="Open navigation" aria-expanded={mobilePanel === 'navigation'} onClick={() => setMobilePanel('navigation')}><Menu size={21}/></button><div className="breadcrumb">Recall Desk <ChevronRight size={14}/> <strong>{session ? (session.evaluate ? 'Evaluate' : 'Student session') : tab === 'library' ? 'Exam library' : tab === 'history' ? 'Study history' : tab === 'timeline' ? 'Timeline' : tab === 'materials' ? 'Study materials' : tab === 'templates' ? 'Study templates' : 'Settings & backups'}</strong></div></header>
      {saveError && <div className="save-error" role="alert"><div><strong>Your latest changes are still in memory.</strong><p>{saveError}</p></div><button onClick={() => { failed.current = false; void processJobs(); }}>Retry saving</button></div>}
      {!session && tab === 'library' && <div className="page">
        <div className="page-heading"><h1>Exams</h1><div className="row"><button disabled={busy} onClick={() => void action(importPack)}><BookOpen size={14}/> Import study pack</button><button onClick={() => void action(async () => { await api.exportExam(ExamSchema.parse(template)); })}><Download size={15}/> Export template</button><button className="primary" disabled={busy} onClick={() => void action(async () => { await flush(); const title = await api.importExam(); if (title) { updateLibrary(await api.library()); notify(`Imported “${title}”.`); } })}><Plus size={15}/> Import exam</button></div></div>
        <div className="library-toolbar"><label className="search"><Search size={15}/><input placeholder="Filter by name or topic…" aria-label="Search exams" value={search} onChange={e => setSearch(e.target.value)}/></label><span className="muted small">{exams.length} exams · {completed.length} completed sessions</span></div>
        {active.length > 0 && <div className="resume-row"><Pause size={15}/><span>{active[0].exam.title}</span><span className="muted small">{Object.values(active[0].responses).filter(r => r.selected.length).length}/{active[0].questionOrder.length} answered</span><button onClick={() => void action(() => openAttempt(active[0]))}>Resume session <ArrowRight size={14}/></button></div>}
        <div className="exam-list"><div className="list-header"><span>EXAM</span><span>QUESTIONS</span><span>LAST SCORE</span><span>ACTIONS</span></div>{exams.map(exam => {
          const previous = completed.filter(a => a.exam.id === exam.id);
          const tags = [...new Set(exam.questions.flatMap(q => q.tags))];
          return <article className="exam-row" key={exam.id}><div className="exam-description"><div className="row"><BookOpen size={16}/><h3>{exam.title}</h3></div><p>{exam.certification || 'General study'} · revision {exam.revision}</p><p className="exam-detail">{exam.description}</p><div className="tags">{tags.map(tag => <span key={tag}>{tag}</span>)}</div></div><span className="exam-count">{exam.questions.length}</span><span className="exam-score">{previous.length ? `${score(previous[0]).percent}%` : '—'}</span><div className="row exam-actions"><button className="primary" onClick={() => setSetup({ exam })}><Play size={13}/> Start test</button><button onClick={() => { setSession({ exam, evaluate: true, index: 0 }); setFilter('all'); }}><Eye size={14}/> Evaluate</button><button className="icon-button" title="Export exam JSON" aria-label={`Export ${exam.title}`} onClick={() => void action(async () => { if (await api.exportExam(exam)) notify('Exam exported.'); })}><Download size={15}/></button></div></article>;
        })}</div>
        {!exams.length && <div className="empty"><p>No exams match. Import a JSON exam or change the filter.</p></div>}
        <div className="library-footer">Single answer / multiple answer · JSON import and export · stored locally</div>
      </div>}
      {!session && tab === 'timeline' && <Timeline data={library} onChange={updateLibrary} onOpenResource={(id, heading) => void action(() => openResource(id, heading))} onOpenAttempt={a => void action(() => openAttempt(a))}/>}
      {!session && tab === 'materials' && <Materials data={library} initial={resourceLocation} onChange={updateLibrary} onImport={() => void action(importPack)}/>}
      {!session && tab === 'history' && <div className="page"><h1>Study history</h1><p className="intro">Attempts, scores, and saved sessions.</p><div className="history-list">{library.attempts.map(a => { const s = score(a); return <button className="history-row" key={a.id} onClick={() => void action(() => openAttempt(a))}><span className="exam-icon">{a.status === 'submitted' ? <CheckCircle2/> : <Pause/>}</span><div><h3>{a.exam.title}</h3><p>{date(a.createdAt)} · {a.questionOrder.length} questions · {duration(a.elapsedSeconds)} · revision {a.exam.revision}</p></div><span className="pill">{a.status === 'submitted' ? `${a.exam.diagnostic ? 'Raw ' : ''}${s.percent}% · ${s.correct}/${s.total}` : 'In progress'}</span>{s.revealed > 0 && <span className="small muted">{s.revealed} revealed</span>}<ChevronRight size={18}/></button>; })}</div>{!library.attempts.length && <div className="empty"><History/><h3>No sessions yet</h3><p>Start an exam to create a session.</p></div>}</div>}
      {!session && tab === 'templates' && <Templates/>}
      {!session && tab === 'settings' && <div className="page settings-page"><h1>Settings</h1><section className="settings-card"><h2><Monitor size={20}/> Appearance & sessions</h2><div className="setting-row"><div><strong>Theme</strong><p>Black matches your desktop theme.</p></div><select aria-label="Theme" value={library.settings.theme} onChange={e => preferences({ theme: e.target.value as Settings['theme'] })}><option value="light">Light</option><option value="dark">Black / desktop</option></select></div><div className="setting-row"><div><strong>Question text size</strong><p>Applies to prompts, options, and explanations.</p></div><input aria-label="Question text size" type="range" min="14" max="24" value={library.settings.fontSize} onChange={e => preferences({ fontSize: Number(e.target.value) })}/><span>{library.settings.fontSize}px</span></div><label className="setting-row"><div><strong>Reopen unfinished session</strong><p>Your session opens paused so the timer waits for you.</p></div><input type="checkbox" checked={library.settings.resumeOnLaunch} onChange={e => preferences({ resumeOnLaunch: e.target.checked })}/></label></section>
        <section className="settings-card"><h2><ShieldCheck size={20}/> Data & backups</h2><p>{isBrowser ? 'Changes save to IndexedDB in this browser. Recovery snapshots run at startup and every 15 minutes when data changes. The latest 20 are retained. Export a complete backup to move work between browsers or the desktop app.' : 'Changes save automatically to SQLite. Complete backups run at startup, every 15 minutes when data changes, and on close. The latest 20 backups are retained.'}</p><div className="data-path">{library.dataPath}</div><div className="row wrap"><button onClick={() => void action(async () => { await flush(); await api.backup(); updateLibrary(await api.library()); notify(isBrowser ? 'Recovery snapshot saved in this browser.' : 'Backup saved in your data folder.'); })}><ShieldCheck size={16}/> Back up now</button>{!isBrowser && <button onClick={() => void action(() => api.openDataFolder())}><FolderOpen size={16}/> Open data folder</button>}</div><hr/><div className="row wrap"><button onClick={() => void action(async () => { await flush(); if (await api.exportBackup()) notify('Complete backup exported.'); })}><Upload size={16}/> Export complete backup</button><button onClick={() => void action(async () => { await flush(); if (await api.restoreBackup()) { updateLibrary(await api.library()); notify('Backup restored.'); } })}><RotateCcw size={16}/> Restore backup</button></div><p className="hint">Backups include your exams, attempts, study notes, and preferences. Export one to another location to protect against loss of this computer.</p><p className="hint">Latest local backup: {library.lastBackup || 'None yet'}</p>{isBrowser && <BrowserStorage onChange={updateLibrary} flush={flush}/>}</section>
        <section className="settings-card"><h2>Keyboard shortcuts</h2><div className="shortcut-list"><span><kbd>1</kbd> – <kbd>9</kbd> Select an option</span><span><kbd>←</kbd> <kbd>→</kbd> Previous / next question</span><span><kbd>F</kbd> Flag for review</span></div><p className="hint">Shortcuts pause while you’re typing or focused on a control.</p></section>
      </div>}
      {session && question && <div className={`session-layout ${notesVisible ? "" : "notes-hidden"}`}><aside className="question-sidebar" data-mobile-panel="questions" role={phone && mobilePanel === 'questions' ? 'dialog' : undefined} aria-modal={phone && mobilePanel === 'questions' ? true : undefined} aria-label="Question navigation"><button className="mobile-only panel-close" aria-label="Close questions" onClick={() => setMobilePanel(null)}><X size={20}/></button><button className="text-button back" onClick={() => void action(async () => { await leave(); setTab('library'); })}><ArrowLeft size={16}/> Back to library</button><span className={`mode-badge ${session.evaluate ? 'evaluate' : ''}`}>{session.evaluate ? <Eye size={14}/> : <BookOpen size={14}/>} {session.evaluate ? 'Evaluate mode' : 'Student mode'}</span><h2>{session.exam.title}</h2>{session.exam.questions.some(q => q.section) && <select aria-label="Jump to section" className="question-section-select" value={question.section || ''} onChange={e => { const index = order.findIndex(id => session.exam.questions.find(q => q.id === id)?.section === e.target.value); if (index >= 0) navigate(index); }}>{[...new Set(order.map(id => session.exam.questions.find(q => q.id === id)?.section).filter(Boolean))].map(section => <option key={section}>{section}</option>)}</select>}<p className="muted small">revision {session.exam.revision} · {order.length} questions</p>
        {attempt && <><div className="progress-label"><strong>{answered}/{order.length}</strong><span>answered</span></div><div className="progress-track"><div style={{ width: `${100 * answered / order.length}%` }}/></div><div className="row between small muted"><span>{flagged} flagged</span><span>{order.length - answered} unanswered</span></div></>}
        {attempt && <label className="field filter-label">Show questions<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All questions</option><option value="flagged">Flagged for review</option><option value="unanswered">Unanswered</option><option value="revealed">Revealed</option>{session.evaluate && <option value="incorrect">Incorrect</option>}</select></label>}
        <div className="question-grid">{visible.map(({ id, index }) => { const r = attempt?.responses[id]; const correct = session.evaluate && r ? isCorrect(session.exam.questions.find(q => q.id === id)!, r) : false; return <button key={id} aria-label={`Question ${index + 1}${r?.flagged ? ', flagged' : ''}`} aria-current={index === session.index ? 'step' : undefined} className={`${index === session.index ? 'current' : ''} ${r?.selected.length ? 'answered' : ''} ${session.evaluate && r ? correct ? 'correct' : 'incorrect' : ''}`} onClick={() => navigate(index)}><span className="tree-number">{String(index + 1).padStart(2, "0")}</span><span className="tree-label">{session.exam.questions.find(q => q.id === id)!.prompt.replace(/[*#`]/g, "")}</span>{r?.flagged ? <Flag size={11}/> : r?.selected.length ? <Check size={11}/> : null}</button>; })}</div>{!visible.length && <p className="hint">No questions match this filter.</p>}
        <div className="question-legend"><span><i className="legend-current"/> Current</span><span><i className="legend-answered"/> Answered</span><span><Flag size={11}/> Flagged</span></div>
        {attempt && attempt.status !== 'submitted' && <button className="primary full submit-button" onClick={() => setConfirm('submit')}>Finish & evaluate <CheckCircle2 size={16}/></button>}
        {result && <div className="result-mini"><strong>{result.percent}%</strong><span>{result.correct} of {result.total} correct</span><small>{session.exam.diagnostic ? 'Diagnostic · no pass target' : result.passed ? 'Practice target reached' : `Practice target: ${session.exam.passingPercent}%`}</small>{review?.excludedQuestionIds.length ? <small>{review.excludedQuestionIds.length} excluded from these totals · raw {score(attempt!).correct}/{score(attempt!).total}</small> : null}{result.revealed > 0 && <small>{result.revealed} answer(s) revealed during this attempt</small>}<button onClick={() => setSetup({ exam: session.exam })}><RotateCcw size={14}/> Retake exam</button><button disabled={result.correct === result.total} onClick={() => setSetup({ exam: session.exam, ids: order.filter(id => !review?.excludedQuestionIds.includes(id) && !isCorrect(session.exam.questions.find(q => q.id === id)!, attempt!.responses[id])) })}>Practice missed</button>{flagged > 0 && <button onClick={() => setSetup({ exam: session.exam, ids: order.filter(id => attempt!.responses[id].flagged) })}>Practice flagged</button>}<button onClick={() => void action(async () => { await flush(); if (await api.exportAttempt(attempt!.id)) notify('Candidate answers exported.'); })}><Download size={13}/> Export candidate</button></div>}
      </aside><div className="question-area"><div className="question-toolbar"><button className="mobile-only icon-button" aria-label="Open questions" aria-expanded={mobilePanel === 'questions'} onClick={() => setMobilePanel('questions')}><List size={19}/></button><div className="row"><span className="eyebrow">QUESTION {session.index + 1} OF {order.length}</span>{response.revealed && <span className="pill">Answer revealed</span>}</div><div className="row">{attempt && <span className="timer"><Clock3 size={15}/>{duration(attempt.timeLimitSeconds ? Math.max(0, attempt.timeLimitSeconds - attempt.elapsedSeconds) : attempt.elapsedSeconds)}</span>}{attempt && attempt.status !== 'submitted' && <button className="icon-button" aria-label={attempt.status === 'active' ? 'Pause session' : 'Resume session'} onClick={() => { captureTime(); changeAttempt({ status: attempt.status === 'active' ? 'paused' : 'active' }); }}>{attempt.status === 'active' ? <Pause size={17}/> : <Play size={17}/>}</button>}{attempt && <button className={`flag-button ${response.flagged ? 'flagged' : ''}`} disabled={!editable} onClick={() => changeResponse({ flagged: !response.flagged })}><Flag size={15}/>{response.flagged ? 'Flagged' : 'Flag for review'}</button>}<button className="icon-button" title="Toggle notes panel" aria-label="Toggle notes panel" aria-expanded={phone ? mobilePanel === 'notes' : notesVisible} onClick={() => phone ? setMobilePanel('notes') : setNotesVisible(!notesVisible)}><StickyNote size={16}/></button></div></div>
        <div className="question-scroll">
          {attempt?.status === 'paused' && <div className="paused-banner"><Pause size={18}/><div><strong>Session paused</strong><span>Resume to continue answering.</span></div><button className="primary" onClick={() => changeAttempt({ status: 'active' })}>Resume</button></div>}
          {result && session.index === 0 && <div className="results-overview"><div><span className="eyebrow">SESSION COMPLETE</span><h2>{result.correct}/{result.total} correct · {result.percent}%</h2><p>Submitted answers are read-only.</p></div><div className="topic-results">{[...new Set(order.flatMap(id => session.exam.questions.find(q => q.id === id)!.tags))].map(tag => { const qs = session.exam.questions.filter(q => order.includes(q.id) && q.tags.includes(tag)); return <span key={tag}>{tag}<strong>{qs.filter(q => isCorrect(q, attempt!.responses[q.id])).length}/{qs.length}</strong></span>; })}</div></div>}
          <div className="question-content">{session.evaluate && attempt?.status === 'submitted' && session.exam.diagnostic && <DiagnosticSummary attempt={attempt} review={review}/>}<div className="row wrap">{question.section && <span className="question-id">{question.id}</span>}<span className="question-type">{question.type === 'single-choice' ? 'SINGLE ANSWER' : question.selectCount ? `CHOOSE ${question.selectCount} ANSWERS` : 'SELECT ALL THAT APPLY'}</span>{question.tags.map(tag => <span className="topic-tag" key={tag}>{tag}</span>)}</div><div className="prompt"><Md text={question.prompt}/></div><p className="answer-instruction">{session.evaluate ? (attempt ? 'Your selections are shown alongside the correct answers.' : 'Correct answers and explanations are shown below.') : question.type === 'single-choice' ? 'Select one answer. Cross out options you want to rule out.' : 'Select your answers. Credit requires the complete correct set.'}</p>
          <div className="options">{(attempt?.optionOrder[question.id] || question.options.map(o => o.id)).map((id, index) => {
            const option = question.options.find(o => o.id === id)!;
            const selected = response.selected.includes(id), eliminated = response.eliminated.includes(id), correct = question.correctOptionIds.includes(id);
            return <div key={id} className={`option ${selected ? 'selected' : ''} ${eliminated && !revealed ? 'eliminated' : ''} ${revealed && correct ? 'correct-answer' : ''} ${revealed && selected && !correct ? 'wrong-answer' : ''}`}><div className="option-top"><button className="option-select" disabled={!editable} onClick={() => selectOption(id)} aria-pressed={selected} aria-label={`Option ${String.fromCharCode(65 + index)}: ${option.text}`}><span className={`option-letter ${question.type === 'multiple-choice' ? 'square' : ''}`}>{selected ? <Check size={16}/> : String.fromCharCode(65 + index)}</span><div className="option-text"><Md text={option.text}/></div></button>{revealed ? <div className="answer-label">{correct && <span><CheckCircle2 size={14}/> Correct</span>}{selected && <small>Your answer</small>}</div> : <button className={`eliminate ${eliminated ? 'is-eliminated' : ''}`} aria-label={`${eliminated ? 'Restore' : 'Eliminate'} option ${String.fromCharCode(65 + index)}`} title={eliminated ? 'Restore option' : 'Mark as unlikely'} disabled={!editable} onClick={() => changeResponse({ eliminated: eliminated ? response.eliminated.filter(x => x !== id) : [...response.eliminated, id], selected: response.selected.filter(x => x !== id) })}><Strikethrough size={17}/></button>}</div>{revealed && option.explanation && <div className="option-explanation"><Md text={option.explanation}/></div>}</div>;
          })}</div>
          {revealed && <div className="explanation"><div className="row"><span className="explanation-icon"><BookOpen size={18}/></span><h3>Explanation</h3></div><Md text={question.explanation}/>{question.objective && <p className="diagnostic-meta">Objective {question.objective} · {question.diagnosticTopic}</p>}{question.sources.length > 0 && <div className="sources"><strong>Sources</strong>{question.sources.map(source => <div className="source-text" key={source}>{source}</div>)}</div>}</div>}
          {!revealed && editable && <button className="text-button reveal-button" onClick={() => setConfirm('reveal')}><Eye size={16}/> Reveal answer & explanation</button>}
          </div>
        </div><footer className="question-footer"><button disabled={session.index === 0} onClick={() => navigate(session.index - 1)}><ArrowLeft size={16}/> Previous</button><span className="small muted">{session.evaluate ? 'Read-only review' : '1–9 select · F flag · ← → navigate'}</span><button className="primary" disabled={session.index === order.length - 1} onClick={() => navigate(session.index + 1)}>Next question <ArrowRight size={16}/></button></footer>
      </div>{(notesVisible || (phone && mobilePanel === 'notes')) && <aside className="notes-sidebar" data-mobile-panel="notes" role={phone && mobilePanel === 'notes' ? 'dialog' : undefined} aria-modal={phone && mobilePanel === 'notes' ? true : undefined} aria-label="Question notes"><button className="mobile-only panel-close" aria-label="Close notes" onClick={() => setMobilePanel(null)}><X size={20}/></button><div className="notes-panel"><div className="row between"><h3><StickyNote size={17}/> {session.evaluate ? 'Study notes' : 'Question notes'}</h3><span className="small muted">Saved automatically</span></div>{attempt && <>{session.exam.diagnostic && <div className="diagnostic-fields"><label className="field">Confidence<select aria-label="Confidence" disabled={!editable} value={response.confidence || ''} onChange={e => changeResponse({ confidence: e.target.value ? e.target.value as 'K' | 'R' | 'G' : null })}><option value="">Not recorded</option><option value="K">K — can explain it</option><option value="R">R — reasoned, uncertain</option><option value="G">G — guess / elimination</option></select></label><label className="field">Familiar from prior practice?<select aria-label="Familiarity" disabled={!editable} value={response.familiar == null ? '' : response.familiar ? 'yes' : 'no'} onChange={e => changeResponse({ familiar: e.target.value === '' ? null : e.target.value === 'yes' })}><option value="">Not recorded</option><option value="no">No</option><option value="yes">Yes</option></select></label></div>}<label className="field">Scratch notes for this attempt<textarea aria-label="Scratch notes for this attempt" placeholder="Reasoning, reminders, working notes…" value={response.note} disabled={!editable} onChange={e => changeResponse({ note: e.target.value })}/></label>{session.evaluate && <p className="hint">Attempt notes are preserved with your submitted answers.</p>}{session.evaluate && attempt.status === 'submitted' && session.exam.diagnostic && <div className="review-exclusion"><label className="check-field"><input type="checkbox" checked={review?.excludedQuestionIds.includes(question.id) || false} onChange={e => excludeQuestion(e.target.checked)}/> Exclude this item from diagnostic totals while reviewing</label><p className="hint">Your original answer stays unchanged. History and timeline retain the raw result.</p></div>}</>}{session.evaluate || studyNotes ? <label className="field">Reusable study notes<textarea aria-label="Reusable study notes" placeholder="Notes shared across attempts…" value={library.notes[noteKey(session.exam.id, question.id)] || ''} onChange={e => saveStudyNote(noteKey(session.exam.id, question.id), e.target.value)}/></label> : <button className="text-button" onClick={() => setStudyNotes(true)}><Eye size={15}/> Show reusable study notes (may contain answers)</button>}</div></aside>}</div>}
    </main>
    {setup && <StartDialog exam={setup.exam} ids={setup.ids} onClose={() => setSetup(null)} onStart={options => void action(() => start(setup.exam, options))}/>}
    {confirm === 'submit' && <Modal title="Finish this attempt?" onClose={() => setConfirm(null)}><p>You’ve answered <strong>{answered} of {order.length}</strong> questions and flagged <strong>{flagged}</strong> for review.</p><p className="muted">Unanswered questions count as incorrect. Your answers and scratch notes will be preserved, and Evaluate will show the explanations.</p>{session?.exam.diagnostic && attempt && <><p className="hint">{order.filter(id => !attempt.responses[id].confidence || attempt.responses[id].familiar == null).length} question(s) still lack confidence or familiarity annotations.</p><label className="field">Outside help or study during this attempt<textarea aria-label="Outside help or study during this attempt" value={attempt.outsideHelp || ''} onChange={e => changeAttempt({ outsideHelp: e.target.value })}/></label></>}<div className="row end"><button onClick={() => { setConfirm(null); setFilter('flagged'); const index = order.findIndex(id => attempt?.responses[id].flagged); if (index >= 0) navigate(index); }}>Review flags</button><button className="primary" onClick={submit}>Submit & evaluate</button></div></Modal>}
    {confirm === 'reveal' && <Modal title="Reveal this answer?" onClose={() => setConfirm(null)}><p>The correct answers and explanations will stay visible for this question. This attempt will record that you revealed it.</p><div className="row end"><button onClick={() => setConfirm(null)}>Keep practicing</button><button className="primary" onClick={() => { changeResponse({ revealed: true }); setConfirm(null); }}>Reveal answer</button></div></Modal>}
    {confirm === 'time' && <Modal title="Your practice time is up" onClose={() => setConfirm(null)}><p>Your session is paused and your progress is saved. Submit now or keep studying without a time limit.</p><div className="row end"><button onClick={() => { changeAttempt({ timeLimitSeconds: undefined, status: 'active' }); setConfirm(null); }}>Continue untimed</button><button className="primary" onClick={submit}>Submit & evaluate</button></div></Modal>}
    {toast && <div className="toast" role="status"><span>{toast}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={16}/></button></div>}
  </div>;
}
