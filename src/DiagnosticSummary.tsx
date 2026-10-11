import { useState } from 'react';
import type { Attempt } from '../shared/model';
import type { AttemptReview } from '../shared/materials';
import { diagnosticRows } from '../shared/diagnostics';
export default function DiagnosticSummary({ attempt, review }: { attempt: Attempt; review?: AttemptReview }) {
  const [by, setBy] = useState<'section' | 'objective'>('section');
  const rows = diagnosticRows(attempt, review, by);
  return <details className="diagnostic-summary"><summary>Diagnostic breakdown · confidence and familiarity</summary><p className="hint">Counts describe this sample. K errors need reasoning review; they are not automatically labeled misconceptions. Section sizes are equal, not official exam weights.</p><label className="field">Group by<select value={by} onChange={e => setBy(e.target.value as 'section' | 'objective')}><option value="section">Section</option><option value="objective">Objective</option></select></label><table><thead><tr><th>{by}</th><th>Correct</th><th>K errors</th><th>R/G correct</th><th>Familiar</th><th>Missing annotations</th><th>Excluded</th></tr></thead><tbody>{rows.map(r => <tr key={r.name}><td>{r.name}</td><td>{r.correct}/{r.total}</td><td>{r.wrongK}</td><td>{r.uncertainCorrect}</td><td>{r.familiar}</td><td>{r.missing}</td><td>{r.excluded}</td></tr>)}</tbody></table><p className="hint">Outside help / study: {attempt.outsideHelp || 'Not recorded'}</p>{review?.excludedQuestionIds.length ? <p className="hint">These totals exclude {review.excludedQuestionIds.length} item(s). Original answers and raw results remain preserved.</p> : null}</details>;
}
