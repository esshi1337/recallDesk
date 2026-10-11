import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { StudyStore } from '../electron/store.ts';
const temporary = await mkdtemp(path.join(tmpdir(), 'recall-browser-'));
const artifacts = path.resolve('test-artifacts'); await mkdir(artifacts, { recursive: true });
const server = spawn(process.execPath, ['scripts/serve-browser.mjs'], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
const url = await new Promise((resolve, reject) => { let timer = setTimeout(() => reject(new Error('Static server did not start')), 10000); server.stdout.on('data', b => { const match = b.toString().match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } }); server.once('error', reject); server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}`)); }); });
let context; const errors = [], outbound = [];
async function launch() {
  context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), { ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true, viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  const page = context.pages()[0]; page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => { if (r.url().startsWith('http') && !r.url().startsWith(url)) outbound.push(r.url()); });
  await page.goto(url); await page.getByRole('heading', { name: 'Exams', exact: true }).waitFor(); return page;
}
async function chooseFile(page, button, file) { const chooser = page.waitForEvent('filechooser'); await button.click(); await (await chooser).setFiles(file); }
async function saved(page) { await page.locator('[data-save-state="saved"]').waitFor(); }
try {
  let page = await launch();
  await page.getByRole('button', { name: 'Start test', exact: true }).click(); await page.getByRole('button', { name: 'Start student session' }).click();
  await page.getByRole('button', { name: 'Option A: DNS', exact: true }).click(); await page.getByRole('button', { name: 'Flag for review', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminate option B' }).click(); await page.getByRole('textbox', { name: 'Scratch notes for this attempt' }).fill('Browser persistence check.'); await saved(page);
  await page.reload(); await page.getByText('Session paused', { exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Scratch notes for this attempt' }).inputValue(), 'Browser persistence check.');
  assert.equal(await page.getByRole('button', { name: 'Option A: DNS', exact: true }).getAttribute('aria-pressed'), 'true'); await page.getByRole('button', { name: 'Restore option B' }).waitFor();
  const other = await context.newPage(); await other.goto(url); await other.getByText(/already open in another tab/).waitFor(); await other.close(); await page.bringToFront();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  // A failed IndexedDB commit must not report success or mutate the service's committed state.
  await page.evaluate(() => { const original = IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction = function(...args) { if (args[1] === 'readwrite') { IDBDatabase.prototype.transaction = original; throw new DOMException('Simulated storage failure', 'QuotaExceededError'); } return original.apply(this, args); }; });
  await page.getByRole('textbox', { name: 'Scratch notes for this attempt' }).fill('Recovered after failed write.');
  await page.getByText('Your latest changes are still in memory.', { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.recallDesk.library())).attempts[0].responses.dns.note, 'Browser persistence check.');
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click(); await saved(page);
  assert.equal((await page.evaluate(() => window.recallDesk.library())).attempts[0].responses.dns.note, 'Recovered after failed write.');
  await page.getByRole('button', { name: 'Finish & evaluate' }).click(); await page.getByRole('button', { name: 'Submit & evaluate' }).click();
  await page.getByRole('button', { name: 'Study templates', exact: true }).click();
  await page.getByLabel('Study title', { exact: true }).fill('Browser Salesforce starter');
  const sourceDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download editable project', exact: true }).click(); const source = await sourceDownload;
  const zip = unzipSync(new Uint8Array(await readFile(await source.path()))); assert.equal(JSON.parse(strFromU8(zip['project.json'])).kind, 'salesforce'); assert.ok(zip['guide.md']);
  const packDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download starter pack', exact: true }).click(); const starter = await packDownload; const starterPath = path.join(temporary, starter.suggestedFilename()); await starter.saveAs(starterPath);
  await page.screenshot({ path: path.join(artifacts, 'browser-templates.png') });
  await page.getByRole('button', { name: 'Exam library', exact: false }).click();
  await chooseFile(page, page.getByRole('button', { name: 'Import study pack', exact: true }), starterPath);
  await page.getByRole('heading', { name: 'Browser Salesforce starter — starter demonstration', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Timeline', exact: true }).click(); await page.getByRole('button', { name: 'Add milestone', exact: true }).click();
  await page.getByLabel('Outcome', { exact: true }).fill('Review a topic'); await page.getByRole('button', { name: 'Save milestone', exact: true }).click(); await page.getByText('0/7 milestones complete', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Log activity', exact: true }).click(); await page.getByLabel('Activity title', { exact: true }).fill('Read the source'); await page.getByRole('button', { name: 'Save activity', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Review a topic', exact: true }).check();
  await page.waitForFunction(async () => (await window.recallDesk.library()).evidenceLinks.length === 1);
  const desktopDir = path.join(temporary, 'desktop'); const desktop = new StudyStore(desktopDir);
  const samplePack = JSON.parse(await readFile('examples/arithmetic.study-pack.json', 'utf8')); desktop.importStudyPack(samplePack);
  const attempt = desktop.start(samplePack.exams[0], { shuffleQuestions: false, shuffleOptions: false });
  attempt.responses['S1-01'] = { ...attempt.responses['S1-01'], selected: ['D'], confidence: 'K', familiar: false, note: 'From the desktop fixture.' }; attempt.status = 'submitted'; attempt.submittedAt = new Date().toISOString(); desktop.saveAttempt(attempt);
  const desktopBackup = path.join(temporary, 'desktop-backup.json'); desktop.writeExport(desktopBackup); desktop.close();
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click(); assert.equal(await page.getByRole('button', { name: 'Open data folder', exact: true }).count(), 0);
  page.once('dialog', dialog => dialog.accept()); await chooseFile(page, page.getByRole('button', { name: 'Restore backup', exact: true }), desktopBackup); await page.getByText('Backup restored.', { exact: true }).waitFor();
  const restored = await page.evaluate(() => window.recallDesk.library()); assert.equal(restored.resources.length, 4); assert.equal(restored.attempts[0].responses['S1-01'].confidence, 'K');
  const exportDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export complete backup', exact: true }).click(); const exported = await exportDownload;
  const roundTrip = new StudyStore(path.join(temporary, 'round-trip')); roundTrip.restore(JSON.parse(await readFile(await exported.path(), 'utf8'))); assert.equal(roundTrip.library().attempts[0].responses['S1-01'].note, 'From the desktop fixture.'); roundTrip.close();
  await page.getByRole('button', { name: 'Refresh list', exact: true }).click(); const snapshots = await page.evaluate(() => window.recallDesk.listLocalBackups()); const recovery = snapshots.find(id => id.includes('before-restore')); assert.ok(recovery);
  await page.getByRole('combobox', { name: 'Browser recovery snapshot', exact: true }).selectOption(recovery); page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Restore saved snapshot', exact: true }).click(); await page.getByText('Browser snapshot restored.', { exact: true }).waitFor();
  assert.ok((await page.evaluate(() => window.recallDesk.library())).milestones.some(m => m.title === 'Review a topic'));
  await page.getByRole('button', { name: 'Study materials', exact: true }).click(); await page.locator('.material-document').getByRole('heading', { name: /Adaptive roadmap/ }).waitFor();
  await page.screenshot({ path: path.join(artifacts, 'browser-materials.png') });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })); });
  await context.setOffline(true); await page.reload(); await page.getByRole('heading', { name: 'Exams', exact: true }).waitFor(); assert.ok((await page.evaluate(() => window.recallDesk.library())).milestones.some(m => m.title === 'Review a topic'));
  await context.setOffline(false); await context.close(); page = await launch();
  assert.ok((await page.evaluate(() => window.recallDesk.library())).milestones.some(m => m.title === 'Review a topic'));
  await context.close(); context = null; assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  console.log('PASS: browser IndexedDB autosave/reload, notes/flags/elimination, failed-write rollback and retry, single-tab ownership, template ZIP/pack downloads, import, timeline evidence, desktop-browser backup round trip, local recovery, offline reload, and browser-process restart.');
} finally {
  await context?.close(); server.kill('SIGTERM'); await rm(temporary, { recursive: true, force: true });
}
