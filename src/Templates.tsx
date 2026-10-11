import { useState } from 'react';
import { Download, Files } from 'lucide-react';
import { api } from './platform';
import { TemplateRequestSchema, type TemplateRequest } from '../shared/templates';
import './templates.css';
export default function Templates() {
  const [kind, setKind] = useState<TemplateRequest['kind']>('salesforce');
  const [title, setTitle] = useState('My Salesforce certification');
  const [id, setId] = useState('my-salesforce-certification');
  const [customId, setCustomId] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  function selectKind(next: TemplateRequest['kind']) {
    setKind(next);
    if (!customId && ['My Salesforce certification', 'My study subject'].includes(title)) {
      const value = next === 'salesforce' ? 'My Salesforce certification' : 'My study subject';
      setTitle(value); setId(value.toLowerCase().replaceAll(' ', '-'));
    }
  }
  async function download(output: TemplateRequest['output']) {
    setBusy(true); setMessage('');
    try {
      const request = TemplateRequestSchema.parse({ kind, id, title, output });
      if (await api.exportTemplate(request)) setMessage(output === 'source' ? 'Editable authoring project exported.' : 'Starter study pack exported. Import it from the exam library when ready.');
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }
  return <section className="page templates-page"><h1>Study templates</h1><p className="intro">Reusable structures for guides, roadmaps, diagnostics, and answer keys.</p>
    <div className="template-types"><button className={kind === 'salesforce' ? 'selected' : ''} onClick={() => selectKind('salesforce')}><strong>Salesforce certification</strong><span>Official-outline fields, release and license assumptions, objective mapping, and training-org checks.</span></button><button className={kind === 'recall-desk' ? 'selected' : ''} onClick={() => selectKind('recall-desk')}><strong>Recall Desk · any subject</strong><span>Concepts, worked examples, applied practice, optional modules, and fresh transfer checks.</span></button></div>
    <div className="template-editor"><label className="field">Study title<input value={title} maxLength={160} onChange={e => { setTitle(e.target.value); if (!customId) setId(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 71)); }}/></label><label className="field">Stable pack ID<input value={id} onChange={e => { setCustomId(true); setId(e.target.value); }}/></label><p className="hint">Use a different ID for each study goal. Keep it stable when revising that goal's content.</p><div className="row wrap"><button disabled={busy} className="primary" onClick={() => void download('source')}><Files size={15}/> Download editable project</button><button disabled={busy} onClick={() => void download('pack')}><Download size={15}/> Download starter pack</button></div>{message && <p className="template-message" role="status">{message}</p>}</div>
    <section className="template-contents"><h2>Included</h2><ul><li>Editable <code>guide.md</code>, <code>roadmap.md</code>, <code>exam.json</code>, and <code>project.json</code>.</li><li>A reusable authoring brief for creating the next subject’s content.</li><li>A generated candidate paper and answer key, both derived from the same exam.</li><li>Six undated roadmap phases and three optional module patterns.</li><li>An importable study pack with validated references and document checksums.</li></ul><p className="hint">Each starter includes one labeled demonstration question. Replace it with your own subject questions and checked sources before using the pack as a real assessment. No exam weights, release, timing, or pass prediction is assumed.</p><h2>After editing</h2><p>Unzip the authoring project. From the Recall Desk source folder, build it with:</p><pre><code>npm run build:study -- /path/to/your/project</code></pre><p>Import the generated study-pack JSON in either version of Recall Desk. Rebuild after changing questions or documents so the candidate, key, and checksums stay consistent.</p></section>
  </section>;
}
