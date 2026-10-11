import { _electron as electron } from 'playwright';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
const directory = await mkdtemp(path.join(tmpdir(), 'recall-native-templates-'));
let app, child;
try {
  app = await electron.launch({ ...(process.env.RECALL_EXECUTABLE ? { executablePath: process.env.RECALL_EXECUTABLE } : {}), args: [...(process.env.RECALL_EXECUTABLE ? [] : ['.']), '--ozone-platform=x11'], env: { ...process.env, RECALL_TEST: '1', RECALL_DATA_DIR: directory } });
  child = app.process(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  const page = await app.firstWindow(); page.setDefaultTimeout(15000);
  await page.getByRole('heading', { name: 'Exams', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Study templates', exact: true }).click(); await page.getByLabel('Study title', { exact: true }).fill('Native study starter');
  const file = path.join(directory, 'starter.study-pack.json');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, file);
  await page.getByRole('button', { name: 'Download starter pack', exact: true }).click(); await page.getByText('Starter study pack exported. Import it from the exam library when ready.', { exact: true }).waitFor();
  const pack = JSON.parse(await readFile(file, 'utf8')); assert.equal(pack.milestones.length, 6); assert.equal(pack.resources.length, 4);
  const archive = path.join(directory, 'authoring.zip');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, archive);
  await page.getByRole('button', { name: 'Download editable project', exact: true }).click(); await page.getByText('Editable authoring project exported.', { exact: true }).waitFor();
  const zip = unzipSync(new Uint8Array(await readFile(archive))); assert.equal(JSON.parse(strFromU8(zip['project.json'])).kind, 'salesforce');
  const exited = new Promise(resolve => child.once('exit', resolve)); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  let timer; try { await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Close timed out')), 10000); })]); } finally { clearTimeout(timer); }
  console.log('PASS: desktop template view, native save dialogs, valid study pack, editable ZIP, and clean close.');
} finally {
  if (child?.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await exited; }
  await rm(directory, { recursive: true, force: true });
}
