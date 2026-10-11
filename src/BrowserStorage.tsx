import { useEffect, useState } from 'react';
import { api } from './platform';
import type { Library } from '../shared/model';
export default function BrowserStorage({ onChange, flush }: { onChange: (data: Library) => void; flush: () => Promise<void> }) {
  const [ids, setIds] = useState<string[]>([]), [selected, setSelected] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { api.listLocalBackups!().then(setIds).catch(e => setMessage(String(e))); }, []);
  async function restore() {
    if (!selected) return; setBusy(true); setMessage('');
    try { await flush(); if (await api.restoreLocalBackup!(selected)) { onChange(await api.library()); setIds(await api.listLocalBackups!()); setMessage('Browser snapshot restored.'); } }
    catch (error) { setMessage(String(error)); } finally { setBusy(false); }
  }
  return <div className="browser-snapshots"><h3>Browser recovery snapshots</h3><p className="hint">These copies are in this browser too. Download a complete backup to keep an independent copy or move to the desktop app.</p><div className="row"><select aria-label="Browser recovery snapshot" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose a saved snapshot</option>{ids.map(id => <option key={id}>{id}</option>)}</select><button disabled={busy || !selected} onClick={() => void restore()}>Restore saved snapshot</button><button onClick={() => void api.listLocalBackups!().then(setIds).catch(e => setMessage(String(e)))}>Refresh list</button><button onClick={() => void navigator.storage.persist().then(granted => setMessage(granted ? 'Persistent browser storage is enabled.' : 'This browser did not grant persistent storage. Complete backup downloads remain available.')).catch(e => setMessage(String(e)))}>Request persistent storage</button></div>{message && <p className="hint" role="status">{message}</p>}</div>;
}
