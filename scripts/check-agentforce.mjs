// Optional verification of the user's local conversion; excluded from the default test suite.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const pack=JSON.parse(readFileSync(process.argv[2] || 'study-materials/agentforce-service.study-pack.json','utf8'));
const exam=pack.exams[0];
  assert.equal(exam.questions.length, 160);
  assert.equal(new Set(exam.questions.map(q => q.section)).size, 8);
  const key = pack.resources.find(r => r.kind === 'answer-key').markdown;
  const candidate = pack.resources.find(r => r.kind === 'candidate').markdown;
  for (const q of exam.questions) {
    assert.equal(q.options.length, 6); assert.equal(q.shuffleOptions, false);
    assert.ok(q.objective); assert.ok(q.diagnosticTopic); assert.ok(q.explanation);
    assert.ok(candidate.includes(q.prompt)); assert.ok(key.includes(q.prompt));
    for (const o of q.options) { assert.ok(candidate.includes(`- **${o.id}.** ${o.text}`)); assert.equal(o.explanation, ''); }
    const block = key.split(`### ${q.id}\n`)[1].split('\n### ')[0];
    assert.ok(block.includes(`**Correct answer: ${q.correctOptionIds[0]} —`));
  }
  for (const r of pack.resources) assert.equal(createHash('sha256').update(r.markdown).digest('hex'), r.sha256);
  assert.equal(exam.diagnostic, true); assert.equal(exam.timeLimitMinutes, undefined);

console.log('PASS: local Agentforce conversion, 160 source questions, choices, keys, and document checksums.');
