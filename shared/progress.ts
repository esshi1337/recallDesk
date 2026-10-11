import { score, type Attempt, type Library } from './model';
import { localDate, type Goal, type Milestone, type StudySession, type ManualActivity } from './timeline';

export type TimelineEvent = {
  key: string; kind: 'session' | 'attempt' | 'manual' | 'completion'; date: string; endDate?: string; occurredAt?: string;
  title: string; summary: string; attempt?: Attempt; session?: StudySession; manual?: ManualActivity; milestone?: Milestone;
};
export function eventsForGoal(data: Library, goal: Goal): TimelineEvent[] {
  const attempts = data.attempts.filter(a => goal.examIds.includes(a.exam.id));
  const events: TimelineEvent[] = [];
  for (const a of attempts) {
    const sessions = data.studySessions.filter(s => s.attemptId === a.id);
    for (const s of sessions) events.push({ key: `session:${s.id}`, kind: 'session', date: localDate(s.startedAt), occurredAt: s.startedAt, endDate: localDate(s.endedAt || s.lastRecordedAt), title: a.exam.title, summary: `${studyDuration(s.seconds)} · ${s.recovered ? 'recovered session' : s.endedAt ? 'study session' : 'active session'}`, session: s, attempt: a });
    if (a.status === 'submitted') {
      const result = score(a);
      events.push({ key: `attempt:${a.id}`, kind: 'attempt', date: localDate(a.submittedAt || a.updatedAt), occurredAt: a.submittedAt || a.updatedAt, title: a.exam.title, summary: `${a.exam.diagnostic ? 'Raw ' : ''}${result.correct}/${result.total} · ${result.percent}% · ${result.revealed} revealed`, attempt: a });
    } else if (!sessions.length) events.push({ key: `attempt:${a.id}`, kind: 'attempt', date: localDate(a.createdAt), title: a.exam.title, summary: 'Older attempt · start recorded, session detail unavailable', attempt: a });
  }
  for (const a of data.manualActivities.filter(a => a.goalId === goal.id)) events.push({ key: `manual:${a.id}`, kind: 'manual', date: a.date, title: a.title, summary: `${a.kind}${a.minutes ? ` · ${a.minutes} min` : ''}`, manual: a });
  for (const m of data.milestones.filter(m => m.goalId === goal.id && m.status === 'completed' && m.completedAt)) events.push({ key: `completion:${m.id}`, kind: 'completion', date: localDate(m.completedAt!), occurredAt: m.completedAt, title: m.title, summary: 'Milestone completed', milestone: m });
  return events.sort((a, b) => a.date.localeCompare(b.date) || (a.occurredAt || '').localeCompare(b.occurredAt || '') || a.key.localeCompare(b.key));
}
export function studyDuration(seconds: number) {
  const total = Math.round(seconds);
  return total < 60 ? `${total} s` : `${Math.floor(total / 60)} min${total % 60 ? ` ${total % 60} s` : ''}`;
}
const questionKey = (a: Attempt, id: string) => JSON.stringify([a.exam.id, id]);
export function answerExposure(attempt: Attempt, all: Attempt[]) {
  const earlier = all.filter(a => a.id !== attempt.id && a.status === 'submitted' && (a.submittedAt || a.updatedAt) < attempt.createdAt);
  const seen = new Set(earlier.flatMap(a => a.questionOrder.filter(id => a.responses[id].selected.length).map(id => questionKey(a, id))));
  const answered = attempt.questionOrder.filter(id => attempt.responses[id].selected.length);
  const repeated = answered.filter(id => seen.has(questionKey(attempt, id))).length;
  return { firstAnswered: answered.length - repeated, repeated, unanswered: attempt.questionOrder.length - answered.length };
}
export function comparisonKey(a: Attempt) { return JSON.stringify([a.exam.id, a.exam.revision, [...a.questionOrder].sort()]); }
export function comparablePrevious(a: Attempt, all: Attempt[]) {
  return all.filter(other => other.id !== a.id && other.status === 'submitted' && (other.submittedAt || other.updatedAt) < (a.submittedAt || a.updatedAt) && comparisonKey(other) === comparisonKey(a) && !score(other).revealed && !score(a).revealed).sort((x, y) => (y.submittedAt || y.updatedAt).localeCompare(x.submittedAt || x.updatedAt))[0];
}
export function goalCoverage(data: Library, goal: Goal) {
  const attempts = data.attempts.filter(a => goal.examIds.includes(a.exam.id));
  const answered = new Set(attempts.flatMap(a => a.questionOrder.filter(id => a.responses[id].selected.length).map(id => questionKey(a, id))));
  return [...new Set(data.exams.filter(e => goal.examIds.includes(e.id)).flatMap(e => e.questions.flatMap(q => q.tags.length ? q.tags : ['Untagged'])))].sort().map(topic => {
    const keys = data.exams.filter(e => goal.examIds.includes(e.id)).flatMap(e => e.questions.filter(q => (q.tags.length ? q.tags : ['Untagged']).includes(topic)).map(q => JSON.stringify([e.id, q.id])));
    return { topic, answered: keys.filter(k => answered.has(k)).length, total: keys.length };
  });
}
export function milestoneEvidence(data: Library, milestone: Milestone, events: TimelineEvent[]) {
  const keys = new Set(data.evidenceLinks.filter(l => l.milestoneId === milestone.id).map(l => l.eventKey));
  const linked = events.filter(e => keys.has(e.key));
  const attempts = [...new Map(linked.filter(e => e.attempt?.status === 'submitted').map(e => [e.attempt!.id, e.attempt!])).values()];
  const groups = new Map<string, Attempt[]>();
  for (const a of attempts) {
    if (data.attemptReviews.some(r => r.attemptId === a.id && r.excludedQuestionIds.length)) continue;
    if (milestone.targetPercent === undefined || score(a).revealed || 100 * score(a).correct / score(a).total < milestone.targetPercent) continue;
    const key = comparisonKey(a); groups.set(key, [...(groups.get(key) || []), a]);
  }
  return { linked, attempts, targetMet: milestone.targetPercent !== undefined && [...groups.values()].some(g => g.length >= milestone.targetAttempts), flagged: attempts.reduce((n, a) => n + Object.values(a.responses).filter(r => r.flagged).length, 0) };
}
