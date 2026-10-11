import { isCorrect, type Attempt } from './model';
import type { AttemptReview } from './materials';
export function diagnosticRows(attempt: Attempt, review?: AttemptReview, by: 'section' | 'objective' = 'section') {
  const rows = new Map<string, { name: string; total: number; correct: number; wrongK: number; uncertainCorrect: number; familiar: number; missing: number; excluded: number }>();
  for (const id of attempt.questionOrder) {
    const q = attempt.exam.questions.find(q => q.id === id)!, r = attempt.responses[id];
    const name = (by === 'section' ? q.section : q.objective) || 'Unspecified';
    const row = rows.get(name) || { name, total: 0, correct: 0, wrongK: 0, uncertainCorrect: 0, familiar: 0, missing: 0, excluded: 0 };
    rows.set(name, row);
    if (review?.excludedQuestionIds.includes(id)) { row.excluded++; continue; }
    row.total++; const correct = isCorrect(q, r); if (correct) row.correct++;
    if (!correct && r.selected.length && r.confidence === 'K') row.wrongK++;
    if (correct && (r.confidence === 'R' || r.confidence === 'G')) row.uncertainCorrect++;
    if (r.familiar === true) row.familiar++;
    if (!r.confidence || r.familiar == null) row.missing++;
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
export function candidateMarkdown(attempt: Attempt) {
  const lines = [`# ${attempt.exam.title} — completed candidate`, '', `**Status:** ${attempt.status}`, `**Started:** ${attempt.createdAt}`, `**Finished:** ${attempt.submittedAt || 'Not submitted'}`, `**Outside help or study during the attempt:** ${attempt.outsideHelp || 'Not recorded'}`, '', 'Original selections and confidence annotations. No answer key is included.', ''];
  let section = '';
  for (const id of attempt.questionOrder) {
    const q = attempt.exam.questions.find(q => q.id === id)!, r = attempt.responses[id];
    if (q.section && q.section !== section) { section = q.section; lines.push(`## ${section}`, ''); }
    lines.push(`### ${q.id}`, '', q.prompt, '');
    for (const [index, o] of q.options.entries()) lines.push(`- **${String.fromCharCode(65 + index)}.** ${o.text}`);
    const letters = r.selected.map(id => String.fromCharCode(65 + q.options.findIndex(o => o.id === id))).join(', ');
    lines.push('', `**Your answer:** ${letters || '____'}  **Confidence (K/R/G):** ${r.confidence || '____'}  **Familiar (Yes/No):** ${r.familiar == null ? '____' : r.familiar ? 'Yes' : 'No'}`, '', '**Optional reasoning / ambiguity note:**', r.note || '', '', `**Flagged for review:** ${r.flagged ? 'Yes' : 'No'}  **Answer revealed during attempt:** ${r.revealed ? 'Yes' : 'No'}`, '', '---', '');
  }
  return lines.join('\n');
}
