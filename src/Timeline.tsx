import { createId } from '../shared/id';
import { usePhoneLayout, useDrawer } from './mobile';
import { api } from './platform';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Clock3, Edit3, Plus, X } from 'lucide-react';
import type { Attempt, Library } from '../shared/model';
import { score } from '../shared/model';
import { dayNumber, localDate, shiftDate, type Goal, type Milestone, type ManualActivity } from '../shared/timeline';
import { answerExposure, comparablePrevious, eventsForGoal, goalCoverage, milestoneEvidence, studyDuration, type TimelineEvent } from '../shared/progress';
import Modal from './Modal';
import './timeline.css';


const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const time = (d: string) => new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const minutes = studyDuration;
const uid = () => createId();
type Selection = { kind: 'milestone'; id: string } | { kind: 'event'; id: string };

function GoalForm({ data, goal, busy, error, onSave, onClose }: { data: Library; goal?: Goal; busy: boolean; error: string; onSave: (goal: Goal) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Goal>(goal || { id: uid(), title: '', description: '', examIds: [], archived: false, createdAt: new Date().toISOString() });
  const exams = [...new Map([...data.exams, ...data.attempts.map(a => a.exam)].map(e => [e.id, e])).values()];
  return <Modal title={goal ? 'Edit study goal' : 'New study goal'} onClose={onClose}><form onSubmit={e => { e.preventDefault(); onSave(draft); }}>{error && <p className="tl-inline-error" role="alert">{error}</p>}
    <label className="field">Goal name<input required autoFocus maxLength={200} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
    <label className="field">Description<textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label>
    <label className="field">Exam date (optional)<input type="date" value={draft.examDate || ''} onChange={e => setDraft({ ...draft, examDate: e.target.value || undefined })}/></label>
    <fieldset className="tl-fieldset"><legend>Linked exams</legend><p className="hint">Their existing and future attempts appear in this goal.</p>{exams.map(exam => <label className="check-field" key={exam.id}><input type="checkbox" checked={draft.examIds.includes(exam.id)} onChange={e => setDraft({ ...draft, examIds: e.target.checked ? [...draft.examIds, exam.id] : draft.examIds.filter(id => id !== exam.id) })}/>{exam.title}</label>)}{!exams.length && <p className="hint">You can link exams after importing them.</p>}</fieldset>
    {goal && <label className="check-field"><input type="checkbox" checked={draft.archived} onChange={e => setDraft({ ...draft, archived: e.target.checked })}/> Archive this goal</label>}
    <div className="row end"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !draft.title.trim()} type="submit">Save goal</button></div>
  </form></Modal>;
}
function MilestoneForm({ goal, milestone, busy, error, onSave, onClose }: { goal: Goal; milestone?: Milestone; busy: boolean; error: string; onSave: (m: Milestone) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Milestone>(milestone || { id: uid(), goalId: goal.id, title: '', description: '', status: 'planned', order: 0, targetAttempts: 1 });
  return <Modal title={milestone ? 'Edit milestone' : 'New milestone'} onClose={onClose}><form onSubmit={e => { e.preventDefault(); onSave(draft); }}>{error && <p className="tl-inline-error" role="alert">{error}</p>}
    <label className="field">Outcome<input required maxLength={200} placeholder="Review every missed permissions question" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
    <label className="field">Completion notes<textarea placeholder="What will count as finished?" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label>
    <div className="two-col"><label className="field">Target date (optional)<input type="date" value={draft.targetDate || ''} onChange={e => setDraft({ ...draft, targetDate: e.target.value || undefined })}/></label><label className="field">Status<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as Milestone['status'] })}><option value="planned">Planned</option><option value="in-progress">In progress</option><option value="completed">Completed</option><option value="deferred">Deferred</option></select></label></div>
    <fieldset className="tl-fieldset"><legend>Optional score target</legend><div className="two-col"><label className="field">Minimum score (%)<input type="number" min="0" max="100" value={draft.targetPercent ?? ''} placeholder="None" onChange={e => setDraft({ ...draft, targetPercent: e.target.value === '' ? undefined : Number(e.target.value) })}/></label><label className="field">Qualifying attempts<input type="number" min="1" max="100" value={draft.targetAttempts} onChange={e => setDraft({ ...draft, targetAttempts: Number(e.target.value) })}/></label></div><p className="hint">Checks linked attempts with the same exam revision and question set, without revealed answers. You still mark completion yourself.</p></fieldset>
    <div className="row end"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !draft.title.trim()} type="submit">Save milestone</button></div>
  </form></Modal>;
}
function ActivityForm({ goal, activity, busy, error, onSave, onClose }: { goal: Goal; activity?: ManualActivity; busy: boolean; error: string; onSave: (a: ManualActivity) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<ManualActivity>(activity || { id: uid(), goalId: goal.id, title: '', kind: 'reading', date: localDate(), minutes: 0, note: '' });
  return <Modal title={activity ? 'Edit activity' : 'Log study activity'} onClose={onClose}><form onSubmit={e => { e.preventDefault(); onSave(draft); }}>{error && <p className="tl-inline-error" role="alert">{error}</p>}
    <label className="field">Activity title<input required maxLength={200} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
    <div className="two-col"><label className="field">Type<select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as ManualActivity['kind'] })}><option value="reading">Reading / Trailhead</option><option value="lab">Lab / exercise</option><option value="video">Video / course</option><option value="other">Other</option></select></label><label className="field">Date<input required type="date" max={localDate()} value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })}/></label></div>
    <label className="field">Minutes (optional)<input type="number" min="0" max="1440" value={draft.minutes || ''} onChange={e => setDraft({ ...draft, minutes: Number(e.target.value) })}/></label>
    <label className="field">Notes<textarea value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })}/></label>
    <div className="row end"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !draft.title.trim()} type="submit">Save activity</button></div>
  </form></Modal>;
}

