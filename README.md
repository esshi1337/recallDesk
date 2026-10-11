# Recall Desk

A local study app for certification practice and general learning, built with React, TypeScript, and npm. It runs as a standalone Electron desktop app or an offline-capable browser app. No account or study-data server is required.

The interface uses black panels, thin gray borders, white accents, a question tree, and docked notes. Smaller browser windows use drawers for navigation and notes.

## Features

- **Student and Evaluate modes:** answer questions independently, then review correct answers and explanations.
- **Study tools:** autosave, paused/resumable sessions, review flags, eliminated options, per-question notes, and confidence annotations.
- **Timeline:** planned milestones alongside recorded study sessions, results, and manual activities.
- **Study packs:** import an exam, guide, roadmap, and optional practice modules together.
- **Reusable templates:** Salesforce certification and general Recall Desk authoring projects.
- **Portable backups:** transfer the complete library between desktop and browser. Storage is separate; there is no automatic synchronization.

## Run locally

Requires **Node.js 22.13+** and npm. The first dependency download needs internet; studying works offline.

```bash
npm ci
npm start
```

If your npm configuration blocks Electron's runtime download, run `npx install-electron --no` once before starting the desktop app. Linux desktop execution requires a graphical session.

For the browser version:

```bash
npm run browser
```

Open **http://127.0.0.1:4173**. The server serves static files on loopback. After the first successful load, the browser caches the application for offline use. Keep the same address, port, and browser profile to retain access to its library.

## Try or create study content

The desktop and browser app start with a small computer-fundamentals sample. Import [the arithmetic sample pack](examples/arithmetic.study-pack.json) to try guides, diagnostic questions, and a roadmap together.

Open **Study templates** to download an editable project or an importable starter pack. Source templates are also available in [templates/](templates/).

```bash
npm run new:study -- --template salesforce --id my-certification --title "My certification" --out ./local/my-certification
npm run build:study -- ./local/my-certification
```

Replace demonstration questions and source placeholders before real study. These templates are not official certification assessments.

## Build and verify

```bash
npm run check              # TypeScript checks
npm test                   # Unit and SQLite persistence tests
npm run build              # Desktop renderer and Electron main/preload
npm run build:browser      # Static browser app in dist-web/
npm run package            # Electron bundle in out/
npm run make               # Desktop ZIP distribution
npm run install:local      # Install the Linux desktop app locally
```

Browser workflow checks need Chromium:

```bash
npx playwright install chromium
npm run test:browser
npm run test:mobile
```

`test:mobile` checks the responsive browser layout. For a system Chromium installation, set `CHROMIUM_PATH` explicitly. Additional desktop checks and prerequisites are documented in [DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Data and repository boundaries

Desktop progress lives in Electron's user-data directory; browser progress lives in IndexedDB. Use **Settings & backups** to export or restore complete backups. A backup restore replaces the destination library after making a recovery copy.

Personal study packs in `study-materials/`, authoring projects in `local/`, database files, environment files, and generated output are excluded from Git. The repository's default tests use committed samples and require no personal documents. Imported guides, roadmaps, exams, and saved progress are not part of the repository.

- [Study workflow, exam format, timeline, and backup details](docs/STUDY-GUIDE.md)
- [Development, tests, and project structure](docs/DEVELOPMENT.md)
- [Local Agentforce conversion](docs/LOCAL-MATERIALS.md)

## Scope

Single-answer and multiple-answer Markdown questions are supported. Matching, ordering, image packages, labs, cloud synchronization, and a visual exam editor are not implemented. Linux desktop and Chromium browser workflows are exercised locally; other operating systems and browsers have not been verified.

Licensed under [MIT](LICENSE). Imported study content retains its own applicable rights.
