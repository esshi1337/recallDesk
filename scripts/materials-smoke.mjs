import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const directory = await mkdtemp(path.join(tmpdir(), 'recall-materials-ui-'));
const artifacts = path.resolve('test-artifacts'); await mkdir(artifacts, { recursive: true });
const packPath = path.resolve('examples/arithmetic.study-pack.json');
const pack = JSON.parse(await readFile(packPath, 'utf8'));
const inbox = path.join(directory, 'study-data', 'import-inbox'); await mkdir(inbox, { recursive: true }); await writeFile(path.join(inbox, 'sample.study-pack.json'), JSON.stringify(pack));
let app, child; const errors = [];
async function launch() {
  app = await electron.launch({ ...(process.env.RECALL_EXECUTABLE ? { executablePath: process.env.RECALL_EXECUTABLE } : {}), args: [...(process.env.RECALL_EXECUTABLE ? [] : ['.']), '--ozone-platform=x11'], env: { ...process.env, TZ: 'America/Mexico_City', RECALL_DATA_DIR: directory, RECALL_TEST: '1' } });
  child = app.process(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  const page = await app.firstWindow(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e)));
  await page.locator('[data-save-state="saved"]').waitFor(); return page;
}
async function close() {
  const exited = new Promise(resolve => child.once('exit', resolve)); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  let timer; try { await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Close timed out')), 10000); })]); } finally { clearTimeout(timer); }
}
try {
  let page = await launch();
  let data = await page.evaluate(() => window.desktop.library());
  assert.equal(data.resources.length, 4); assert.equal(data.milestones.length, 6); assert.equal(data.manualActivities.length, 0);
  const card = page.locator('.exam-row').filter({ has: page.getByRole('heading', { name: pack.exams[0].title, exact: true }) });
  await card.getByRole('button', { name: 'Start test', exact: true }).click();
  await page.getByLabel('Outside help or prior study (optional)', { exact: true }).fill('No reference material used.');
  await page.getByRole('button', { name: 'Start student session', exact: true }).click();
  assert.equal(await page.getByRole('heading', { name: 'Explanation', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Option A: 36', exact: true }).click();
  await page.getByRole('combobox', { name: 'Confidence', exact: true }).selectOption('K');
  await page.getByRole('combobox', { name: 'Familiarity', exact: true }).selectOption('no');
  await page.getByRole('textbox', { name: 'Scratch notes for this attempt' }).fill('Check denominator interpretation.');
  await page.screenshot({ path: path.join(artifacts, 'materials-student.png'), animations: 'disabled' });
  await close();
  page = await launch();
  await page.getByText('Session paused', { exact: true }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'Confidence', exact: true }).inputValue(), 'K');
  assert.equal(await page.getByRole('combobox', { name: 'Familiarity', exact: true }).inputValue(), 'no');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('combobox', { name: 'Jump to section', exact: true }).selectOption('2. Patterns');
  await page.getByText('S2-01', { exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Jump to section', exact: true }).selectOption('1. Arithmetic');
  await page.getByRole('button', { name: 'Next question', exact: true }).click();
  await page.getByRole('button', { name: 'Option C: 15', exact: true }).click();
  await page.getByRole('combobox', { name: 'Confidence', exact: true }).selectOption('R');
  await page.getByRole('combobox', { name: 'Familiarity', exact: true }).selectOption('yes');
  await page.getByRole('button', { name: 'Finish & evaluate', exact: true }).click();
  await page.getByRole('button', { name: 'Submit & evaluate', exact: true }).click();
  await page.getByText('Diagnostic · no pass target', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Exclude this item from diagnostic totals while reviewing', exact: true }).check();
  await page.getByText('1 of 3 correct', { exact: true }).waitFor();
  await page.getByText('Diagnostic breakdown · confidence and familiarity', { exact: true }).click();
  const exported = path.join(directory, 'filled-candidate.md');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, exported);
  await page.getByRole('button', { name: 'Export candidate', exact: true }).click();
  await page.getByText('Candidate answers exported.', { exact: true }).waitFor();
  const text = await readFile(exported, 'utf8'); assert.ok(text.includes('**Confidence (K/R/G):** K')); assert.equal(text.includes('**Correct answer:'), false);
  assert.equal((text.match(/^### S/gm) || []).length, 4);
  await page.getByRole('button', { name: 'Study materials', exact: true }).click();
  await page.locator('.material-document').getByRole('button', { name: 'Open the guide', exact: true }).first().click();
  await page.locator('.material-document').getByRole('heading', { name: /Arithmetic sample — Study guide/ }).waitFor();
  await page.locator('button.inline-reference[title$="missing-worksheet.pdf"]').first().click();
  await page.getByText(/Referenced file is not included: missing-worksheet/).waitFor();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await page.getByRole('button', { name: 'Optional modules (3)', exact: true }).click();
  await page.locator('.module-list article').first().getByRole('button', { name: 'Add to timeline', exact: true }).click();
  await page.locator('.module-list article').first().getByRole('button', { name: 'Added to timeline', exact: true }).waitFor();
  await page.locator('.module-list article').first().getByRole('button', { name: /Concepts and distinctions/ }).click();
  const heading = page.locator('.material-document').getByRole('heading', { name: /Concepts and distinctions/ });
  await heading.waitFor();
  assert.ok(await heading.evaluate(el => { const reader = el.closest('.material-document'); const top = el.getBoundingClientRect().top; return top >= reader.getBoundingClientRect().top && top < reader.getBoundingClientRect().bottom; }));
  await page.screenshot({ path: path.join(artifacts, 'materials-guide.png'), animations: 'disabled' });
  await page.locator('.materials-nav > button').filter({ hasText: 'Answer key' }).click();
  await page.getByRole('button', { name: 'Open answer key', exact: true }).waitFor();
  assert.equal(await page.locator('.material-document').getByText('Correct answer: D', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await page.getByRole('combobox', { name: 'Study goal', exact: true }).selectOption(pack.goal.id);
  await page.getByText('0/7 milestones complete', { exact: true }).waitFor();
  data = await page.evaluate(() => window.desktop.library()); assert.equal(data.milestones.length, 7); assert.equal(data.attemptReviews[0].excludedQuestionIds[0], 'S1-01');
  const backupFile = await page.evaluate(() => window.desktop.backup());
  const backup = JSON.parse(await readFile(backupFile, 'utf8')); assert.equal(backup.version, 3); assert.equal(backup.resources.length, 4);
  await close(); page = await launch(); data = await page.evaluate(() => window.desktop.library());
  assert.equal(data.resources.length, 4); assert.equal(data.milestones.length, 7); assert.equal(data.attempts[0].responses['S1-02'].confidence, 'R');
  assert.equal(data.attempts[0].responses['S1-02'].familiar, true);
  await close(); assert.deepEqual(errors, []);
  console.log('PASS: automatic pack import, sample baseline, confidence/familiarity and restart, section navigation, answer isolation, diagnostic exclusion, candidate export, local guide links, missing-file handling, optional module activation, source-key guard, v3 backup and persistence.');
} finally {
  if (child?.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await exited; }
  await rm(directory, { recursive: true, force: true });
}
