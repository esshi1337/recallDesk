# Local study materials

Place personal study-pack JSON and conversion output in `study-materials/`; everything in that directory except `.gitkeep` is ignored by Git. Keep editable personal authoring projects in `local/`, which is also ignored. These directories are for your files, not test fixtures.

Import a pack through **Import study pack** in either app. Importing content does not publish it or add it to the repository. Installed exams, notes, answers, and timeline progress live in the app's separate local data store.

## Existing Agentforce converter

`scripts/convert-agentforce.mjs` supports one specific four-document source format:

- `agentforce-service-baseline-v1-candidate.md`
- `agentforce-service-baseline-v1-answer-key.md`
- `agentforce-service-enriched-study-guide.md`
- `agentforce-service-study-roadmap.md`

The source documents are not included in the repository. If you have them, run:

```bash
npm run convert:agentforce -- /path/to/source-folder ./study-materials/agentforce-service.study-pack.json
npm run test:agentforce
```

Without a source argument, the converter looks in the current user's Downloads directory. It verifies 160 questions, six choices per question, marking-key agreement, and objective metadata. The output preserves four original documents with checksums, six undated phases, and twelve optional modules. A conversion report is written alongside it.

`test:agentforce` is an optional local check and intentionally fails if its input is missing. It is separate from `npm test` and CI. Supply a different output location with `npm run test:agentforce -- /path/to/pack.json`.

For other certifications and subjects, use the reusable authoring templates instead of adapting this source-specific converter. See the [main README](../README.md) and [study guide](STUDY-GUIDE.md).
