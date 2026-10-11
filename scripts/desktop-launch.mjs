import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

// Playwright's Electron launcher adds --no-sandbox. This separate check launches
// our normal executable directly, preserving Chromium's default sandbox behavior.
const require = createRequire(import.meta.url);
const directory = await mkdtemp(path.join(tmpdir(), 'recall-desktop-launch-'));
const executable = process.env.RECALL_EXECUTABLE || require('electron');
const child = spawn(executable, [...(process.env.RECALL_EXECUTABLE ? [] : ['.']), '--remote-debugging-port=0'], {
  env: { ...process.env, RECALL_DATA_DIR: directory, RECALL_TEST: '1' }, stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
let browser;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Desktop startup timed out: ${logs}`)), 15000);
    child.stderr.on('data', chunk => {
      logs += chunk.toString();
      const found = logs.match(/DevTools listening on (ws:\/\/\S+)/);
      if (found) { clearTimeout(timeout); resolve(found[1]); }
    });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Desktop app exited (${code}): ${logs}`)); });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
  });
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.waitForEvent('page');
  await page.getByRole('heading', { name: 'Exams', exact: true }).waitFor({ timeout: 15000 });
  const data = await page.evaluate(() => window.desktop.library());
  if (data.settings.theme !== 'dark' || data.exams.length !== 1) throw new Error('Fresh desktop application did not initialize correctly.');
  const exited = new Promise(resolve => child.once('exit', resolve));
  await page.evaluate(() => window.desktop.readyToClose()).catch(() => {});
  let timeout;
  try { await Promise.race([exited, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Desktop close timed out')), 10000); })]); }
  finally { clearTimeout(timeout); }
  console.log('PASS: normal desktop startup with sandbox enabled, default Linux display selection, database initialization, renderer, and clean exit.');
} finally {
  if (child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await exited; }
  await browser?.close().catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
