import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const directory = await mkdtemp(path.join(tmpdir(), 'recall-timeline-ui-'));
const artifacts = path.resolve('test-artifacts'); await mkdir(artifacts, { recursive: true });
let app, child; const errors = [];
async function launch() {
  app = await electron.launch({ ...(process.env.RECALL_EXECUTABLE ? { executablePath: process.env.RECALL_EXECUTABLE } : {}), args: [...(process.env.RECALL_EXECUTABLE ? [] : ['.']), '--ozone-platform=x11'], env: { ...process.env, TZ: 'America/Mexico_City', RECALL_DATA_DIR: directory, RECALL_TEST: '1' } });
  child = app.process(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  const page = await app.firstWindow(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(String(e)));
  await page.getByRole('heading', { name: 'Exams', exact: true }).waitFor(); return page;
}
async function close() {
  const exited = new Promise(resolve => child.once('exit', resolve));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  let timer; try { await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Close timed out')), 10000); })]); } finally { clearTimeout(timer); }
}
try {
  let page = await launch();
  assert.equal(await page.getByText('Saved locally', { exact: true }).count(), 0);
  assert.equal(await page.locator('.sidebar-bottom').count(), 0);
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  const plus = days => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); };
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await page.getByRole('button', { name: 'Create goal', exact: true }).click();
  await page.getByLabel('Goal name', { exact: true }).fill('Certification study');
  await page.getByRole('checkbox', { name: 'Computer fundamentals', exact: true }).check();
  await page.getByLabel('Exam date (optional)', { exact: true }).fill(plus(20));
  await page.getByRole('button', { name: 'Save goal', exact: true }).click();
  await page.getByText('0/0 milestones complete', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add milestone', exact: true }).click();
  await page.getByLabel('Outcome', { exact: true }).fill('Review networking');
  await page.getByLabel('Target date (optional)', { exact: true }).fill(plus(5));
  await page.getByLabel('Minimum score (%)', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Save milestone', exact: true }).click();
  await page.getByText('0/1 milestones complete', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add milestone', exact: true }).click();
  await page.getByLabel('Outcome', { exact: true }).fill('Complete a lab');
  await page.getByRole('button', { name: 'Save milestone', exact: true }).click();
  await page.getByText('0/2 milestones complete', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Move Complete a lab up', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.tl-milestones li strong')?.textContent === 'Complete a lab');
  await page.getByRole('button', { name: 'Log activity', exact: true }).click();
  await page.getByLabel('Activity title', { exact: true }).fill('Trailhead sharing module');
  await page.getByLabel('Minutes (optional)', { exact: true }).fill('25');
  await page.getByLabel('Notes', { exact: true }).fill('Worked through record access examples.');
  await page.getByRole('button', { name: 'Save activity', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Review networking', exact: true }).check();
  await page.waitForFunction(async () => (await window.desktop.library()).evidenceLinks.length === 1);
  await page.getByRole('button', { name: 'Exam library', exact: false }).click();
  await page.getByRole('button', { name: 'Start test', exact: true }).click();
  await page.getByRole('button', { name: 'Start student session', exact: true }).click();
  await page.getByRole('button', { name: 'Option A: DNS', exact: true }).click();
  await page.getByRole('button', { name: 'Pause session', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Finish & evaluate', exact: true }).click();
  await page.getByRole('button', { name: 'Submit & evaluate', exact: true }).click();
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await page.locator('.tl-event-list button').filter({ hasText: '1/6' }).click();
  await page.getByRole('checkbox', { name: 'Review networking', exact: true }).check();
  await page.waitForFunction(async () => (await window.desktop.library()).evidenceLinks.length === 2);
  await page.locator('.tl-milestone-select').filter({ hasText: 'Review networking' }).click();
  await page.getByText('Score target met. Completion is still your decision.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Mark complete', exact: true }).click();
  await page.getByText('1/2 milestones complete', { exact: true }).waitFor();
  const before = await page.evaluate(() => window.desktop.library());
  const completedAt = before.milestones.find(m => m.title === 'Review networking').completedAt;
  assert.equal(before.studySessions.length, 2);
  await page.getByRole('button', { name: 'Edit milestone', exact: true }).click();
  await page.getByLabel('Target date (optional)', { exact: true }).fill(plus(10));
  await page.getByRole('button', { name: 'Save milestone', exact: true }).click();
  await page.getByRole('combobox', { name: 'Timeline range', exact: true }).selectOption('all');
  await page.screenshot({ path: path.join(artifacts, 'timeline.png'), animations: 'disabled' });
  const backupPath = await page.evaluate(() => window.desktop.backup());
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  assert.equal(backup.version, 3); assert.equal(backup.goals.length, 1); assert.equal(backup.manualActivities[0].date, today);
  assert.equal(backup.milestones.find(m => m.title === 'Review networking').completedAt, completedAt);
  assert.equal(backup.studySessions.length, 2); assert.equal(backup.evidenceLinks.length, 2);
  await close();
  page = await launch();
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await page.getByText('1/2 milestones complete', { exact: true }).waitFor();
  await page.locator('.tl-event-list button').filter({ hasText: 'Trailhead sharing module' }).click();
  assert.equal(await page.getByRole('checkbox', { name: 'Review networking', exact: true }).isChecked(), true);
  await close();
  assert.deepEqual(errors, []);
  console.log('PASS: timeline goal/milestone forms, optional dates, manual ordering, manual activity, automatic sessions, evidence links, score-target suggestion, manual completion, rescheduling preserves history, complete backup, and real restart persistence.');
  console.log(`Timeline screenshot: ${path.join(artifacts, 'timeline.png')}`);
} finally {
  if (child?.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await exited; }
  await rm(directory, { recursive: true, force: true });
}
