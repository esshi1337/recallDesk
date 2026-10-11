# Development

Run commands from the project root. Use Node.js 22.13+; `.node-version` selects the Node 22 release line. Install dependencies with `npm ci` so the lockfile controls the dependency versions.

## Project structure

| Directory | Purpose |
|---|---|
| `src/` | Shared React interface, desktop panels, responsive browser drawers |
| `shared/` | Schemas, grading, study operations, diagnostics, timeline, authoring templates |
| `electron/` | Desktop window, IPC bridge, native file dialogs, SQLite storage |
| `browser/` | IndexedDB adapter, browser file operations, local recovery snapshots |
| `examples/` | Original sample exams and a small portable study pack |
| `templates/` | Editable Salesforce and general study starter projects |
| `tests/` | Unit, SQLite persistence, content import, and backup tests |
| `scripts/` | Builds, authoring tools, and end-to-end workflows |
| `study-materials/` | Personal imports and conversion reports, ignored by Git |
| `local/` | Optional scratch authoring projects, ignored by Git |

Desktop and browser use the same `StudyService`. The desktop store persists to SQLite; the browser adapter commits record changes to IndexedDB before acknowledging saves. Backup format 3 is portable between the adapters, and versions 1 and 2 remain importable.

## Checks

```bash
npm run check
npm test
npm run build
npm run build:browser
```

The normal suite uses `examples/arithmetic.study-pack.json`, a small original sample. It does not depend on personal study packs, Downloads, existing application state, or source documents outside the repository.

Browser tests need Playwright Chromium:

```bash
npx playwright install chromium
npm run test:browser
npm run test:mobile
```

On a Linux CI host, `npx playwright install --with-deps chromium` also installs browser system dependencies. To use an existing Chromium instead, supply its path, for example `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`.

Desktop workflows require an Electron runtime and graphical display. If npm blocked the Electron runtime download, use `npx install-electron --no` once. The current desktop UI scripts target Linux/X11 or XWayland:

```bash
npm run test:desktop        # Study workflow, save/restart, grading, backup/restore
npm run test:timeline       # Goals, milestones, sessions, evidence, persistence
npm run test:materials      # Sample pack, annotations, guide navigation, exports
npm run test:templates      # Template exports and import workflow
npm run test:desktop-launch # Normal Electron launch with its sandbox enabled
```

Desktop and browser workflow scripts create temporary libraries and remove them afterward. Screenshots go into ignored `test-artifacts/`. To test a packaged desktop executable, set `RECALL_EXECUTABLE` to its absolute path.

The GitHub Actions workflow runs TypeScript checks, unit tests, both builds, and Chromium browser/responsive workflows. Desktop UI and sandbox launch checks run locally and are not claimed by that workflow.

## Local development data

Electron's installed data is separate from the source directory. For isolated development:

```bash
RECALL_DATA_DIR=/absolute/path/to/disposable-directory npm start
```

`RECALL_TEST=1` starts the Electron window hidden for test automation. The renderer uses `window.desktop` when Electron's preload bridge is available; otherwise it uses the browser adapter.

`npm run serve:browser` serves an existing browser build on port 4173. `PORT` overrides the port, and `RECALL_WEB_ROOT` overrides the static directory. Changing browser origins changes which IndexedDB library is visible. Export progress before switching origins.

## Packaging

```bash
npm run package
npm run make
npm run install:local
```

`package` creates an Electron bundle in `out/`; `make` produces a ZIP distribution. `install:local` is a Linux helper that installs the desktop bundle under `~/.local/opt/recall-desk` and creates an application-menu entry. It is best run while the installed app is closed.

The browser build lives in `dist-web/`. It contains application code and the built-in sample, not your personal library. It can be hosted as static files over HTTPS, including under a subdirectory; opening `index.html` as a `file:` URL is unsupported. The service worker keeps each cached application version consistent. Close all tabs and reopen after changing a deployed build.

Generated outputs, node_modules, personal material, local database files, and credentials do not belong in commits. The root package is marked `private` to prevent accidental npm publication.
