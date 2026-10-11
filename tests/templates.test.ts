import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { createStarter, buildAuthoringProject, templateDownload } from '../shared/templates';
import { StudyPackSchema } from '../shared/study-pack';
import { StudyStore } from '../electron/store';
import { BrowserStore } from '../browser/store';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
for (const kind of ['salesforce', 'recall-desk'] as const) test(`${kind} starter builds consistent documents, roadmap references, and an editable ZIP`, async () => {
  const project = createStarter(kind, `test-${kind}`, `${kind} starter`);
  const { pack, documents } = await buildAuthoringProject(project, hash);
  assert.equal(pack.milestones.length, 6); assert.equal(pack.modules.length, 3); assert.equal(pack.resources.length, 4);
  assert.equal(pack.exams[0].diagnostic, true); assert.equal(pack.exams[0].timeLimitMinutes, undefined);
  assert.ok(pack.milestones.every(m => !m.targetDate && m.status === 'planned'));
  for (const r of pack.resources) assert.equal(r.sha256, hash(r.markdown));
  for (const q of project.exam.questions) { assert.ok(documents.candidate.includes(q.prompt)); assert.ok(documents['answer-key'].includes(q.prompt)); }
  assert.equal(documents.candidate.includes('**Correct answer'), false);
  assert.ok(documents['answer-key'].includes('**Correct answer:** A'));
  const result = await templateDownload({ kind, id: project.config.id, title: project.config.title, output: 'source' }, hash);
  assert.ok(result.data instanceof Uint8Array);
  const zip = unzipSync(result.data as Uint8Array);
  for (const name of ['project.json', 'exam.json', 'guide.md', 'roadmap.md', 'candidate.md', 'answer-key.md', 'README.md']) assert.ok(zip[name]);
  StudyPackSchema.parse(JSON.parse(strFromU8(zip[`${project.config.id}.study-pack.json`])));
  project.config.modules[0].references[0].heading = 'Missing heading';
  await assert.rejects(() => buildAuthoringProject(project, hash), /Unknown guide heading/);
});
test('browser and SQLite services accept the same pack and preserve grading, sessions, reviews, and portable backups', async () => {
  const { pack } = await buildAuthoringProject(createStarter('salesforce', 'portable-example', 'Portable example'), hash);
  const hashes = new Map(pack.resources.map(r => [r.markdown, hash(r.markdown)]));
  const browser = new BrowserStore([], [], hashes, 'http://localhost', () => '2026-10-10T17:00:00.000Z', randomUUID);
  browser.importStudyPack(pack); browser.addStudyModule(pack.id, pack.modules[0].id);
  const attempt = browser.start(pack.exams[0], { shuffleQuestions: false, shuffleOptions: false });
  attempt.responses['TEMPLATE-01'] = { ...attempt.responses['TEMPLATE-01'], selected: ['replace'], note: 'portable note', confidence: 'K', familiar: false };
  attempt.status = 'submitted'; attempt.submittedAt = '2026-10-10T17:01:00.000Z'; attempt.elapsedSeconds = 60; browser.saveAttempt(attempt);
  browser.saveAttemptReview({ attemptId: attempt.id, excludedQuestionIds: [], note: 'review' });
  const dir = mkdtempSync(path.join(tmpdir(), 'recall-portable-')); const desktop = new StudyStore(dir);
  try {
    desktop.restore(browser.exportData());
    assert.deepEqual(desktop.library().attempts, browser.library().attempts);
    assert.deepEqual(desktop.library().resources, browser.library().resources);
    assert.deepEqual(desktop.library().studySessions, browser.library().studySessions);
    const second = new BrowserStore([], [], hashes, 'http://localhost'); second.restore(desktop.exportData());
    assert.deepEqual(second.library().attemptReviews, browser.library().attemptReviews);
    assert.equal(second.library().milestones.length, 7);
    const prior = second.checkpoint(); second.saveNote('temporary', 'not committed'); prior();
    assert.equal(second.library().notes.temporary, undefined);
  } finally { desktop.close(); rmSync(dir, { recursive: true, force: true }); }
});
