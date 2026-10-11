import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createStarter, authoringFiles, buildAuthoringProject, AuthoringConfigSchema } from '../shared/templates.ts';
import { ExamSchema } from '../shared/model.ts';
const [command, ...args] = process.argv.slice(2);
const hash = text => createHash('sha256').update(text).digest('hex');
if (command === 'new') {
  const options = {};
  for (let i = 0; i < args.length; i += 2) { if (!args[i]?.startsWith('--') || args[i+1] === undefined) throw new Error('Use --template, --id, --title, and --out.'); options[args[i].slice(2)] = args[i+1]; }
  if (!options.out || !options.id || !options.title) throw new Error('Required: --template salesforce|recall-desk --id stable-id --title "Study title" --out /path/to/new-folder');
  const folder = path.resolve(options.out);
  try { await access(folder); throw new Error(`Refusing to overwrite existing folder: ${folder}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const project = createStarter(options.template || 'recall-desk', options.id, options.title);
  const files = await authoringFiles(project, hash); await mkdir(folder, { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(folder, name), text, { flag: 'wx' });
  console.log(`Created editable starter in ${folder}`);
} else if (command === 'build') {
  if (!args[0]) throw new Error('Supply the authoring project folder.');
  const folder = path.resolve(args[0]);
  const config = AuthoringConfigSchema.parse(JSON.parse(await readFile(path.join(folder, 'project.json'), 'utf8')));
  const exam = ExamSchema.parse(JSON.parse(await readFile(path.join(folder, 'exam.json'), 'utf8')));
  const guide = await readFile(path.join(folder, 'guide.md'), 'utf8'), roadmap = await readFile(path.join(folder, 'roadmap.md'), 'utf8');
  const { pack, documents } = await buildAuthoringProject({ config, exam, guide, roadmap }, hash);
  const output = path.join(folder, `${config.id}.study-pack.json`);
  await writeFile(output, JSON.stringify(pack, null, 2));
  await writeFile(path.join(folder, 'candidate.md'), documents.candidate); await writeFile(path.join(folder, 'answer-key.md'), documents['answer-key']);
  console.log(`Validated ${exam.questions.length} questions and generated ${output}`);
} else throw new Error('Expected new or build.');
