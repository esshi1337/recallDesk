import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { TemplateRequestSchema, templateDownload } from '../shared/templates';
import { ExamSchema, BackupSchema, type Exam, type StartOptions } from '../shared/model';
import { StudyStore, readJson } from './store';
import sample from '../examples/computer-fundamentals.json';

app.setName('Recall Desk');
if (process.platform === 'linux') app.setDesktopName('recall-desk.desktop');
// Prefer XWayland when available: some Linux Vulkan/Wayland combinations fail before app readiness.
// An explicit --ozone-platform argument still takes precedence.
if (process.platform === 'linux' && process.env.DISPLAY && !app.commandLine.hasSwitch('ozone-platform')) app.commandLine.appendSwitch('ozone-platform', 'x11');
if (process.env.RECALL_DATA_DIR) app.setPath('userData', process.env.RECALL_DATA_DIR);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let window: BrowserWindow | null = null;
  let store: StudyStore;
  let closing = false;
  let backupTimer: NodeJS.Timeout;
  const stateFile = () => path.join(app.getPath('userData'), 'window.json');
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.focus(); });
  const handle = (name: string, fn: (...args: any[]) => any) => ipcMain.handle(name, async (_event, ...args) => {
    try { return await fn(...args); }
    catch (error) {
      if (error instanceof z.ZodError) throw new Error(error.issues.map(i => `${i.path.join('.') || 'Exam'}: ${i.message}`).slice(0, 8).join('\n'));
      throw error;
    }
  });
  app.whenReady().then(() => {
    store = new StudyStore(path.join(app.getPath('userData'), 'study-data'));
    store.seed(sample);
    store.backup('startup');
    const inbox = path.join(store.directory, 'import-inbox');
    mkdirSync(inbox, { recursive: true });
    const importErrors: string[] = [];
    for (const file of readdirSync(inbox).filter(name => name.endsWith('.study-pack.json'))) {
      try { store.importStudyPack(readJson(path.join(inbox, file))); renameSync(path.join(inbox, file), path.join(inbox, `${file}.imported`)); }
      catch (error) { importErrors.push(`${file}: ${String(error)}`); }
    }
    handle('library', () => store.library());
    handle('export-template', async value => {
      const request = TemplateRequestSchema.parse(value);
      const result = await templateDownload(request, text => createHash('sha256').update(text).digest('hex'));
      const chosen = await dialog.showSaveDialog(window!, { title: 'Save study template', defaultPath: result.name, filters: [{ name: request.output === 'pack' ? 'Recall Desk study pack' : 'Editable authoring project', extensions: [request.output === 'pack' ? 'json' : 'zip'] }] });
      if (chosen.canceled || !chosen.filePath) return false;
      writeFileSync(chosen.filePath, result.data); return true;
    });
    handle('save-attempt-review', value => store.saveAttemptReview(value));
    handle('add-study-module', (packId, moduleId) => store.addStudyModule(z.string().parse(packId), z.string().parse(moduleId)));
    handle('open-reference', async value => { const url = new URL(z.string().parse(value)); if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Only HTTP(S) references can open in a browser.'); await shell.openExternal(url.href); });
    handle('import-study-pack', async () => {
      const result = await dialog.showOpenDialog(window!, { title: 'Import study pack', filters: [{ name: 'Recall Desk study pack', extensions: ['json'] }], properties: ['openFile'] });
      return result.canceled ? null : store.importStudyPack(readJson(result.filePaths[0]));
    });
    handle('export-attempt', async id => {
      const markdown = store.exportAttempt(z.string().parse(id));
      const result = await dialog.showSaveDialog(window!, { title: 'Export completed candidate', defaultPath: 'completed-candidate.md', filters: [{ name: 'Markdown', extensions: ['md'] }] });
      if (result.canceled || !result.filePath) return false;
      writeFileSync(result.filePath, markdown); return true;
    });
    handle('save-goal', value => store.saveGoal(value));
    handle('save-milestone', value => store.saveMilestone(value));
    handle('delete-milestone', id => store.deleteMilestone(z.string().parse(id)));
    handle('reorder-milestones', (goalId, ids) => store.reorderMilestones(z.string().parse(goalId), z.array(z.string()).parse(ids)));
    handle('save-manual-activity', value => store.saveManualActivity(value));
    handle('delete-manual-activity', id => store.deleteManualActivity(z.string().parse(id)));
    handle('link-evidence', (milestoneId, eventKey, linked) => store.linkEvidence(z.string().parse(milestoneId), z.string().parse(eventKey), z.boolean().parse(linked)));
    handle('start-attempt', (exam: Exam, options: StartOptions) => store.start(exam, options));
    handle('save-attempt', a => store.saveAttempt(a));
    handle('save-note', (key, text) => store.saveNote(z.string().parse(key), z.string().parse(text)));
    handle('save-settings', settings => store.saveSettings(settings));
    handle('backup', () => store.backup('manual'));
    handle('open-data-folder', async () => { const error = await shell.openPath(store.directory); if (error) throw new Error(error); });
    handle('import-exam', async () => {
      const result = await dialog.showOpenDialog(window!, { title: 'Import an exam', filters: [{ name: 'Exam JSON', extensions: ['json'] }], properties: ['openFile'] });
      if (result.canceled) return null;
      return store.importExam(readJson(result.filePaths[0])).title;
    });
    handle('export-exam', async value => {
      const exam = ExamSchema.parse(value);
      const result = await dialog.showSaveDialog(window!, { title: 'Export exam', defaultPath: `${exam.id.replace(/[^a-z0-9_-]/gi, '-')}.json`, filters: [{ name: 'Exam JSON', extensions: ['json'] }] });
      if (result.canceled || !result.filePath) return false;
      writeFileSync(result.filePath, JSON.stringify(exam, null, 2)); return true;
    });
    handle('export-backup', async () => {
      const result = await dialog.showSaveDialog(window!, { title: 'Export complete backup', defaultPath: `recall-desk-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'Recall Desk backup', extensions: ['json'] }] });
      if (result.canceled || !result.filePath) return false;
      store.writeExport(result.filePath); return true;
    });
    handle('restore-backup', async () => {
      const result = await dialog.showOpenDialog(window!, { title: 'Restore complete backup', filters: [{ name: 'Recall Desk backup', extensions: ['json'] }], properties: ['openFile'] });
      if (result.canceled) return false;
      const data = BackupSchema.parse(readJson(result.filePaths[0]));
      const confirmation = await dialog.showMessageBox(window!, { type: 'question', title: 'Restore this backup?', message: `Replace your library and timeline with ${data.exams.length} exams, ${data.attempts.length} attempts, and ${data.goals.length} study goals?`, detail: 'Your current data will be backed up first. You can restore that backup to undo this change.', buttons: ['Cancel', 'Restore backup'], defaultId: 0, cancelId: 0 });
      if (confirmation.response !== 1) return false;
      store.restore(data); return true;
    });
    let size = { width: 1360, height: 940 };
    try { const saved = JSON.parse(readFileSync(stateFile(), 'utf8')); size = { width: Math.max(1000, Number(saved.width) || 1360), height: Math.max(700, Number(saved.height) || 940) }; } catch { /* first launch */ }
    window = new BrowserWindow({ ...size, minWidth: 620, minHeight: 540, title: 'Recall Desk', icon: path.join(__dirname, '../assets/icon.png'), backgroundColor: '#000000', show: !process.env.RECALL_TEST, autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    Menu.setApplicationMenu(null);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.loadFile(path.join(__dirname, '../dist/index.html'));
    if (importErrors.length) window.webContents.once('did-finish-load', () => { void dialog.showMessageBox(window!, { type: 'error', title: 'Study pack import needs attention', message: 'One or more queued study packs could not be imported. Your existing library is preserved.', detail: importErrors.join('\n').slice(0, 2500) }); });
    window.on('close', event => {
      if (closing) return;
      event.preventDefault();
      window!.webContents.send('before-close');
    });
    ipcMain.on('ready-to-close', () => {
      if (closing) return;
      try {
        if (store.dirty) store.backup('close');
        writeFileSync(stateFile(), JSON.stringify(window!.getBounds()));
        closing = true; window!.close();
      } catch (error) { dialog.showErrorBox('Could not finish saving', String(error)); }
    });
    backupTimer = setInterval(() => { if (store.dirty) { try { store.backup(); } catch (error) { console.error('Automatic backup failed:', error); } } }, 15 * 60 * 1000);
  }).catch(error => { dialog.showErrorBox('Recall Desk could not start', String(error)); app.exit(1); });
  app.on('window-all-closed', () => { clearInterval(backupTimer); store?.close(); app.quit(); });
}