export default function Timeline({ data, onChange, onOpenAttempt, onOpenResource }: { data: Library; onChange: (data: Library) => void; onOpenAttempt: (a: Attempt) => void; onOpenResource: (id: string, headingId?: string) => void }) {
  const phone = usePhoneLayout();
  const [mobilePanel, setMobilePanel] = useState<'plan' | 'details' | null>(null);
  useDrawer(phone && !!mobilePanel, mobilePanel === 'plan' ? '.tl-plan' : '.tl-details', () => setMobilePanel(null));
  const [goalId, setGoalId] = useState(data.goals.find(g => !g.archived)?.id || data.goals[0]?.id || '');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [form, setForm] = useState<'goal' | 'milestone' | 'activity' | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [zoom, setZoom] = useState('30');
  const [anchor, setAnchor] = useState(shiftDate(localDate(), -7));
  const [today, setToday] = useState(localDate());
  const [kind, setKind] = useState('all');
  const [pendingLinks, setPendingLinks] = useState<Record<string, boolean>>({});
  useEffect(() => { const timer = setInterval(() => setToday(localDate()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => { setDeleting(false); }, [selection?.id]);
  useEffect(() => { setError(''); }, [form]);
  const goal = data.goals.find(g => g.id === goalId);
  const completedCount = data.attempts.filter(a => goal?.examIds.includes(a.exam.id) && a.status === 'submitted').length;
  const milestones = data.milestones.filter(m => m.goalId === goalId).sort((a, b) => a.order - b.order);
  const events = useMemo(() => goal ? eventsForGoal(data, goal) : [], [data, goal]);
  const allDates = [today, ...milestones.flatMap(m => m.targetDate ? [m.targetDate] : []), ...events.flatMap(e => [e.date, e.endDate || e.date]), ...(goal?.examDate ? [goal.examDate] : [])].sort();
  const first = zoom === 'all' ? shiftDate(allDates[0], -2) : anchor;
  const span = zoom === 'all' ? Math.max(7, dayNumber(allDates.at(-1)!) - dayNumber(first) + 3) : Number(zoom);
  const last = shiftDate(first, span - 1);
  const chartWidth = Math.max(640, Math.min(2200, span * 32));
  const pos = (d: string) => 100 * (dayNumber(d) - dayNumber(first) + .5) / span;
  const inRange = (d: string) => d >= first && d <= last;
  const planned = milestones.filter(m => m.targetDate && inRange(m.targetDate));
  const actual = events.filter(e => (kind === 'all' || e.kind === kind) && e.date <= last && (e.endDate || e.date) >= first);
  const selectedMilestone = selection?.kind === 'milestone' ? milestones.find(m => m.id === selection.id) : undefined;
  const selectedEvent = selection?.kind === 'event' ? events.find(e => e.key === selection.id) : undefined;
  const coverage = goal ? goalCoverage(data, goal) : [];
  const evidence = selectedMilestone ? milestoneEvidence(data, selectedMilestone, events) : null;
  const closeForm = () => setForm(null);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); onChange(await api.library()); return true; }
    catch (e) { setError(String(e).replace(/^Error: /, '')); return false; }
    finally { setBusy(false); }
  }
  function selectMilestone(m: Milestone) { if (phone) setMobilePanel('details'); setSelection({ kind: 'milestone', id: m.id }); if (zoom !== 'all' && m.targetDate && !inRange(m.targetDate)) setAnchor(shiftDate(m.targetDate, -7)); }
  function selectEvent(e: TimelineEvent) { if (phone) setMobilePanel('details'); setSelection({ kind: 'event', id: e.key }); if (zoom !== 'all' && !inRange(e.date)) setAnchor(shiftDate(e.date, -7)); }
  async function toggleEvidence(milestoneId: string, eventKey: string, linked: boolean) {
    const key = JSON.stringify([milestoneId, eventKey]);
    setPendingLinks(current => ({ ...current, [key]: linked }));
    await run(() => api.linkEvidence(milestoneId, eventKey, linked));
    setPendingLinks(current => { const next = { ...current }; delete next[key]; return next; });
  }
  function move(m: Milestone, direction: number) {
    const ids = milestones.map(m => m.id), index = ids.indexOf(m.id), next = index + direction;
    if (next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    void run(() => api.reorderMilestones(m.goalId, ids));
  }
  const mark = (key: string, d: string, label: string, isPlan: boolean, onClick: () => void, selected = false) => <button key={key} aria-label={`${isPlan ? 'Planned' : 'Activity'}: ${label}`} title={`${d} · ${label}`} className={`tl-marker ${isPlan ? 'planned' : 'actual'} ${selected ? 'selected' : ''} ${pos(d) > 75 ? 'label-left' : ''}`} style={{ left: `${Math.max(1, Math.min(99, pos(d)))}%` }} onClick={onClick}><i/><span>{label}</span></button>;
  return <section className={`timeline-view ${mobilePanel ? `timeline-panel-${mobilePanel}` : ''}`}>{phone && mobilePanel && <button className="mobile-backdrop" aria-label="Close timeline panel" onClick={() => setMobilePanel(null)}/>}
    <header className="tl-toolbar"><h1>Timeline</h1>{data.goals.length > 0 && <select aria-label="Study goal" value={goalId} onChange={e => { setGoalId(e.target.value); setSelection(null); }}><option value="" disabled>Select a goal</option>{data.goals.map(g => <option key={g.id} value={g.id}>{g.title}{g.archived ? ' (archived)' : ''}</option>)}</select>}<button onClick={() => { setEditing(false); setForm('goal'); }}><Plus size={14}/> New goal</button>{goal && <button title="Edit goal" aria-label="Edit goal" className="icon-button" onClick={() => { setEditing(true); setForm('goal'); }}><Edit3 size={14}/></button>}</header>
    {error && !form && <div className="tl-error" role="alert">{error}<button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={14}/></button></div>}
    {!goal ? <div className="tl-empty"><h2>Create a study goal</h2><p>Link your exams, arrange milestones, and compare planned work with actual study sessions.</p><button className="primary" onClick={() => { setEditing(false); setForm('goal'); }}>Create goal</button></div> : <>
      <div className="tl-summary"><span>{milestones.filter(m => m.status === 'completed').length}/{milestones.length} milestones complete</span><span>{completedCount} completed {completedCount === 1 ? 'attempt' : 'attempts'}</span>{goal.examDate && <span>Exam: {shortDate(goal.examDate)}</span>}{goal.archived && <span>Archived goal</span>}</div>
      <div className="tl-layout"><aside className="tl-plan" role={phone && mobilePanel === 'plan' ? 'dialog' : undefined} aria-modal={phone && mobilePanel === 'plan' ? true : undefined} aria-label="Milestones"><button className="mobile-only panel-close" aria-label="Close milestones" onClick={() => setMobilePanel(null)}><X size={20}/></button><div className="tl-panel-heading"><h2>Milestones</h2><button className="icon-button" title="Add milestone" aria-label="Add milestone" onClick={() => { setEditing(false); setForm('milestone'); }}><Plus size={15}/></button></div>
        {!milestones.length && <p className="hint tl-padding">Add an outcome you want to work toward. Dates are optional.</p>}
        <ol className="tl-milestones">{milestones.map((m, index) => <li key={m.id} className={selectedMilestone?.id === m.id ? 'selected' : ''}><button className="tl-milestone-select" onClick={() => selectMilestone(m)}><span className={`tl-status ${m.status}`}>{m.status === 'completed' ? <Check size={12}/> : '◇'}</span><span><strong>{m.title}</strong><small>{m.targetDate ? shortDate(m.targetDate) : 'Unscheduled'} · {m.status.replace('-', ' ')}</small></span></button><div className="tl-order"><button aria-label={`Move ${m.title} up`} disabled={busy || index === 0} onClick={() => move(m, -1)}><ArrowUp size={11}/></button><button aria-label={`Move ${m.title} down`} disabled={busy || index === milestones.length - 1} onClick={() => move(m, 1)}><ArrowDown size={11}/></button></div></li>)}</ol>
        <div className="tl-panel-heading"><h2>Topic coverage</h2></div><p className="hint tl-padding">Questions answered at least once, against your current exam library.</p><div className="tl-coverage">{coverage.map(c => <div key={c.topic}><span>{c.topic}</span><code>{c.answered}/{c.total}</code><meter min={0} max={c.total} value={c.answered} aria-label={`${c.topic} coverage`}/></div>)}</div>{!coverage.length && <p className="hint tl-padding">Link an exam to track coverage.</p>}
      </aside><div className="tl-center"><div className="tl-range-toolbar"><button className="mobile-only" onClick={() => setMobilePanel('plan')}>Milestones</button><div className="row"><button aria-label="Previous time range" disabled={zoom === 'all'} onClick={() => setAnchor(shiftDate(anchor, -Number(zoom)))}><ArrowLeft size={13}/></button><button onClick={() => { setZoom('30'); setAnchor(shiftDate(today, -7)); }}>Today</button><button aria-label="Next time range" disabled={zoom === 'all'} onClick={() => setAnchor(shiftDate(anchor, Number(zoom)))}><ArrowRight size={13}/></button></div><select aria-label="Timeline range" value={zoom} onChange={e => setZoom(e.target.value)}><option value="14">2 weeks</option><option value="30">Month</option><option value="90">Quarter</option><option value="all">All dates</option></select><button onClick={() => { setEditing(false); setForm('activity'); }}><Plus size={13}/> Log activity</button></div>
        <div className="tl-range-label">{shortDate(first)} – {shortDate(last)} <span>{first.slice(0, 4)}{first.slice(0, 4) !== last.slice(0, 4) ? `–${last.slice(0, 4)}` : ''}</span><span>◇ plan · ● activity</span></div>
        <div className="tl-chart-scroll"><div className="tl-chart" style={{ width: chartWidth }}>
          <div className="tl-axis">{Array.from({ length: Math.ceil(span / Math.max(1, Math.ceil(span / 20))) }, (_, i) => i * Math.max(1, Math.ceil(span / 20))).map(day => <span key={day} style={{ left: `${pos(shiftDate(first, day))}%` }}>{shortDate(shiftDate(first, day))}</span>)}</div>
          {inRange(today) && <div className="tl-today" style={{ left: `${pos(today)}%` }}><span>Today</span></div>}
          <div className="tl-lane-heading">PLAN</div>
          {planned.map(m => <div className="tl-chart-row" key={m.id}>{mark(m.id, m.targetDate!, m.title, true, () => selectMilestone(m), selectedMilestone?.id === m.id)}</div>)}
          {goal.examDate && inRange(goal.examDate) && <div className="tl-chart-row">{mark('exam-date', goal.examDate, 'Exam date', true, () => { setEditing(true); setForm('goal'); })}</div>}
          {!planned.length && !(goal.examDate && inRange(goal.examDate)) && <p className="tl-chart-empty">No scheduled milestones in this range.</p>}
          <div className="tl-lane-heading">ACTIVITY <select aria-label="Activity type" value={kind} onChange={e => setKind(e.target.value)}><option value="all">All activity</option><option value="session">Study sessions</option><option value="attempt">Attempt results</option><option value="manual">Manual entries</option><option value="completion">Milestone completions</option></select></div>
          {actual.map(e => <div className="tl-chart-row" key={e.key}>{e.endDate && e.endDate !== e.date && <span className="tl-session-bar" style={{ left: `${Math.max(0, pos(e.date))}%`, width: `${Math.max(0, Math.min(100, pos(e.endDate)) - Math.max(0, pos(e.date)))}%` }}/>} {mark(e.key, e.date < first ? first : e.date, `${e.title} · ${e.summary}`, false, () => selectEvent(e), selectedEvent?.key === e.key)}</div>)}
          {!actual.length && <p className="tl-chart-empty">No activity in this range.</p>}
        </div></div>
        <div className="tl-event-list"><h2>Activity log <span className="muted small">· all dates</span></h2>{[...events].reverse().filter(e => kind === 'all' || e.kind === kind).map(e => <button key={e.key} className={selectedEvent?.key === e.key ? 'selected' : ''} onClick={() => selectEvent(e)}><time>{shortDate(e.date)}</time><span><strong>{e.title}</strong><small>{e.summary}</small></span></button>)}{!events.length && <p className="hint">Practice a linked exam or log reading, a lab, or a course.</p>}</div>
      </div><aside className="tl-details" role={phone && mobilePanel === 'details' ? 'dialog' : undefined} aria-modal={phone && mobilePanel === 'details' ? true : undefined} aria-label="Timeline details"><button className="mobile-only panel-close" aria-label="Close timeline details" onClick={() => setMobilePanel(null)}><X size={20}/></button><div className="tl-panel-heading"><h2>{selectedMilestone ? 'Milestone' : selectedEvent ? 'Activity details' : 'Details'}</h2>{selection && <button className="icon-button" aria-label="Close details" onClick={() => { setSelection(null); setMobilePanel(null); }}><X size={14}/></button>}</div>
        {!selectedMilestone && !selectedEvent && <p className="hint tl-padding">Select a milestone or an activity to inspect it and link supporting work.</p>}
        {selectedMilestone && evidence && <div className="tl-detail-content"><h3>{selectedMilestone.title}</h3><div className="tl-note tl-markdown"><Markdown remarkPlugins={[remarkGfm]} components={{ a: ({ children }) => <span>{children}</span> }}>{selectedMilestone.description || 'No completion notes.'}</Markdown></div><dl><dt>Status</dt><dd>{selectedMilestone.status.replace('-', ' ')}</dd><dt>Planned</dt><dd>{selectedMilestone.targetDate || 'Unscheduled'}</dd>{selectedMilestone.completedAt && <><dt>Completed</dt><dd>{time(selectedMilestone.completedAt)}</dd></>}</dl>
          <div className="row wrap"><button disabled={busy} onClick={() => { setEditing(true); setForm('milestone'); }}><Edit3 size={12}/> Edit milestone</button><button disabled={busy} className="primary" onClick={() => void run(() => api.saveMilestone({ ...selectedMilestone, status: selectedMilestone.status === 'completed' ? 'in-progress' : 'completed' }))}>{selectedMilestone.status === 'completed' ? 'Reopen milestone' : 'Mark complete'}</button></div>
          {selectedMilestone.targetPercent !== undefined && <div className="tl-criterion"><strong>{selectedMilestone.targetPercent}% across {selectedMilestone.targetAttempts} comparable linked {selectedMilestone.targetAttempts === 1 ? 'attempt' : 'attempts'}</strong><p>{evidence.targetMet ? 'Score target met. Completion is still your decision.' : 'Score target not yet met by the linked evidence.'}</p></div>}
          <div className="row wrap">{(selectedMilestone.resourceRefs || []).map(ref => <button key={`${ref.resourceId}:${ref.headingId}`} onClick={() => onOpenResource(ref.resourceId, ref.headingId)}>Open study reference</button>)}</div><h4>Linked evidence ({evidence.linked.length})</h4>{evidence.linked.map(e => <button className="tl-evidence" key={e.key} onClick={() => selectEvent(e)}><strong>{e.title}</strong><small>{shortDate(e.date)} · {e.summary}</small></button>)}{!evidence.linked.length && <p className="hint">Select an activity, then check this milestone to link it.</p>}
          {evidence.attempts.length > 0 && <p className="hint">Flagged responses in linked attempts: {evidence.flagged}.</p>}
          <button className="tl-delete" disabled={busy} onClick={() => deleting ? void run(() => api.deleteMilestone(selectedMilestone.id)).then(ok => { if (ok) setSelection(null); }) : setDeleting(true)}>{deleting ? 'Confirm delete milestone' : 'Delete milestone'}</button>
        </div>}
        {selectedEvent && <div className="tl-detail-content"><h3>{selectedEvent.title}</h3><p className="hint">{selectedEvent.date} · {selectedEvent.summary}</p>
          {selectedEvent.session && <dl><dt>Started</dt><dd>{time(selectedEvent.session.startedAt)}</dd><dt>Ended</dt><dd>{selectedEvent.session.endedAt ? time(selectedEvent.session.endedAt) : 'Active'}</dd><dt>Recorded time</dt><dd>{minutes(selectedEvent.session.seconds)}</dd></dl>}
          {selectedEvent.session?.recovered && <p className="hint">The app reopened after an interruption. This session ends at its last saved update.</p>}
          {selectedEvent.kind === 'attempt' && selectedEvent.attempt?.status === 'submitted' && <AttemptDetails attempt={selectedEvent.attempt} all={data.attempts}/>}
          {selectedEvent.manual && <><p className="tl-note">{selectedEvent.manual.note || 'No notes.'}</p><button onClick={() => { setEditing(true); setForm('activity'); }}><Edit3 size={12}/> Edit activity</button></>}
          {selectedEvent.attempt && <button onClick={() => onOpenAttempt(selectedEvent.attempt!)}>{selectedEvent.attempt.status === 'submitted' ? 'Review attempt' : 'Resume attempt'}</button>}
          {selectedEvent.milestone && <button onClick={() => selectMilestone(selectedEvent.milestone!)}>Open milestone</button>}
          {selectedEvent.kind !== 'completion' && <><h4>Supports milestones</h4>{milestones.map(m => <label key={m.id} className="check-field"><input type="checkbox" disabled={busy} checked={pendingLinks[JSON.stringify([m.id, selectedEvent.key])] ?? data.evidenceLinks.some(l => l.eventKey === selectedEvent.key && l.milestoneId === m.id)} onChange={e => void toggleEvidence(m.id, selectedEvent.key, e.target.checked)}/>{m.title}</label>)}{!milestones.length && <p className="hint">Add a milestone first.</p>}</>}
          {selectedEvent.manual && <button className="tl-delete" disabled={busy} onClick={() => deleting ? void run(() => api.deleteManualActivity(selectedEvent.manual!.id)).then(ok => { if (ok) setSelection(null); }) : setDeleting(true)}>{deleting ? 'Confirm delete activity' : 'Delete activity'}</button>}
        </div>}
      </aside></div>
    </>}
    {form === 'goal' && <GoalForm data={data} goal={editing ? goal : undefined} busy={busy} error={error} onClose={closeForm} onSave={g => void run(() => api.saveGoal(g)).then(ok => { if (ok) { setGoalId(g.id); setSelection(null); closeForm(); } })}/>}
    {form === 'milestone' && goal && <MilestoneForm goal={goal} milestone={editing ? selectedMilestone : undefined} busy={busy} error={error} onClose={closeForm} onSave={m => void run(() => api.saveMilestone(m)).then(ok => { if (ok) { selectMilestone(m); closeForm(); } })}/>}
    {form === 'activity' && goal && <ActivityForm goal={goal} activity={editing ? selectedEvent?.manual : undefined} busy={busy} error={error} onClose={closeForm} onSave={a => void run(() => api.saveManualActivity(a)).then(ok => { if (ok) { setSelection({ kind: 'event', id: `manual:${a.id}` }); if (phone) setMobilePanel('details'); closeForm(); } })}/>}
  </section>;
}
function AttemptDetails({ attempt, all }: { attempt: Attempt; all: Attempt[] }) {
  const result = score(attempt), exposure = answerExposure(attempt, all), previous = comparablePrevious(attempt, all);
  const difference = previous ? result.percent - score(previous).percent : null;
  return <><dl><dt>{attempt.exam.diagnostic ? 'Raw score' : 'Score'}</dt><dd>{result.correct}/{result.total} ({result.percent}%)</dd><dt>Revealed</dt><dd>{result.revealed}</dd><dt>First answers*</dt><dd>{exposure.firstAnswered}</dd><dt>Repeated answers*</dt><dd>{exposure.repeated}</dd><dt>Unanswered</dt><dd>{exposure.unanswered}</dd><dt>Exam revision</dt><dd>{attempt.exam.revision}</dd></dl><p className="hint">*Compared with questions answered in earlier completed attempts. Question IDs are stable across revisions.</p>{previous ? <p className="tl-criterion">Previous comparable result: {score(previous).percent}% → {result.percent}% ({difference! > 0 ? '+' : ''}{difference} points).</p> : <p className="hint">No earlier result with this same exam revision and question set, without revealed answers, to compare.</p>}</>;
}
