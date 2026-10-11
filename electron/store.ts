import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { SettingsSchema } from '../shared/model';
import type { StudySession } from '../shared/timeline';
import { StudyService, type Table } from '../shared/service';

export class StudyStore extends StudyService {
  db: DatabaseSync;
  constructor(directory: string, now = () => new Date().toISOString()) {
    super(directory, now, text => createHash('sha256').update(text).digest('hex'), randomUUID);
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(path.join(directory, 'study.sqlite'));
    const version = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version > 3) throw new Error('This database was created by a newer version of Recall Desk.');
    if (version.user_version > 0 && version.user_version < 3) {
      const notes = Object.fromEntries((this.db.prepare('SELECT id,data FROM notes').all() as {id: string;data: string}[]).map(r => [r.id, JSON.parse(r.data)]));
      const timeline = version.user_version >= 2 ? { goals: this.all('goals'), milestones: this.all('milestones'), studySessions: this.all('study_sessions'), manualActivities: this.all('manual_activities'), evidenceLinks: this.all('evidence_links') } : {};
      const snapshot = { ...timeline, format: 'recall-desk-backup', version: version.user_version, createdAt: this.now(), exams: this.all('exams'), attempts: this.all('attempts'), notes, settings: SettingsSchema.parse(this.get('settings', 'preferences') || {}) };
      const folder = path.join(directory, 'backups'); mkdirSync(folder, { recursive: true });
      writeFileSync(path.join(folder, `${this.now().replace(/[:.]/g, '-')}-before-study-pack-upgrade.json`), JSON.stringify(snapshot, null, 2), { mode: 0o600 });
    }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS exams (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS milestones (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS study_sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS manual_activities (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS evidence_links (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS study_sessions_open ON study_sessions(json_extract(data, '$.attemptId')) WHERE json_extract(data, '$.endedAt') IS NULL;
      CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS study_packs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attempt_reviews (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      PRAGMA user_version=3; COMMIT;`);
    this.recover();
  }
  protected transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  protected entries<T>(table: Table): { id: string; data: T }[] {
    return (this.db.prepare(`SELECT id,data FROM ${table}`).all() as { id: string; data: string }[]).map(r => ({ id: r.id, data: JSON.parse(r.data) }));
  }
  protected get<T>(table: Table, id: string): T | undefined {
    const row = this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
  protected put(table: Table, id: string, data: unknown) {
    this.db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(id, JSON.stringify(data));
    this.dirty = true;
  }
  protected remove(table: Table, id: string) { this.db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id); this.dirty = true; }
  protected clear(table: Table) { this.db.exec(`DELETE FROM ${table}`); this.dirty = true; }
  protected findOpenSession(attemptId: string): StudySession | undefined {
    const row = this.db.prepare("SELECT data FROM study_sessions WHERE json_extract(data, '$.attemptId')=? AND json_extract(data, '$.endedAt') IS NULL LIMIT 1").get(attemptId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
  backupFiles() {
    const dir = path.join(this.directory, 'backups');
    mkdirSync(dir, { recursive: true });
    return readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  }
  backup(reason = 'automatic') {
    const folder = path.join(this.directory, 'backups');
    mkdirSync(folder, { recursive: true });
    const file = path.join(folder, `${new Date().toISOString().replace(/[:.]/g, '-')}-${reason}-${randomUUID().slice(0, 6)}.json`);
    this.writeExport(file);
    // Keep the latest 20 snapshots, including snapshots made before restore/import.
    for (const old of this.backupFiles().slice(0, -20)) unlinkSync(path.join(folder, old));
    this.dirty = false;
    return file;
  }
  writeExport(file: string) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.exportData(), null, 2), { mode: 0o600 });
    renameSync(temporary, file);
  }
  close() { this.db.close(); }
}
export function readJson(file: string) { return JSON.parse(readFileSync(file, 'utf8')); }
