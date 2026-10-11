# Recall Desk authoring project

Edit exam.json, guide.md, roadmap.md, and project.json. Use stable question/option IDs. Replace the labeled demonstration question and source placeholders before study.

Build from the Recall Desk project:

    npm run build:study -- /absolute/path/to/this/folder

Import the resulting *.study-pack.json in either the desktop or browser app. The build generates candidate.md and answer-key.md from exam.json; do not edit those generated copies independently. Document hashes and heading links are computed and validated for you.

When updating an imported pack, increase project.json revision. If questions changed, also increase exam.json revision. Saved attempts retain their original content.

Salesforce templates intentionally contain no assumed exam weights, current release names, licensing guarantees, or pass predictions. Fill those from the applicable sources and record dates. Generic Recall Desk templates use the same evidence-based structure for any subject.
