import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { homedir } from 'node:os';
const directory = process.argv[2] || path.join(homedir(), 'Downloads');
const out = process.argv[3] || path.resolve('study-materials/agentforce-service.study-pack.json');
const packId = 'agentforce-service-v1';
const names = { candidate: 'agentforce-service-baseline-v1-candidate.md', 'answer-key': 'agentforce-service-baseline-v1-answer-key.md', guide: 'agentforce-service-enriched-study-guide.md', roadmap: 'agentforce-service-study-roadmap.md' };
const texts = Object.fromEntries(await Promise.all(Object.entries(names).map(async ([kind, name]) => [kind, await readFile(path.join(directory, name), 'utf8')])));
const headings = text => [...text.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m, i) => ({ id: `heading-${i}`, title: m[2].replace(/[*`]/g, ''), level: m[1].length }));
const resources = Object.entries(texts).map(([kind, markdown]) => ({ id: `${packId}-${kind}`, packId, kind, title: markdown.match(/^# (.+)/)[1], fileName: names[kind], sha256: createHash('sha256').update(markdown).digest('hex'), markdown }));
function blocks(text) {
  const matches = [...text.matchAll(/^### (S[1-8]-\d{2})\s*$/gm)];
  return matches.map((m, i) => ({ id: m[1], text: text.slice(m.index + m[0].length, matches[i+1]?.index ?? text.length).trim() }));
}
function candidateParts(block) {
  const options = [...block.text.matchAll(/^- \*\*([A-F])\.\*\* (.+)$/gm)].map(m => ({ id: m[1], text: m[2], explanation: '' }));
  return { prompt: block.text.slice(0, block.text.indexOf('- **A.**')).trim(), options };
}
const candidates = blocks(texts.candidate), keys = blocks(texts['answer-key']);
if (candidates.length !== 160 || keys.length !== 160) throw new Error('Expected 160 candidate items and 160 key items.');
const sectionNames = Object.fromEntries([...texts.candidate.matchAll(/^## Section (\d): (.+)$/gm)].map(m => [m[1], m[2]]));
const compact = new Map();
for (const m of texts['answer-key'].matchAll(/^\| S([1-8]) — [^|]+\| (.+) \|$/gm)) for (const entry of m[2].matchAll(/(\d{2}) ([A-F])/g)) compact.set(`S${m[1]}-${entry[1]}`, entry[2]);
const questions = candidates.map((candidate, i) => {
  const key = keys[i], c = candidateParts(candidate), k = candidateParts(key);
  if (candidate.id !== key.id || JSON.stringify(c) !== JSON.stringify(k)) throw new Error(`Candidate/key mismatch at ${candidate.id}`);
  if (c.options.length !== 6 || c.options.map(o => o.id).join('') !== 'ABCDEF') throw new Error(`Expected A–F choices for ${candidate.id}`);
  const correct = key.text.match(/\*\*Correct answer: ([A-F]) — ([\s\S]*?)\*\*/);
  if (!correct || compact.get(candidate.id) !== correct[1] || c.options.find(o => o.id === correct[1]).text !== correct[2]) throw new Error(`Key mismatch at ${candidate.id}`);
  const explanation = key.text.match(/\*\*Explanation:\*\* ([\s\S]+?)\n\n\*\*Diagnostic topic:/)?.[1].trim();
  const meta = key.text.match(/\*\*Diagnostic topic:\*\* (.+?)\. \*\*Objective:\*\* ([\d.]+)\./);
  const basis = key.text.match(/\*\*Source \/ reasoning basis:\*\* ([^\n]+)/)?.[1];
  if (!explanation || !meta || !basis) throw new Error(`Missing explanation/metadata at ${candidate.id}`);
  const section = `${candidate.id[1]}. ${sectionNames[candidate.id[1]]}`;
  return { id: candidate.id, type: 'single-choice', ...c, correctOptionIds: [correct[1]], explanation, section, diagnosticTopic: meta[1], objective: meta[2], tags: [section], shuffleOptions: false, sources: [basis] };
});
const objectiveRows = [...texts['answer-key'].matchAll(/^\| (\d+\.\d+) \| ([^|]+) \| ([^|]+) \|$/gm)];
const mapped = new Set();
for (const row of objectiveRows) for (const qid of row[3].match(/S[1-8]-\d{2}/g) || []) {
  if (mapped.has(qid) || questions.find(q => q.id === qid)?.objective !== row[1]) throw new Error(`Objective mapping mismatch for ${qid}`);
  mapped.add(qid);
}
if (mapped.size !== 160 || compact.size !== 160) throw new Error('Incomplete objective/compact-key coverage.');
const goalId = `${packId}-goal`;
const exam = { schemaVersion: 1, id: 'agentforce-service-baseline-v1', revision: 1, title: 'Agentforce Service Consultant — Baseline v1', certification: 'Agentforce Service Consultant', diagnostic: true, description: '160-question diagnostic · eight equally sized sections · confidence and familiarity annotations. Not an official or exam-weighted assessment.', instructions: texts.candidate.slice(texts.candidate.indexOf('## How to take'), texts.candidate.indexOf('## Sections')).trim(), sourceCatalog: texts['answer-key'].slice(texts['answer-key'].indexOf('### Scope and sources'), texts['answer-key'].indexOf('## Objective coverage')).trim(), questions };
const roadmapHeadings = headings(texts.roadmap), guideHeadings = headings(texts.guide);
const phaseMatches = [...texts.roadmap.matchAll(/^## Phase (\d) — (.+)$/gm)];
const milestones = phaseMatches.map((m, i) => {
  const end = texts.roadmap.slice(m.index + m[0].length).search(/^## /m);
  const description = texts.roadmap.slice(m.index + m[0].length, end < 0 ? undefined : m.index + m[0].length + end).trim();
  return { id: `${packId}-phase-${m[1]}`, goalId, title: `Phase ${m[1]} — ${m[2]}`, description, order: i, status: 'planned', targetAttempts: 1, resourceRefs: [{ resourceId: `${packId}-roadmap`, headingId: roadmapHeadings.find(h => h.title === `Phase ${m[1]} — ${m[2]}`).id }] };
});
const moduleRows = [...texts.roadmap.matchAll(/^\| (M\d+)\. ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)];
const sectionHints = { M1:['4.1','4.2','Exercise L4'], M2:['4.3','4.4','4.5','Exercise L4'], M3:['6.2','6.3','6.4','6.5','Exercise L6'], M4:['5.4','Exercise L5'], M5:['5.1','5.2','5.3','Exercise L5'], M6:['5.5','6.6'], M7:['5.6','Exercise L5'], M8:['3.2','3.3','Exercise L3'], M9:['1.1','1.2','7.','Exercise L1','Exercise L7'], M10:['2.','Exercise L2'], M11:['8.','Exercise L8'], M12:['6.1','6.7','9.'] };
const modules = moduleRows.map((m, i) => ({ id: `${packId}-${m[1].toLowerCase()}`, goalId, title: `${m[1]}. ${m[2].trim()}`, description: `Optional module; select after reviewing evidence.\n\nGuide: ${m[3].trim()}\n\nSuggested work: ${m[4].trim()}\n\nEvidence to move on: ${m[5].trim()}`, order: i, status: 'planned', targetAttempts: 1, resourceRefs: guideHeadings.filter(h => sectionHints[m[1]].some(hint => h.title.startsWith(hint + ' ') || (hint.endsWith('.') && h.title.startsWith(hint)))).map(h => ({ resourceId: `${packId}-guide`, headingId: h.id })) }));
if (milestones.length !== 6 || modules.length !== 12 || modules.some(m => !m.resourceRefs.length)) throw new Error('Roadmap phases/modules were not fully mapped.');
const missingReferences = [...new Set(Object.values(texts).flatMap(s => [...s.matchAll(/\]\((sandbox:[^)]+)\)/g)].map(m => m[1].split('/').pop())))].filter(name => !Object.values(names).includes(name));
const pack = { format: 'recall-desk-study-pack', version: 1, id: packId, title: 'Agentforce Service Consultant — study materials', revision: 1, exams: [exam], resources, goal: { id: goalId, title: 'Agentforce Service Consultant', description: 'Adaptive roadmap. Begin with the baseline; later study assignments remain provisional. No fixed exam date.', examIds: [exam.id], createdAt: new Date().toISOString(), archived: false }, milestones, modules, warnings: ['The source provides question-level explanations, not separate explanations for every option.', ...missingReferences.map(name => `Referenced companion file not included: ${name}`)] };
await mkdir(path.dirname(out), { recursive: true }); await writeFile(out, JSON.stringify(pack, null, 2));
await writeFile(out.replace(/\.json$/, '.conversion-report.json'), JSON.stringify({ questions: questions.length, sectionCounts: Object.fromEntries(Object.keys(sectionNames).map(n => [sectionNames[n], questions.filter(q => q.id[1] === n).length])), candidateKeyExactMatch: true, compactKeyChecked: compact.size, objectiveMappingChecked: mapped.size, phases: milestones.length, optionalModules: modules.length, sources: resources.map(({ fileName, sha256 }) => ({ fileName, sha256 })), warnings: pack.warnings }, null, 2));
console.log(`Converted and cross-checked ${questions.length} questions, ${milestones.length} phases, ${modules.length} optional modules, and ${resources.length} unchanged source documents.\n${out}`);
