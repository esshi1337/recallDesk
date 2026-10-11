# Using Recall Desk

Paths and commands below are relative to the project root.

## Study workflow

1. Import a JSON exam or try the clearly labeled computer-fundamentals sample.
2. Start a Student session. Optionally choose a topic, question count, shuffling, or a timer.
3. Select answers, cross out unlikely options, flag questions, and write scratch notes. Changes save immediately to local storage (SQLite on desktop; IndexedDB in the browser).
4. Pause, return to the library, or close the window. Reopening an unfinished session restores it paused.
5. Finish the attempt to see your score and Evaluate view. Correct answers, explanations for every option, and a general explanation are shown.
6. Review missed or flagged questions, add reusable study notes, and start a new attempt from the questions you missed.

**Evaluate** on an exam card opens the answer key without creating an attempt. **Reveal answer** inside Student mode records the reveal and keeps the explanation visible. A revealed response still contributes to the raw score; revealed counts are displayed separately. These scores are practice percentages, not predictions of any certification provider's scaled scores.

Multi-answer questions use exact-match scoring. Unanswered questions count as incorrect. Submitted answers and scratch notes are read-only. Reusable study notes remain editable and are hidden by default during new student sessions.

The optional timer counts while a session is active. It pauses when you explicitly pause, leave the session, or close the application. At zero, you choose between submitting and continuing untimed. It is a practice aid, not a proctoring mechanism.

## Browser version

Run `npm run browser`, then open **http://127.0.0.1:4173**. The server serves only static application files on the loopback interface. It has no endpoint that receives your exams, answers, or notes. The browser saves records in IndexedDB and commits writes before acknowledging them. Local recovery snapshots are separate from downloadable complete backups.

Use **Import study pack** to open the same JSON packs as the desktop app, including the converted Agentforce pack. To transfer an entire library and its progress, export a complete backup from one version and restore it in the other. **Browser and desktop storage are separate; this is an explicit transfer, not automatic synchronization.** Restore replaces the destination library after saving a recovery snapshot.

