import { createId } from '../shared/id';
import { StudyService, TABLES, type Table } from '../shared/service';
import type { Backup } from '../shared/model';
export type Row = { key: string; table: Table; id: string; data: unknown };
export type Snapshot = { id: string; data: Backup };
export class BrowserStore extends StudyService {
  private records = new Map<Table, Map<string, unknown>>(TABLES.map(t => [t, new Map()]));
  private ids: string[];
  readonly writes = new Map<string, Row | null>();
  readonly snapshots = new Map<string, Snapshot>();
  readonly deletedSnapshots = new Set<string>();
  constructor(rows: Row[], backupIds: string[], hashes: Map<string, string>, origin: string, now = () => new Date().toISOString(), uuid: () => string = () => createId()) {
    super(`Browser storage · ${origin}`, now, text => { const value = hashes.get(text); if (!value) throw new Error('Document checksum was not prepared.'); return value; }, uuid);
    for (const row of rows) { if (!this.records.has(row.table)) throw new Error('This browser library uses an unsupported data table.'); this.records.get(row.table)!.set(row.id, row.data); }
    this.ids = [...backupIds].sort();
  }
  protected entries<T>(table: Table) { return [...this.records.get(table)!].map(([id, data]) => ({ id, data: structuredClone(data) as T })); }
  protected get<T>(table: Table, id: string): T | undefined { const data = this.records.get(table)!.get(id); return data === undefined ? undefined : structuredClone(data) as T; }
  protected put(table: Table, id: string, data: unknown) {
    const key = JSON.stringify([table, id]), value = structuredClone(data);
    this.records.get(table)!.set(id, value); this.writes.set(key, { key, table, id, data: value }); this.dirty = true;
  }
  protected remove(table: Table, id: string) { this.records.get(table)!.delete(id); this.writes.set(JSON.stringify([table, id]), null); this.dirty = true; }
  protected clear(table: Table) { for (const id of this.records.get(table)!.keys()) this.remove(table, id); }
  protected transaction<T>(fn: () => T) { return fn(); } // The adapter commits each whole command as one IndexedDB transaction.
  backupFiles() { return [...this.ids]; }
  backup(reason = 'automatic') {
    const id = `${this.now().replace(/[:.]/g, '-')}-${reason}-${this.uuid().slice(0, 6)}.json`;
    this.snapshots.set(id, { id, data: this.exportData() });
    this.ids.push(id); this.ids.sort();
    for (const old of this.ids.slice(0, -20)) { this.deletedSnapshots.add(old); this.snapshots.delete(old); }
    this.ids = this.ids.slice(-20); this.dirty = false; return id;
  }
  checkpoint() {
    const records = new Map([...this.records].map(([table, rows]) => [table, new Map(rows)]));
    const ids = [...this.ids], dirty = this.dirty;
    return () => { this.records = records; this.ids = ids; this.dirty = dirty; this.committed(); };
  }
  committed() { this.writes.clear(); this.snapshots.clear(); this.deletedSnapshots.clear(); }
}
