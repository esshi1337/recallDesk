import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { StudyStore } from '../electron/store';
import { StudyPackSchema } from '../shared/study-pack';
import { documentHeadings } from '../shared/materials';
import { candidateMarkdown, diagnosticRows } from '../shared/diagnostics';
import { score } from '../shared/model';
const raw = JSON.parse(readFileSync('examples/arithmetic.study-pack.json', 'utf8'));
const pack = StudyPackSchema.parse(raw), exam = pack.exams[0];
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'recall-materials-')); const store = new StudyStore(dir);
  return { dir, store, cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}
test('sample pack preserves choices, source keys, objective metadata, and document checksums', () => {
  assert.equal(exam.questions.length, 4);
  assert.equal(new Set(exam.questions.map(q => q.section)).size, 2);
  const key = pack.resources.find(r => r.kind === 'answer-key')!.markdown;
  const candidate = pack.resources.find(r => r.kind === 'candidate')!.markdown;
  for (const q of exam.questions) {
    assert.equal(q.options.length, 6); assert.equal(q.shuffleOptions, false);
    assert.ok(q.objective); assert.ok(q.diagnosticTopic); assert.ok(q.explanation);
    assert.ok(candidate.includes(q.prompt)); assert.ok(key.includes(q.prompt));
    for (const o of q.options) assert.ok(candidate.includes(`- **${o.id}.** ${o.text}`));
    const block = key.split(`### ${q.id}\n`)[1].split('\n### ')[0];
    assert.ok(block.includes(`**Correct answer:** ${q.correctOptionIds[0]}`));
  }
  assert.equal(candidate.includes('**Correct answer'), false);
  for (const r of pack.resources) assert.equal(createHash('sha256').update(r.markdown).digest('hex'), r.sha256);
  assert.equal(exam.diagnostic, true); assert.equal(exam.timeLimitMinutes, undefined);
});
test('roadmap imports six undated phases and leaves three modules optional; re-import preserves personal progress', () => {
  const f = fixture();
  try {
    f.store.importStudyPack(pack); const initial = f.store.library();
    assert.equal(initial.milestones.length, 6); assert.equal(initial.studyPacks[0].modules.length, 3);
    assert.equal(initial.goals[0].examDate, undefined); assert.ok(initial.milestones.every(m => m.status === 'planned' && !m.targetDate));
    const phase = { ...initial.milestones[0], status: 'completed' as const, description: 'My own completion note', targetDate: '2026-10-15' };
    f.store.saveMilestone(phase); f.store.addStudyModule(pack.id, pack.modules[0].id); f.store.addStudyModule(pack.id, pack.modules[0].id);
    f.store.importStudyPack(pack);
    const data = f.store.library(); assert.equal(data.milestones.length, 7); assert.equal(data.resources.length, 4);
    assert.equal(data.milestones.find(m => m.id === phase.id)!.description, 'My own completion note');
    assert.equal(data.milestones.find(m => m.id === phase.id)!.status, 'completed');
    for (const m of [...pack.milestones, ...pack.modules]) for (const ref of m.resourceRefs || []) assert.ok(documentHeadings(pack.resources.find(r => r.id === ref.resourceId)!.markdown).some(h => h.id === ref.headingId));
  } finally { f.cleanup(); }
});
test('bad checksums, broken references, or conflicting exam revisions leave the existing library intact', () => {
  const f = fixture();
  try {
    f.store.importStudyPack(pack); const before = f.store.exportData();
    const bad = structuredClone(pack); bad.resources[0].markdown += '\nChanged';
    assert.throws(() => f.store.importStudyPack(bad), /checksum/);
    const conflicting = structuredClone(pack); conflicting.exams[0].questions[0].prompt += '?';
    assert.throws(() => f.store.importStudyPack(conflicting), /revision/);
    const broken = structuredClone(pack); broken.milestones[0].resourceRefs![0].headingId = 'missing';
    assert.throws(() => f.store.importStudyPack(broken), /unknown heading/);
    assert.deepEqual(f.store.exportData().exams, before.exams); assert.deepEqual(f.store.exportData().resources, before.resources);
  } finally { f.cleanup(); }
});
test('confidence and familiarity survive save/reopen; exclusions do not change original answers or candidate export', () => {
  const f = fixture(); f.store.importStudyPack(pack);
  const a = f.store.start(exam, { shuffleQuestions: false, shuffleOptions: true });
  assert.deepEqual(a.optionOrder['S1-01'], ['A','B','C','D','E','F']);
  a.responses['S1-01'] = { selected: ['A'], eliminated: [], flagged: true, note: 'Check denominator interpretation.', revealed: false, confidence: 'K', familiar: false };
  a.responses['S1-02'] = { selected: ['C'], eliminated: [], flagged: false, note: '', revealed: false, confidence: 'R', familiar: true };
  a.outsideHelp = 'No reference material used.'; a.status = 'submitted'; a.submittedAt = new Date().toISOString(); f.store.saveAttempt(a);
  f.store.saveAttemptReview({ attemptId: a.id, excludedQuestionIds: ['S1-01'], note: 'Needs review' });
  const text = f.store.exportAttempt(a.id);
  assert.match(text, /\*\*Your answer:\*\* A  \*\*Confidence \(K\/R\/G\):\*\* K  \*\*Familiar \(Yes\/No\):\*\* No/);
  assert.ok(text.includes('No reference material used.')); assert.equal(text.includes('**Correct answer:'), false);
  assert.equal((text.match(/^### S/gm) || []).length, 4);
  assert.equal(score(a).passed, false); assert.equal(score(a, ['S1-01']).total, 3);
  const rows = diagnosticRows(a); assert.equal(rows[0].wrongK, 1); assert.equal(rows[0].uncertainCorrect, 1); assert.equal(rows[0].familiar, 1);
  f.store.close(); const reopened = new StudyStore(f.dir);
  try { const saved = reopened.library().attempts[0]; assert.equal(saved.responses['S1-01'].confidence, 'K'); assert.equal(saved.responses['S1-01'].familiar, false); assert.equal(candidateMarkdown(saved), text); assert.deepEqual(reopened.library().attemptReviews[0].excludedQuestionIds, ['S1-01']); }
  finally { reopened.close(); rmSync(f.dir, { recursive: true, force: true }); }
});
test('version-three backups preserve full documents, modules, diagnostic annotations, and exclusions', () => {
  const f = fixture();
  try {
    f.store.importStudyPack(pack); const a = f.store.start(exam, { shuffleQuestions: false, shuffleOptions: false });
    a.status = 'submitted'; a.submittedAt = new Date().toISOString(); f.store.saveAttempt(a);
    f.store.saveAttemptReview({ attemptId: a.id, excludedQuestionIds: ['S1-01'], note: 'Check' });
    const backup = f.store.exportData(); assert.equal(backup.version, 3);
    f.store.restore(backup); assert.deepEqual(f.store.library().resources, backup.resources); assert.deepEqual(f.store.library().attemptReviews, backup.attemptReviews);
    assert.equal(f.store.library().studyPacks[0].modules.length, 3);
    f.store.restore({ ...backup, version: 2 }); assert.equal(f.store.library().resources.length, 0); assert.equal(f.store.library().goals.length, 1);
  } finally { f.cleanup(); }
});