The app caches its own assets for offline use after the first successful online/local-server load. Browsers that offer PWA installation can install it from their browser menu. Cached versions stay internally consistent; close all Recall Desk tabs and reopen after updating the build. Static hosting also works from a subdirectory using HTTPS. Opening `index.html` directly as a `file:` URL is unsupported. Service workers require a secure context such as HTTPS or localhost. [MDN service-worker documentation](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

Browser data belongs to the current browser profile and exact origin (scheme, hostname, and port). Keep the local address stable. Clearing site data removes the browser library and its local snapshots; export a complete backup for an independent copy. **Settings & backups** includes saved-snapshot recovery and a request for persistent storage. Only one tab owns the writable library at a time, preventing two stale views from overwriting one another. Browser storage is origin-specific. [MDN IndexedDB documentation](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)

Switching away from the browser tab pauses an active test. A closed/crashed tab recovers at the last completed save; elapsed downtime is not added. The browser can warn when closing with pending changes. Browser verification on this workstation uses Chromium; Firefox and Safari have not been runtime-tested here.

`dist-web/` contains no personal study pack or desktop library. You can copy that directory to any suitable static server. `PORT` changes the local server port; export your browser data before changing origins. No public deployment or automatic login-start service is configured by the build.

## Reusable study templates

Open **Study templates** in either version. Choose **Salesforce certification** or **Recall Desk · any subject**, enter a title and stable pack ID, and download either an editable ZIP project or an importable starter pack.

The Salesforce starter includes fields for the applicable official outline, source-check dates, release alignment, editions/licenses, identity and access assumptions, objective mapping, and small training-org checks. It does not reuse one certification's weights or timings for another. The general starter provides the same guide → baseline → evidence → targeted practice structure for any subject. Both contain six undated phases, three optional module patterns, and **one clearly labeled demonstration question that should be replaced before real study**.

Ready-to-edit source folders are in `templates/salesforce-certification/` and `templates/recall-desk/`.

```bash
npm run new:study -- --template salesforce --id my-certification --title "My certification" --out /path/to/new-folder
npm run new:study -- --template recall-desk --id my-subject --title "My subject" --out /path/to/another-folder
npm run build:study -- /path/to/your-folder
```

Edit `project.json`, `exam.json`, `guide.md`, and `roadmap.md`. The build validates references, calculates checksums, and generates `candidate.md`, `answer-key.md`, and the study-pack JSON. Candidate and key derive from one exam definition to avoid drift. Do not maintain their generated copies separately. Creating a starter refuses to overwrite an existing folder. When revising an imported pack, increase the project revision and, when questions change, the exam revision.

## Timeline: plan and actual progress

Open **Timeline** from the clock icon in the left navigation, then **New goal**. A goal can represent a certification or any subject. Link one or more imported exams; their existing results and future sessions appear automatically. An exam date is optional.

- **Milestones:** write a concrete outcome, optionally set a target date, and arrange the list with the up/down controls. Undated milestones stay in the list. Statuses are planned, in progress, completed, and deferred. Edit a milestone to reschedule it; recorded activity and its completion timestamp do not move.
- **Plan and Activity tracks:** hollow markers show scheduled milestones and the exam date. Filled markers show recorded study sessions, submitted attempts, manual entries, and milestone completions. A Today line anchors the view. Use the range selector, horizontal scrolling, and activity-type filter to inspect a period. The activity log below includes all dates.
- **Evidence:** select a session, attempt result, or manual activity and check the milestones it supports. Selecting a milestone shows its linked work. An optional score target suggests when enough linked attempts qualify, but completion remains manual.
- **Manual entries:** log reading/Trailhead, labs, videos/courses, or other study. Record the date, optional minutes, and notes. Actual activity cannot be dated in the future; use a milestone for future work.
- **Progress:** milestone completion count and topic coverage remain separate. Coverage is the number of current-library questions answered at least once, not a mastery estimate. Results compare only the same exam revision and exact question set, with no revealed answers in either attempt. First/repeated answer counts are relative to earlier completed attempts using stable question IDs.

Each uninterrupted active session is recorded separately from the exam attempt. Pausing, leaving the test, or closing ends a session; resuming starts another. A test spanning several days therefore has multiple activity entries. After an interrupted shutdown, a session ends at its last persisted update, without adding downtime.

Older attempts retain their recorded completion or start date. Detailed sessions before this feature existed cannot be reconstructed. They are not fabricated. Linking an existing exam to a goal makes the available older records visible.

Complete backups use format version 3, including timeline and study-material data. Versions 1 and 2 remain restorable. Older backups clear features they do not contain; restoration replaces the library rather than merging it. A recovery backup is created before restoration.

## Study packs, guides, and diagnostic baselines

**Import study pack** adds related exams, original Markdown documents, a study goal, roadmap phases, and optional modules in one operation. It merges into the library rather than replacing existing attempts. Re-importing the same pack preserves completed milestones, personal edits, dates, and activated modules. Changed source documents require a new pack revision; changed questions also require a new exam revision. Imports validate document checksums and all question/roadmap references before writing.

**Study materials** provides a local Markdown reader with a section index, tables, internal companion-file links, and links from roadmap milestones to guide sections. Optional modules are added to the timeline only when selected. **Log reading** creates an activity only when clicked. Opening a document does not mark work complete. The answer key has an explicit reveal screen; a guide opened before the baseline is completed also requires an explicit open action.

HTTP(S) source links open in your browser only when clicked. Missing `sandbox:` or relative-file references are identified as unavailable rather than downloaded or silently redirected. The imported documents keep their original text and dated claims; the importer does not independently validate Salesforce product behavior.

Diagnostic exams support K/R/G confidence, familiar/not-familiar/unrecorded annotations, an outside-help note, stable source question IDs, and section navigation. Evaluate shows counts by section or objective. It does not assign a certification pass target or infer mastery. You can exclude a disputed item from the reviewed diagnostic totals without changing the original answer. History and timeline keep the raw result; disputed attempts do not qualify for milestone score-target suggestions. **Export candidate** saves a Markdown response sheet with the original choices, confidence, familiarity, and notes, without the answer key.

Personal study materials are excluded from Git. If you have the four supported Agentforce Markdown files, create a local pack with:

```bash
npm run convert:agentforce -- /path/to/source-folder /path/to/output.study-pack.json
```

This converter is deliberately specific to those source files: it checks all 160 question/prompt/choice matches, six options each, the compact marking key, and the objective-coverage table. It imports six undated roadmap phases and retains all twelve modules as optional. The source has question-level explanations, so option-level explanations are left absent rather than invented. The enriched guide, roadmap, candidate file, and key are retained verbatim with SHA-256 checksums.

For an unattended local import, place a validated `*.study-pack.json` in the data folder's `import-inbox/`. The next launch imports it with a pre-import backup and renames it to `*.imported`. Invalid packs remain in the inbox and report an error; existing study data is preserved.

Desktop databases at version 1 or 2 are backed up before upgrading to version 3. Complete backup format 3 includes documents, pack metadata, optional modules, and diagnostic reviews. Older backups still restore; they do not contain the new material data. Restoration is a replacement, not a merge.

## Exam format

Copy `examples/exam-template.json`, edit it, and use **Import exam**. The library also has **Export a template**. `examples/computer-fundamentals.json` demonstrates single- and multiple-answer questions. The sample is original demonstration material, not an official certification question bank.

Required exam fields:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Currently `1` |
| `id` | Stable exam ID |
| `revision` | Positive integer; increase when updating the same exam |
| `title` | Display name |
| `questions` | Nonempty question array |

Optional exam fields: `description`, `certification`, `passingPercent` (default 70), and `timeLimitMinutes` (optional timer default).

Question fields:

| Field | Meaning |
| --- | --- |
| `id` | Stable question ID, unique within the exam |
| `type` | `single-choice` or `multiple-choice` |
| `prompt` | Markdown question text |
| `options` | At least two objects, each with unique `id` and `text`; optional `explanation` when supplied by the source |
| `correctOptionIds` | Exact set of correct option IDs |
| `explanation` | General explanation of the concept |
| `tags` | Optional topic strings used for filtering and score breakdowns |
| `selectCount` | Optional number for “Choose N”; must match the correct-answer count |
| `shuffleOptions` | Optional boolean; set false for order-dependent options |
| `sources` | Optional source references displayed as selectable text |

Prompts, option text, and explanations accept Markdown, including tables and fenced code. Letters A/B/C are display positions, not IDs. Imported exams are copied into the library. Existing attempts retain the exact exam snapshot and shuffled order they started with. Increasing a revision replaces the library version after an automatic backup; equal/lower conflicting revisions are rejected.

Current scope: text/Markdown exams with single and multiple choice. Image/attachment packages, matching, ordering, labs, a visual exam editor, and cloud sync are not implemented. Markdown links are shown as selectable text without opening a browser. Image syntax displays a placeholder.

Optional diagnostic fields are `diagnostic`, `instructions`, and `sourceCatalog` on the exam, plus `section`, `objective`, and `diagnosticTopic` on questions. Diagnostic topics and objectives are shown with explanations in Evaluate, not as hints in Student. The study-material reader supports explicit reference navigation separately from the question renderer.

## Storage and recovery

Use **Settings & backups → Open data folder** for the exact location. The default on Linux is usually `~/.config/Recall Desk/study-data/`. The application uses Electron's user data directory, separate from the installed executable.

- `study.sqlite`: exams, attempt snapshots, responses, notes, preferences, goals, milestones, study sessions, manual activities, and evidence links.
- `backups/`: complete, versioned JSON snapshots. The newest 20 are retained.
- Window geometry is stored beside the study-data folder.

Automatic backups run at launch, every 15 minutes when data changes, on clean close, before replacing an exam, and before restoring a backup. Backup restore validates the complete file before replacing data inside a transaction. The pre-restore backup can undo a restore. Exporting a complete backup lets you copy it to another disk or computer.

Saving runs quietly in the background. If a write fails, an error notice appears, pending changes remain in memory and **Retry saving** retries the queue. Closing waits for pending writes. A sudden process or machine crash can lose a write that had not completed; completed SQLite writes survive normal app restarts. These local backups do not protect against loss of the whole drive.

For isolated development/test data, set `RECALL_DATA_DIR` to a dedicated directory before starting Electron. `RECALL_TEST=1` starts the window hidden for automated testing. Tests use temporary directories and do not modify normal study data.
