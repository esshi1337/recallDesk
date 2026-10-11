import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StudyStore } from '../electron/store';
import { ExamSchema, createAttempt, isCorrect, noteKey, score } from '../shared/model';
import sample from '../examples/computer-fundamentals.json';

const exam = ExamSchema.parse(sample);
const options = { shuffleQuestions: false, shuffleOptions: false };
function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'recall-test-'));
  const store = new StudyStore(directory);
  store.seed(exam);
  return { store, directory, cleanup: () => { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}
test('exam validation catches broken keys and selection counts with readable errors', () => {
  assert.throws(() => ExamSchema.parse({ ...sample, questions: [{ ...sample.questions[0], correctOptionIds: ['missing'] }] }), /existing option IDs/);
  assert.throws(() => ExamSchema.parse({ ...sample, questions: [sample.questions[0], sample.questions[0]] }), /Question IDs must be unique/);
  assert.throws(() => ExamSchema.parse({ ...sample, questions: [{ ...sample.questions[2], selectCount: 3 }] }), /selectCount/);
});
test('multiple-answer scoring uses exact sets and treats unanswered as wrong', () => {
  const attempt = createAttempt(exam, options, 'attempt');
  const question = exam.questions.find(q => q.type === 'multiple-choice')!;
  const response = attempt.responses[question.id];
  response.selected = [question.correctOptionIds[0]];
  assert.equal(isCorrect(question, response), false);
  response.selected = [...question.correctOptionIds].reverse();
  assert.equal(isCorrect(question, response), true);
  assert.equal(score(attempt).correct, 1);
  response.selected.push(question.options.find(o => !question.correctOptionIds.includes(o.id))!.id);
  assert.equal(isCorrect(question, response), false);
});
test('saved progress, notes, flags, eliminations and shuffled order survive database reopen', () => {
  const f = fixture();
  try {
    const a = f.store.start(exam, { shuffleQuestions: true, shuffleOptions: true });
    const id = a.questionOrder[0], q = exam.questions.find(q => q.id === id)!;
    a.responses[id] = { selected: [q.options[0].id], eliminated: [q.options[1].id], note: 'Reasoning survives restart', flagged: true, revealed: true };
    a.currentIndex = 2; a.elapsedSeconds = 72; a.status = 'paused';
    f.store.saveAttempt(a);
    f.store.saveNote(noteKey(exam.id, id), 'Reusable insight');
    f.store.close();
    const reopened = new StudyStore(f.directory);
    assert.deepEqual(reopened.library().attempts[0], a);
    assert.equal(reopened.library().notes[noteKey(exam.id, id)], 'Reusable insight');
    reopened.close();
    rmSync(f.directory, { recursive: true, force: true });
  } catch (error) { try { f.cleanup(); } catch {} throw error; }
});
test('importing a new revision preserves prior attempt snapshot and backs up', () => {
  const f = fixture();
  try {
    f.store.start(exam, options);
    const revised = structuredClone(exam); revised.revision++; revised.questions[0].prompt = 'Updated question';
    f.store.importExam(revised);
    assert.equal(f.store.library().exams[0].questions[0].prompt, 'Updated question');
    assert.equal(f.store.library().attempts[0].exam.questions[0].prompt, exam.questions[0].prompt);
    assert.equal(f.store.backupFiles().length, 1);
    assert.throws(() => f.store.importExam(exam), /Increase the revision/);
  } finally { f.cleanup(); }
});
test('submitted attempts cannot be changed or resumed', () => {
  const f = fixture();
  try {
    const a = f.store.start(exam, options);
    a.status = 'submitted'; a.submittedAt = new Date().toISOString();
    f.store.saveAttempt(a);
    a.status = 'active';
    assert.throws(() => f.store.saveAttempt(a), /read-only/);
  } finally { f.cleanup(); }
});
test('backup round trip restores the full library and rejects invalid data before replacement', () => {
  const f = fixture();
  try {
    const a = f.store.start(exam, options);
    f.store.saveNote('sample-key', 'A note');
    f.store.saveSettings({ theme: 'dark', fontSize: 21, resumeOnLaunch: false });
    const file = f.store.backup('test');
    const backup = JSON.parse(readFileSync(file, 'utf8'));
    f.store.saveNote('sample-key', 'Changed');
    f.store.restore(backup);
    const restored = f.store.library();
    assert.equal(restored.notes['sample-key'], 'A note');
    assert.equal(restored.settings.fontSize, 21);
    assert.equal(restored.attempts[0].id, a.id);
    assert.equal(restored.attempts[0].status, 'paused');
    assert.throws(() => f.store.restore({ ...backup, attempts: [{ ...backup.attempts[0], questionOrder: ['missing'] }] }));
    assert.deepEqual(f.store.library().attempts, restored.attempts);
  } finally { f.cleanup(); }
});
test('backups rotate while retaining the newest full snapshots', () => {
  const f = fixture();
  try { for (let n = 0; n < 23; n++) f.store.backup(`test-${n}`); assert.equal(f.store.backupFiles().length, 20); }
  finally { f.cleanup(); }
});
test('subset attempts retain IDs and frozen option order', () => {
  const a = createAttempt(exam, { ...options, questionIds: ['json', 'dns'], limit: 1 }, 'subset');
  assert.deepEqual(a.questionOrder, ['dns']);
  assert.deepEqual(a.optionOrder.dns, exam.questions[0].options.map(o => o.id));
  assert.throws(() => createAttempt(exam, { ...options, questionIds: [] }, 'empty'), /at least one/);
});
test('rounded display percentages do not inflate the practice pass threshold', () => {
  const largeExam = ExamSchema.parse({ ...exam, questions: Array.from({ length: 201 }, (_, i) => ({ ...exam.questions[0], id: `q-${i}` })) });
  const a = createAttempt(largeExam, options, 'rounding');
  for (const q of largeExam.questions.slice(0, 140)) a.responses[q.id].selected = q.correctOptionIds;
  assert.equal(score(a).percent, 70);
  assert.equal(score(a).passed, false);
});
