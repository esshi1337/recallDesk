import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const data = await mkdtemp(path.join(tmpdir(), 'recall-desktop-'));
const artifacts = path.resolve('test-artifacts');
await mkdir(artifacts, { recursive: true });
const errors = [];
let app;
let child;
async function launch() {
  app = await electron.launch({ ...(process.env.RECALL_EXECUTABLE ? { executablePath: process.env.RECALL_EXECUTABLE } : {}), args: [...(process.env.RECALL_EXECUTABLE ? [] : ['.']), '--ozone-platform=x11'], env: { ...process.env, RECALL_DATA_DIR: data, RECALL_TEST: '1' } });
  child = app.process();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(String(error)));
  await page.locator('[data-save-state="saved"]').waitFor();
  return page;
}
async function saved(page) { await page.locator('[data-save-state="saved"]').waitFor(); }
async function close(page) {
  const exited = new Promise(resolve => child.once('exit', resolve));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  let timeout;
  try { await Promise.race([exited, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Close did not flush and exit')), 10000); })]); }
  finally { clearTimeout(timeout); }
  app = null;
}
try {
  let page = await launch();
  await page.getByRole('heading', { name: 'Exams', exact: true }).waitFor();
  console.log('Desktop started; exercising student workflow.');
  await page.screenshot({ path: path.join(artifacts, 'library.png') });
  // The application must never need a network request to render or persist data.
  const external = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await page.getByRole('button', { name: 'Start test', exact: true }).click();
  await page.getByRole('button', { name: 'Start student session' }).click();
  await page.getByRole('button', { name: 'Option A: DNS', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminate option B' }).click();
  await page.getByRole('button', { name: 'Flag for review', exact: true }).click();
  await page.getByRole('textbox', { name: 'Scratch notes for this attempt' }).fill('Persist this reasoning through a real restart.');
  assert.equal(await page.getByText('Explanation', { exact: true }).count(), 0);
  assert.equal(await page.getByText('The Domain Name System provides records used to resolve names to IP addresses.', { exact: true }).count(), 0);
  await saved(page);
  await page.screenshot({ path: path.join(artifacts, 'student.png') });
  await close(page);
  console.log('First close flushed; reopening saved progress.');
  page = await launch();
  await page.getByText('Session paused', { exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Scratch notes for this attempt' }).inputValue(), 'Persist this reasoning through a real restart.');
  assert.equal(await page.getByRole('button', { name: 'Option A: DNS', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Restore option B' }).waitFor();
  await page.getByRole('button', { name: 'Flagged', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Next question' }).click();
  await page.getByRole('button', { name: 'Option A: An atomic transaction', exact: true }).click();
  await page.getByRole('button', { name: 'Next question' }).click();
  await page.getByRole('button', { name: 'Option A:', exact: false }).click();
  await page.getByRole('button', { name: 'Option B:', exact: false }).click();
  await page.getByRole('button', { name: 'Reveal answer & explanation' }).click();
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  await page.getByRole('heading', { name: 'Explanation' }).waitFor();
  await page.getByRole('button', { name: 'Finish & evaluate' }).click();
  await page.getByRole('button', { name: 'Submit & evaluate' }).click();
  await page.getByText('3 of 6 correct', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Reusable study notes' }).fill('JSON requires double-quoted keys.');
  await saved(page);
  await page.locator('.question-scroll').evaluate(el => el.scrollTo(0, 0));
  await page.screenshot({ path: path.join(artifacts, 'evaluate.png') });
  const backup = await page.evaluate(() => window.desktop.backup());
  const snapshot = JSON.parse(await readFile(backup, 'utf8'));
  assert.equal(snapshot.attempts[0].status, 'submitted');
  assert.equal(snapshot.attempts[0].responses.json.revealed, true);
  assert.equal(snapshot.notes['["computer-fundamentals-sample","json"]'], 'JSON requires double-quoted keys.');
  await page.getByRole('button', { name: 'Practice missed', exact: true }).click();
  await page.getByRole('button', { name: 'Start student session' }).click();
  await page.getByText('QUESTION 1 OF 3', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('light');
  await saved(page);
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
  await saved(page);
  await page.waitForFunction(() => { const el = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Back up now'); return el && getComputedStyle(el).backgroundColor === 'rgb(13, 13, 13)'; });
  await page.screenshot({ path: path.join(artifacts, 'settings-dark.png'), animations: 'disabled' });
  // Exercise real import/export/restore handlers with deterministic native-dialog choices.
  const backupFile = path.join(data, 'exported-backup.json');
  const examFile = path.join(data, 'new-exam.json');
  const exportExamFile = path.join(data, 'exported-exam.json');
  const newExam = JSON.parse(await readFile('examples/exam-template.json', 'utf8'));
  await writeFile(examFile, JSON.stringify(newExam));
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, backupFile);
  await page.getByRole('button', { name: 'Export complete backup', exact: true }).click();
  await page.getByText('Complete backup exported.', { exact: true }).waitFor();
  assert.equal(JSON.parse(await readFile(backupFile, 'utf8')).attempts.length, 2);
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, examFile);
  await page.getByRole('button', { name: 'Exam library', exact: false }).click();
  await page.getByRole('button', { name: 'Import exam', exact: true }).click();
  await page.getByRole('heading', { name: 'My practice exam', exact: true }).waitFor();
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, exportExamFile);
  await page.getByRole('button', { name: 'Export My practice exam', exact: true }).click();
  await page.getByText('Exam exported.', { exact: true }).waitFor();
  assert.equal(JSON.parse(await readFile(exportExamFile, 'utf8')).questions[0].correctOptionIds[0], 'option-one');
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); }, backupFile);
  await page.getByRole('button', { name: 'Restore backup', exact: true }).click();
  await page.getByText('Backup restored.', { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.desktop.library())).exams.length, 1);
  await close(page);
  page = await launch();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.getByText('QUESTION 1 OF 3', { exact: true }).waitFor();
  // An accelerated timer checks expiry, pause, and continuing untimed.
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.evaluate(async () => { const data = await window.desktop.library(); await window.desktop.start(data.exams[0], { shuffleQuestions: false, shuffleOptions: false, minutes: 1 / 60 }); });
  await page.reload();
  await page.getByText('Session paused', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('heading', { name: 'Your practice time is up' }).waitFor();
  await page.getByRole('button', { name: 'Continue untimed', exact: true }).click();
  await page.getByRole('button', { name: 'Pause session', exact: true }).waitFor();
  await close(page);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log('PASS: real Electron launch, student answer isolation, multi-select grading, notes/flags/elimination, close/restart persistence, submission, reveal tracking, exam import/export, complete backup/restore, missed-question retry, timer expiry, preferences, offline operation.');
  console.log(`Screenshots: ${artifacts}`);
} finally {
  if (child?.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGKILL');
    await exited;
  }
  await rm(data, { recursive: true, force: true });
}
