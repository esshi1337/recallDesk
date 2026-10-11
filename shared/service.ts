import { StudyPackSchema } from './study-pack';
import { AttemptReviewSchema, type StudyPackRecord, type StudyResource } from './materials';
import { candidateMarkdown } from './diagnostics';
import { AttemptSchema, BackupSchema, ExamSchema, SettingsSchema, createAttempt, type Attempt, type Exam, type Library, type Settings, type StartOptions } from './model';
import { GoalSchema, MilestoneSchema, ManualActivitySchema, localDate, type Goal, type Milestone, type ManualActivity, type StudySession, type EvidenceLink } from './timeline';
export const TABLES = ['exams', 'attempts', 'notes', 'settings', 'goals', 'milestones', 'study_sessions', 'manual_activities', 'evidence_links', 'resources', 'study_packs', 'attempt_reviews'] as const;
export type Table = typeof TABLES[number];
export abstract class StudyService {
  dirty = false;
  constructor(readonly directory: string, protected readonly now: () => string, protected readonly hash: (text: string) => string, protected readonly uuid: () => string) {}
  protected abstract entries<T>(table: Table): { id: string; data: T }[];
  protected all<T>(table: Table): T[] { return this.entries<T>(table).map(row => row.data); }
  protected abstract get<T>(table: Table, id: string): T | undefined;
  protected abstract put(table: Table, id: string, data: unknown): void;
  protected abstract remove(table: Table, id: string): void;
  protected abstract clear(table: Table): void;
  protected abstract transaction<T>(fn: () => T): T;
  abstract backupFiles(): string[];
  abstract backup(reason?: string): string;
  protected findOpenSession(attemptId: string) { return this.all<StudySession>('study_sessions').find(s => s.attemptId === attemptId && !s.endedAt); }
  recover() {
    this.transaction(() => {
      for (const session of this.all<StudySession>('study_sessions')) {
        if (!session.endedAt) this.put('study_sessions', session.id, { ...session, endedAt: session.lastRecordedAt, recovered: true });
      }
      for (const attempt of this.all<Attempt>('attempts')) {
        if (attempt.status === 'active') this.put('attempts', attempt.id, { ...attempt, status: 'paused' });
      }
    });
  }
  seed(exam: unknown) {
    if (!this.get('settings', 'initialized')) {
      this.put('exams', ExamSchema.parse(exam).id, ExamSchema.parse(exam));
      this.put('settings', 'initialized', true);
    }
  }
  library(): Library {
    const backups = this.backupFiles();
    return {
      exams: this.all<Exam>('exams').map(e => ExamSchema.parse(e)), attempts: this.all<Attempt>('attempts').map(a => AttemptSchema.parse(a)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      notes: Object.fromEntries(this.entries<string>('notes').map(r => [r.id, r.data])),
      settings: SettingsSchema.parse(this.get('settings', 'preferences') || {}),
      goals: this.all('goals'), milestones: this.all('milestones'), studySessions: this.all('study_sessions'), manualActivities: this.all('manual_activities'), evidenceLinks: this.all('evidence_links'),
      resources: this.all('resources'), studyPacks: this.all('study_packs'), attemptReviews: this.all('attempt_reviews'),
      dataPath: this.directory, lastBackup: backups.length ? backups.at(-1)! : null
    };
  }
  importExam(value: unknown): Exam {
    const exam = ExamSchema.parse(value);
    const existing = this.get<Exam>('exams', exam.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(exam)) {
      if (exam.revision <= existing.revision) throw new Error(`This exam already exists at revision ${existing.revision}. Increase the revision number before replacing it. Existing attempts will keep their original questions.`);
      this.backup('before-exam-update');
    }
    this.put('exams', exam.id, exam);
    return exam;
  }
  start(exam: Exam, options: StartOptions): Attempt {
    const attempt = createAttempt(ExamSchema.parse(exam), options, this.uuid());
    attempt.createdAt = this.now(); attempt.updatedAt = attempt.createdAt;
    this.transaction(() => { this.put('attempts', attempt.id, attempt); this.trackSession(undefined, attempt); });
    return attempt;
  }
  saveAttempt(value: unknown) {
    const attempt = AttemptSchema.parse(value);
    const stored = this.get<Attempt>('attempts', attempt.id);
    const existing = stored ? AttemptSchema.parse(stored) : undefined;
    if (!existing) throw new Error('This attempt no longer exists. Reopen the library.');
    if (existing.createdAt !== attempt.createdAt) throw new Error('The original attempt start time cannot change.');
    if (JSON.stringify(existing.exam) !== JSON.stringify(attempt.exam) || JSON.stringify(existing.questionOrder) !== JSON.stringify(attempt.questionOrder) || JSON.stringify(existing.optionOrder) !== JSON.stringify(attempt.optionOrder)) throw new Error('The original exam and saved ordering cannot change during an attempt.');
    if (existing.status === 'submitted') {
      if (JSON.stringify(existing) === JSON.stringify(attempt)) return;
      throw new Error('Submitted attempts are read-only. Start a new attempt to try again.');
    }
    this.transaction(() => { this.put('attempts', attempt.id, attempt); this.trackSession(existing, attempt); });
  }
  saveNote(key: string, text: string) { this.put('notes', key, text); }
  saveSettings(settings: Settings) { this.put('settings', 'preferences', SettingsSchema.parse(settings)); }
  exportData() {
    const data = this.library();
    return BackupSchema.parse({ ...data, format: 'recall-desk-backup', version: 3, createdAt: new Date().toISOString(), exams: data.exams, attempts: data.attempts, notes: data.notes, settings: data.settings });
  }
  restore(value: unknown) {
    const data = BackupSchema.parse(value);
    for (const resource of data.resources) if (this.hash(resource.markdown) !== resource.sha256) throw new Error(`Document checksum mismatch: ${resource.fileName}`);
    this.backup('before-restore');
    this.transaction(() => {
      for (const table of TABLES) if (table !== 'settings') this.clear(table);
      for (const exam of data.exams) this.put('exams', exam.id, exam);
      for (const attempt of data.attempts) this.put('attempts', attempt.id, attempt.status === 'active' ? { ...attempt, status: 'paused' } : attempt);
      for (const [key, note] of Object.entries(data.notes)) this.put('notes', key, note);
      for (const goal of data.goals) this.put('goals', goal.id, goal);
      for (const milestone of data.milestones) this.put('milestones', milestone.id, milestone);
      for (const session of data.studySessions) this.put('study_sessions', session.id, session.endedAt ? session : { ...session, endedAt: session.lastRecordedAt, recovered: true });
      for (const activity of data.manualActivities) this.put('manual_activities', activity.id, activity);
      for (const link of data.evidenceLinks) this.put('evidence_links', link.id, link);
      for (const resource of data.resources) this.put('resources', resource.id, resource);
      for (const pack of data.studyPacks) this.put('study_packs', pack.id, pack);
      for (const review of data.attemptReviews) this.put('attempt_reviews', review.attemptId, review);
      this.saveSettings(data.settings);
      this.put('settings', 'initialized', true);
    });
  }
  private trackSession(previous: Attempt | undefined, next: Attempt) {
    const now = this.now();
    let session = this.findOpenSession(next.id);
    if (next.status === 'active' && (!previous || previous.status !== 'active' || !session)) {
      session = { id: this.uuid(), attemptId: next.id, startedAt: now, lastRecordedAt: now, seconds: 0, recovered: false };
    }
    if (!session) return;
    const delta = previous?.status === 'active' ? Math.max(0, next.elapsedSeconds - previous.elapsedSeconds) : 0;
    this.put('study_sessions', session.id, { ...session, seconds: session.seconds + delta, lastRecordedAt: now, ...(next.status !== 'active' ? { endedAt: now } : {}) });
  }
  saveGoal(value: unknown) {
    const goal = GoalSchema.parse(value);
    const known = new Set([...this.all<Exam>('exams').map(e => e.id), ...this.all<Attempt>('attempts').map(a => a.exam.id)]);
    if (goal.examIds.some(id => !known.has(id))) throw new Error('A linked exam no longer exists.');
    const existing = this.get<Goal>('goals', goal.id);
    this.put('goals', goal.id, { ...goal, examIds: [...new Set(goal.examIds)], createdAt: existing?.createdAt || this.now() });
  }
  saveMilestone(value: unknown) {
    const milestone = MilestoneSchema.parse(value);
    if (!this.get('goals', milestone.goalId)) throw new Error('Goal not found.');
    const existing = this.get<Milestone>('milestones', milestone.id);
    if (existing && existing.goalId !== milestone.goalId) throw new Error('A milestone cannot move between goals.');
    const count = this.all<Milestone>('milestones').filter(m => m.goalId === milestone.goalId).reduce((n, m) => Math.max(n, m.order + 1), 0);
    this.put('milestones', milestone.id, { ...milestone, order: existing?.order ?? count, completedAt: milestone.status === 'completed' ? existing?.completedAt || this.now() : undefined });
  }
  deleteMilestone(id: string) {
    this.transaction(() => {
      this.remove('milestones', id);
      for (const link of this.all<EvidenceLink>('evidence_links').filter(l => l.milestoneId === id)) this.remove('evidence_links', link.id);
      this.dirty = true;
    });
  }
  reorderMilestones(goalId: string, ids: string[]) {
    const rows = this.all<Milestone>('milestones').filter(m => m.goalId === goalId);
    if (rows.length !== ids.length || new Set(ids).size !== ids.length || rows.some(m => !ids.includes(m.id))) throw new Error('The milestone list changed. Refresh before reordering.');
    this.transaction(() => { for (const row of rows) this.put('milestones', row.id, { ...row, order: ids.indexOf(row.id) }); });
  }
  saveManualActivity(value: unknown) {
    const activity = ManualActivitySchema.parse(value);
    if (!this.get('goals', activity.goalId)) throw new Error('Goal not found.');
    if (activity.date > localDate(this.now())) throw new Error('Actual study activity cannot be in the future. Add a planned milestone instead.');
    const existing = this.get<ManualActivity>('manual_activities', activity.id);
    if (existing && existing.goalId !== activity.goalId) throw new Error('An activity cannot move between goals.');
    this.put('manual_activities', activity.id, activity);
  }
  deleteManualActivity(id: string) {
    this.transaction(() => {
      this.remove('manual_activities', id);
      for (const link of this.all<EvidenceLink>('evidence_links').filter(l => l.eventKey === `manual:${id}`)) this.remove('evidence_links', link.id);
      this.dirty = true;
    });
  }
  linkEvidence(milestoneId: string, eventKey: string, linked: boolean) {
    const milestone = this.get<Milestone>('milestones', milestoneId);
    if (!milestone) throw new Error('Milestone not found.');
    const goal = this.get<Goal>('goals', milestone.goalId)!;
    const [kind, ...parts] = eventKey.split(':'); const eventId = parts.join(':');
    let valid = false;
    if (kind === 'manual') valid = this.get<ManualActivity>('manual_activities', eventId)?.goalId === goal.id;
    else {
      const attemptId = kind === 'session' ? this.get<StudySession>('study_sessions', eventId)?.attemptId : kind === 'attempt' ? eventId : undefined;
      const attempt = attemptId ? this.get<Attempt>('attempts', attemptId) : undefined;
      valid = !!attempt && goal.examIds.includes(attempt.exam.id);
    }
    if (!valid) throw new Error('This activity is not part of the selected goal.');
    const existing = this.all<EvidenceLink>('evidence_links').find(l => l.milestoneId === milestoneId && l.eventKey === eventKey);
    if (linked && !existing) { const id = this.uuid(); this.put('evidence_links', id, { id, milestoneId, eventKey }); }
    if (!linked && existing) { this.remove('evidence_links', existing.id); this.dirty = true; }
  }
  importStudyPack(value: unknown) {
    const pack = StudyPackSchema.parse(value);
    const existing = this.get<StudyPackRecord>('study_packs', pack.id);
    if (existing && pack.revision < existing.revision) throw new Error('An older study pack cannot replace a newer revision.');
    for (const resource of pack.resources) {
      if (this.hash(resource.markdown) !== resource.sha256) throw new Error(`Document checksum mismatch: ${resource.fileName}`);
      const stored = this.get<StudyResource>('resources', resource.id);
      if (stored && (stored.packId !== pack.id || (existing?.revision === pack.revision && stored.sha256 !== resource.sha256))) throw new Error('Changed documents require a new pack revision.');
    }
    for (const exam of pack.exams) {
      const current = this.get<Exam>('exams', exam.id);
      if (current && JSON.stringify(ExamSchema.parse(current)) !== JSON.stringify(exam) && exam.revision <= current.revision) throw new Error('Changed exam content requires a new exam revision.');
    }
    if (!existing && this.get('goals', pack.goal.id)) throw new Error('A different study goal already uses this pack goal ID.');
    for (const m of [...pack.milestones, ...pack.modules]) {
      const stored = this.get<Milestone>('milestones', m.id);
      if (stored && stored.goalId !== pack.goal.id) throw new Error('A study milestone ID belongs to a different goal.');
    }
    this.backup('before-study-pack-import');
    this.transaction(() => {
      for (const exam of pack.exams) this.put('exams', exam.id, exam);
      for (const resource of pack.resources) this.put('resources', resource.id, resource);
      if (!this.get('goals', pack.goal.id)) this.put('goals', pack.goal.id, { ...pack.goal, createdAt: this.now() });
      for (const milestone of pack.milestones) if (!this.get('milestones', milestone.id)) this.put('milestones', milestone.id, milestone);
      this.put('study_packs', pack.id, { id: pack.id, title: pack.title, revision: pack.revision, goalId: pack.goal.id, examIds: pack.exams.map(e => e.id), resourceIds: pack.resources.map(r => r.id), modules: pack.modules, importedAt: existing?.importedAt || this.now(), warnings: pack.warnings });
    });
    return pack.title;
  }
  addStudyModule(packId: string, moduleId: string) {
    const pack = this.get<StudyPackRecord>('study_packs', packId);
    const module = pack?.modules.find(m => m.id === moduleId);
    if (!module) throw new Error('Study module not found.');
    if (!this.get('milestones', moduleId)) this.saveMilestone(module);
    return module.id;
  }
  saveAttemptReview(value: unknown) {
    const review = AttemptReviewSchema.parse(value);
    const attempt = this.get<Attempt>('attempts', review.attemptId);
    if (!attempt || attempt.status !== 'submitted') throw new Error('Submit the attempt before excluding items from diagnostic totals.');
    if (review.excludedQuestionIds.some(id => !attempt.questionOrder.includes(id))) throw new Error('Unknown review question.');
    this.put('attempt_reviews', review.attemptId, { ...review, excludedQuestionIds: [...new Set(review.excludedQuestionIds)] });
  }
  exportAttempt(id: string) {
    const attempt = this.get<Attempt>('attempts', id);
    if (!attempt) throw new Error('Attempt not found.');
    return candidateMarkdown(AttemptSchema.parse(attempt));
  }
}
