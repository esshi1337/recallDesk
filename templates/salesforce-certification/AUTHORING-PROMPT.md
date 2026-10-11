# Reusable authoring brief

Prepare a Recall Desk study pack for: Salesforce certification starter.

Use this folder's project.json, exam.json, guide.md, and roadmap.md as the format. Ask for the applicable outline and source material if they have not been provided. For Salesforce, record the exact certification, official guide version/date, release alignment, and relevant edition/license/identity assumptions. Never transplant another certification's weights or timing.

Create original, source-backed questions, one general explanation per item, and option-specific explanations where the source supports them. Retain stable question IDs. Distinguish documented facts from reasoning examples and uncertain claims. Do not invent citations or fill source gaps with confident guesses.

Create a focused reference guide with contrasts, worked examples, and small practical checks. Create an adaptive, undated roadmap with observable outcomes and optional repair modules. Do not label topics mastered from one correct answer or infer a certification pass probability. Record K/R/G confidence, familiarity, and reasoning through the diagnostic workflow.

Replace the demonstration question and template placeholders. Update titles and warnings when the content is no longer a starter. Keep answer keys out of the candidate document. Generate candidate.md and answer-key.md from exam.json using the build command instead of maintaining two separate question copies.

Run npm run build:study -- /path/to/this/folder from the Recall Desk repository. Check the output question count, correct-answer references, objective coverage, roadmap heading links, and checksums. Report missing source material and any unverified product claims. Preserve existing learner attempts and milestone completion; import a revised pack rather than restoring over the library.
