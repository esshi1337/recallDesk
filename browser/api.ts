import { z } from 'zod';
import { BackupSchema, ExamSchema, type DesktopAPI } from '../shared/model';
import { BrowserStore, type Row, type Snapshot } from './store';
import { StudyPackSchema } from '../shared/study-pack';
import { templateDownload, TemplateRequestSchema } from '../shared/templates';
import sample from '../examples/computer-fundamentals.json';

export async function browserHash(text: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function downloadFile(name: string, value: string | Uint8Array, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : new Uint8Array(value).buffer], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function pickJSON(): Promise<unknown | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
    input.addEventListener('cancel', () => { input.remove(); resolve(null); }, { once: true });
    input.addEventListener('change', () => { const file = input.files?.[0]; input.remove(); if (!file) resolve(null); else file.text().then(text => { try { resolve(JSON.parse(text)); } catch { reject(new Error('The selected file is not valid JSON.')); } }, reject); }, { once: true });
    document.body.appendChild(input); input.click();
  });
}
function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('recall-desk', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('records', { keyPath: 'key' }); request.result.createObjectStore('backups', { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other Recall Desk tabs before updating browser storage.'));
  });
}
function readAll<T>(db: IDBDatabase, table: string): Promise<T[]> {
  return new Promise((resolve, reject) => { const tx = db.transaction(table, 'readonly'); const request = tx.objectStore(table).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
function readKeys(db: IDBDatabase): Promise<string[]> {
  return new Promise((resolve, reject) => { const request = db.transaction('backups', 'readonly').objectStore('backups').getAllKeys(); request.onsuccess = () => resolve(request.result as string[]); request.onerror = () => reject(request.error); });
}
function readSnapshot(db: IDBDatabase, id: string): Promise<Snapshot> {
  return new Promise((resolve, reject) => { const request = db.transaction('backups', 'readonly').objectStore('backups').get(id); request.onsuccess = () => request.result ? resolve(request.result) : reject(new Error('Saved snapshot no longer exists.')); request.onerror = () => reject(request.error); });
}
export function createBrowserAPI(): DesktopAPI {
  let database: IDBDatabase, store: BrowserStore;
  const hashes = new Map<string, string>();
  let queued = Promise.resolve<unknown>(undefined), pending = 0;
  const init = (async () => {
    if (!window.isSecureContext || !window.indexedDB || !navigator.locks || !crypto.subtle) throw new Error('Open Recall Desk through localhost or HTTPS in a browser with IndexedDB and Web Locks support.');
    await new Promise<void>((resolve, reject) => {
      void navigator.locks.request('recall-desk-writer', { ifAvailable: true }, async lock => {
        if (!lock) { reject(new Error('Recall Desk is already open in another tab. Close that tab, then reload this one.')); return; }
        resolve(); await new Promise<void>(() => {}); // Released automatically when the document closes.
      }).catch(reject);
    });
    database = await openDatabase(); database.onversionchange = () => database.close();
    const [rows, backups] = await Promise.all([readAll<Row>(database, 'records'), readKeys(database)]);
    store = new BrowserStore(rows, backups, hashes, location.origin);
    await commit(() => { store.recover(); store.seed(sample); });
    await commit(() => store.backup('startup')).catch(error => console.warn('Automatic recovery snapshot could not be saved; complete backup export is still available.', error));
    setInterval(() => { void mutate(() => { if (store.dirty) store.backup(); }).catch(() => {}); }, 15 * 60 * 1000);
  })();
  // Avoid an unhandled rejection before React calls library().
  void init.catch(() => {});
  async function prepare(value: { resources?: { markdown: string }[] }) {
    for (const resource of value.resources || []) if (!hashes.has(resource.markdown)) hashes.set(resource.markdown, await browserHash(resource.markdown));
  }
  async function commit<T>(fn: () => T): Promise<T> {
    const rollback = store.checkpoint();
    try {
      const result = fn();
      if (!store.writes.size && !store.snapshots.size && !store.deletedSnapshots.size) return structuredClone(result);
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(['records', 'backups'], 'readwrite', { durability: 'strict' });
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error || new Error('Browser storage write was aborted.'));
        tx.onerror = () => {}; // onabort is the definitive failure boundary.
        try {
          for (const [key, row] of store.writes) { if (row) tx.objectStore('records').put(row); else tx.objectStore('records').delete(key); }
          for (const id of store.deletedSnapshots) tx.objectStore('backups').delete(id);
          for (const snapshot of store.snapshots.values()) tx.objectStore('backups').put(snapshot);
        } catch (error) { tx.abort(); reject(error); }
      });
      store.committed(); return structuredClone(result);
    } catch (error) { rollback(); throw error; }
  }
  function mutate<T>(fn: () => T): Promise<T> {
    pending++;
    const job = queued.then(async () => { await init; return commit(fn); });
    queued = job.catch(() => {}); return job.finally(() => pending--);
  }
  async function ready() { await init; await queued; }
  async function restore(value: unknown) {
    const backup = BackupSchema.parse(value); await prepare(backup);
    if (!window.confirm(`Replace the browser library with ${backup.exams.length} exams, ${backup.attempts.length} attempts, ${backup.goals.length} goals, and ${backup.resources.length} documents? A local recovery snapshot is saved first.`)) return false;
    await mutate(() => store.restore(backup)); return true;
  }
  window.addEventListener('beforeunload', event => {
    if (pending || document.querySelector('[data-save-state="saving"], [data-save-state="error"]')) { event.preventDefault(); event.returnValue = ''; }
  });
  return {
    library: async () => { await ready(); return structuredClone(store.library()); },
    saveGoal: g => mutate(() => store.saveGoal(g)), saveMilestone: m => mutate(() => store.saveMilestone(m)),
    deleteMilestone: id => mutate(() => store.deleteMilestone(id)), reorderMilestones: (id, ids) => mutate(() => store.reorderMilestones(id, ids)),
    saveManualActivity: a => mutate(() => store.saveManualActivity(a)), deleteManualActivity: id => mutate(() => store.deleteManualActivity(id)),
    linkEvidence: (m, e, linked) => mutate(() => store.linkEvidence(m, e, linked)),
    start: (exam, options) => mutate(() => store.start(exam, options)), saveAttempt: a => mutate(() => store.saveAttempt(a)),
    saveNote: (key, text) => mutate(() => store.saveNote(key, text)), saveSettings: s => mutate(() => store.saveSettings(s)),
    saveAttemptReview: r => mutate(() => store.saveAttemptReview(r)), addStudyModule: (p, m) => mutate(() => store.addStudyModule(p, m)),
    importExam: async () => { const value = await pickJSON(); if (value === null) return null; return (await mutate(() => store.importExam(value))).title; },
    importStudyPack: async () => { const value = await pickJSON(); if (value === null) return null; const pack = StudyPackSchema.parse(value); await prepare(pack); return mutate(() => store.importStudyPack(pack)); },
    exportExam: async value => { const exam = ExamSchema.parse(value); downloadFile(`${exam.id.replace(/[^a-z0-9_-]/gi, '-')}.json`, JSON.stringify(exam, null, 2)); return true; },
    exportAttempt: async id => { await ready(); downloadFile('completed-candidate.md', store.exportAttempt(id), 'text/markdown'); return true; },
    backup: () => mutate(() => store.backup('manual')),
    exportBackup: async () => { await ready(); downloadFile(`recall-desk-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(store.exportData(), null, 2)); return true; },
    restoreBackup: async () => { const value = await pickJSON(); return value === null ? false : restore(value); },
    listLocalBackups: async () => { await ready(); return store.backupFiles().reverse(); },
    restoreLocalBackup: async id => { await ready(); return restore((await readSnapshot(database, id)).data); },
    openDataFolder: async () => { throw new Error('Browser data lives in IndexedDB. Use Export complete backup to save a portable file.'); },
    openReference: async value => { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) references are supported.'); window.open(url.href, '_blank', 'noopener,noreferrer'); },
    exportTemplate: async value => { const request = TemplateRequestSchema.parse(value); const result = await templateDownload(request, browserHash); downloadFile(result.name, result.data, result.type); return true; },
    onBeforeClose: callback => {
      const hidden = () => { if (document.visibilityState === 'hidden') callback(); };
      document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', callback);
      return () => { document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', callback); };
    },
    readyToClose: () => {}
  };
}
