import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StudyStore } from '../electron/store';
import { BackupSchema, ExamSchema, createAttempt } from '../shared/model';
import { emptyTimeline, localDate, shiftDate, type Goal, type Milestone } from '../shared/timeline';
import { answerExposure, comparablePrevious, eventsForGoal, goalCoverage, milestoneEvidence } from '../shared/progress';
import sample from '../examples/computer-fundamentals.json';
const exam = ExamSchema.parse(sample);
const options = { shuffleQuestions: false, shuffleOptions: false };
const goal: Goal = { id: 'goal', title: 'Certification', description: '', examIds: [exam.id], archived: false, createdAt: '2026-10-10T15:00:00.000Z' };
const milestone: Milestone = { id: 'milestone', goalId: goal.id, title: 'Review networking', description: '', status: 'planned', targetDate: '2026-10-17', order: 0, targetAttempts: 1, targetPercent: 50 };
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'recall-timeline-'));
  let clock = '2026-10-10T15:00:00.000Z';
  const store = new StudyStore(dir, () => clock); store.seed(exam);
  return { dir, store, setClock: (value: string) => { clock = value; }, cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}
test('one attempt records separate sessions across pauses and days, without double-counting saves', () => {
  const f = fixture();
  try {
    const a = f.store.start(exam, options);
    f.setClock('2026-10-10T15:10:00.000Z'); a.elapsedSeconds = 600; f.store.saveAttempt(a); f.store.saveAttempt(a);
    a.status = 'paused'; f.store.saveAttempt(a);
    f.setClock('2026-10-11T16:00:00.000Z'); a.status = 'active'; f.store.saveAttempt(a);
    f.setClock('2026-10-11T16:05:00.000Z'); a.elapsedSeconds = 900; a.status = 'submitted'; a.submittedAt = '2026-10-11T16:05:00.000Z'; f.store.saveAttempt(a);
    const sessions = f.store.library().studySessions;
    assert.equal(sessions.length, 2); assert.deepEqual(sessions.map(s => s.seconds), [600, 300]);
    assert.equal(sessions[0].endedAt, '2026-10-10T15:10:00.000Z');
    assert.equal(sessions[1].startedAt, '2026-10-11T16:00:00.000Z');
  } finally { f.cleanup(); }
});
test('interrupted sessions end at the last persisted update without counting downtime', () => {
  const f = fixture();
  const a = f.store.start(exam, options); a.elapsedSeconds = 20;
  f.setClock('2026-10-10T15:00:20.000Z'); f.store.saveAttempt(a); f.store.close();
  const reopened = new StudyStore(f.dir, () => '2026-10-12T19:00:00.000Z');
  try {
    const session = reopened.library().studySessions[0];
    assert.equal(session.recovered, true); assert.equal(session.seconds, 20); assert.equal(session.endedAt, '2026-10-10T15:00:20.000Z');
    assert.equal(reopened.library().attempts[0].status, 'paused');
  } finally { reopened.close(); rmSync(f.dir, { recursive: true, force: true }); }
});
test('version-one upgrade creates a restorable backup, preserves old work, and does not invent sessions', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'recall-v1-')); const db = new DatabaseSync(path.join(dir, 'study.sqlite'));
  for (const table of ['exams', 'attempts', 'notes', 'settings']) db.exec(`CREATE TABLE ${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  db.prepare('INSERT INTO exams VALUES (?,?)').run(exam.id, JSON.stringify(exam));
  const a = createAttempt(exam, options, 'legacy'); a.responses.dns.note = 'Preserve this';
  db.prepare('INSERT INTO attempts VALUES (?,?)').run(a.id, JSON.stringify(a));
  db.prepare('INSERT INTO settings VALUES (?,?)').run('initialized', 'true'); db.exec('PRAGMA user_version=1'); db.close();
  const store = new StudyStore(dir);
  try {
    assert.equal(store.library().attempts[0].responses.dns.note, 'Preserve this');
    assert.equal(store.library().studySessions.length, 0);
    const backup = JSON.parse(readFileSync(path.join(dir, 'backups', store.backupFiles()[0]), 'utf8'));
    assert.equal(backup.version, 1); assert.equal(BackupSchema.parse(backup).version, 3);
    assert.equal(backup.attempts[0].status, 'active');
    store.restore(backup); assert.equal(store.library().attempts[0].responses.dns.note, 'Preserve this');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('rescheduling and reordering plans preserve actual activities, completion dates, and links', () => {
  const f = fixture();
  try {
    f.store.saveGoal(goal); f.store.saveMilestone(milestone); f.store.saveMilestone({ ...milestone, id: 'other', title: 'Undated', targetDate: undefined });
    f.store.saveManualActivity({ id: 'reading', goalId: goal.id, title: 'Trailhead', kind: 'reading', date: '2026-10-09', minutes: 25, note: 'Finished' });
    f.store.linkEvidence(milestone.id, 'manual:reading', true); f.store.linkEvidence(milestone.id, 'manual:reading', true);
    f.store.saveMilestone({ ...milestone, status: 'completed' }); const completedAt = f.store.library().milestones[0].completedAt;
    f.setClock('2026-10-12T16:00:00.000Z'); f.store.saveMilestone({ ...milestone, status: 'completed', targetDate: '2026-10-25' });
    f.store.reorderMilestones(goal.id, ['other', milestone.id]);
    const data = f.store.library();
    assert.equal(data.milestones.find(m => m.id === milestone.id)!.completedAt, completedAt);
    assert.equal(data.manualActivities[0].date, '2026-10-09'); assert.equal(data.evidenceLinks.length, 1);
    assert.equal(data.milestones.find(m => m.id === 'other')!.order, 0);
    assert.throws(() => f.store.reorderMilestones(goal.id, [milestone.id]), /list changed/);
    assert.throws(() => f.store.saveManualActivity({ id: 'future', goalId: goal.id, title: 'Future', kind: 'other', date: '2099-01-01', minutes: 0, note: '' }), /future/);
  } finally { f.cleanup(); }
});
test('timeline backup round-trip retains relationships; damaged backups do not replace live data', () => {
  const f = fixture();
  try {
    f.store.saveGoal(goal); f.store.saveMilestone(milestone); const a = f.store.start(exam, options);
    a.status = 'paused'; f.store.saveAttempt(a); f.store.linkEvidence(milestone.id, `session:${f.store.library().studySessions[0].id}`, true);
    const backup = f.store.exportData(); assert.equal(backup.version, 3);
    f.store.deleteMilestone(milestone.id); f.store.restore(backup);
    assert.deepEqual(f.store.library().evidenceLinks, backup.evidenceLinks);
    assert.deepEqual(f.store.library().milestones, backup.milestones);
    assert.throws(() => f.store.restore({ ...backup, studySessions: [{ ...backup.studySessions[0], attemptId: 'missing' }] }), /missing attempt/);
    assert.equal(f.store.library().milestones.length, 1);
    f.store.restore({ format: backup.format, version: 1, createdAt: backup.createdAt, exams: backup.exams, attempts: backup.attempts, notes: backup.notes, settings: backup.settings });
    assert.equal(f.store.library().goals.length, 0); assert.equal(f.store.library().attempts.length, 1);
  } finally { f.cleanup(); }
});
test('score targets require comparable, unrevealed evidence; exposure and coverage remain contextual', () => {
  const f = fixture();
  try {
    const first = createAttempt(exam, options, 'first'); first.createdAt = '2026-10-01T12:00:00.000Z'; first.status = 'submitted'; first.submittedAt = '2026-10-01T13:00:00.000Z';
    for (const q of exam.questions.slice(0, 3)) first.responses[q.id].selected = q.correctOptionIds;
    const second = structuredClone(first); second.id = 'second'; second.createdAt = '2026-10-03T12:00:00.000Z'; second.submittedAt = '2026-10-03T13:00:00.000Z'; second.responses.ram.selected = ['ram'];
    const data = { ...f.store.library(), ...emptyTimeline(), goals: [goal], milestones: [milestone], attempts: [second, first], evidenceLinks: [{ id: 'e', milestoneId: milestone.id, eventKey: 'attempt:second' }] };
    assert.equal(comparablePrevious(second, data.attempts)?.id, first.id);
    assert.deepEqual(answerExposure(second, data.attempts), { firstAnswered: 1, repeated: 3, unanswered: 2 });
    assert.equal(goalCoverage(data, goal).find(c => c.topic === 'Data')!.answered, 2);
    assert.equal(milestoneEvidence(data, milestone, eventsForGoal(data, goal)).targetMet, true);
    second.responses.ram.revealed = true;
    assert.equal(comparablePrevious(second, data.attempts), undefined);
    assert.equal(milestoneEvidence(data, milestone, eventsForGoal(data, goal)).targetMet, false);
    second.responses.ram.revealed = false; second.exam = { ...second.exam, revision: 2 };
    assert.equal(comparablePrevious(second, data.attempts), undefined);
  } finally { f.cleanup(); }
});
test('calendar shifts preserve dates across month/year boundaries', () => {
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.match(localDate(), /^\d{4}-\d{2}-\d{2}$/);
});
