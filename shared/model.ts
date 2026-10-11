import { z } from 'zod';
import type { TemplateRequest } from './templates';
import { MaterialDataSchema, emptyMaterials, type MaterialData, type AttemptReview } from './materials';
import { TimelineDataSchema, emptyTimeline, type TimelineData, type Goal, type Milestone, type ManualActivity } from './timeline';

const id = z.string().min(1).max(160);
export const QuestionSchema = z.object({
  id, type: z.enum(['single-choice', 'multiple-choice']), prompt: z.string().min(1),
  tags: z.array(z.string()).default([]),
  options: z.array(z.object({ id, text: z.string().min(1), explanation: z.string().default('') })).min(2),
  correctOptionIds: z.array(id).min(1), explanation: z.string().min(1),
  selectCount: z.number().int().positive().optional(), shuffleOptions: z.boolean().default(true),
  sources: z.array(z.string()).default([]), section: z.string().optional(), objective: z.string().optional(), diagnosticTopic: z.string().optional()
}).superRefine((q, ctx) => {
  const ids = new Set(q.options.map(o => o.id));
  if (ids.size !== q.options.length) ctx.addIssue({ code: 'custom', message: 'Option IDs must be unique.' });
  if (new Set(q.correctOptionIds).size !== q.correctOptionIds.length || q.correctOptionIds.some(x => !ids.has(x))) ctx.addIssue({ code: 'custom', message: 'Correct answers must reference unique, existing option IDs.' });
  if (q.type === 'single-choice' && q.correctOptionIds.length !== 1) ctx.addIssue({ code: 'custom', message: 'Single-choice questions need exactly one correct answer.' });
  if (q.selectCount !== undefined && q.selectCount !== q.correctOptionIds.length) ctx.addIssue({ code: 'custom', message: 'selectCount must equal the number of correct answers.' });
});
export const ExamSchema = z.object({
  schemaVersion: z.literal(1), id, revision: z.number().int().positive(), title: z.string().min(1),
  description: z.string().default(''), certification: z.string().default(''),
  instructions: z.string().optional(), diagnostic: z.boolean().optional(), sourceCatalog: z.string().optional(),
  questions: z.array(QuestionSchema).min(1),
  passingPercent: z.number().min(0).max(100).default(70),
  timeLimitMinutes: z.number().int().min(1).max(1440).optional()
}).superRefine((exam, ctx) => {
  if (new Set(exam.questions.map(q => q.id)).size !== exam.questions.length) ctx.addIssue({ code: 'custom', message: 'Question IDs must be unique.' });
});
export type Exam = z.infer<typeof ExamSchema>;
export type Question = Exam['questions'][number];
export const ResponseSchema = z.object({
  selected: z.array(id).default([]), eliminated: z.array(id).default([]),
  flagged: z.boolean().default(false), note: z.string().default(''), revealed: z.boolean().default(false), confidence: z.enum(['K', 'R', 'G']).nullable().optional(), familiar: z.boolean().nullable().optional()
});
export type Response = z.infer<typeof ResponseSchema>;
export const AttemptSchema = z.object({
  id, exam: ExamSchema, status: z.enum(['active', 'paused', 'submitted']),
  createdAt: z.string(), updatedAt: z.string(), submittedAt: z.string().optional(),
  questionOrder: z.array(id).min(1), optionOrder: z.record(z.string(), z.array(id)),
  responses: z.record(z.string(), ResponseSchema), currentIndex: z.number().int().min(0),
  outsideHelp: z.string().optional(),
  elapsedSeconds: z.number().min(0), timeLimitSeconds: z.number().positive().optional()
}).superRefine((a, ctx) => {
  const qs = new Map(a.exam.questions.map(q => [q.id, q]));
  const order = new Set(a.questionOrder);
  if (order.size !== a.questionOrder.length || a.questionOrder.some(q => !qs.has(q)) || a.currentIndex >= a.questionOrder.length) ctx.addIssue({ code: 'custom', message: 'Invalid attempt question order or position.' });
  for (const qid of a.questionOrder) {
    const q = qs.get(qid); if (!q) continue;
    const ids = new Set(q.options.map(o => o.id));
    const options = a.optionOrder[qid] || [];
    if (new Set(options).size !== ids.size || options.length !== ids.size || options.some(o => !ids.has(o))) ctx.addIssue({ code: 'custom', message: 'Invalid saved option order.' });
    const response = a.responses[qid];
    if (!response || [...response.selected, ...response.eliminated].some(o => !ids.has(o)) || new Set(response.selected).size !== response.selected.length || (q.type === 'single-choice' && response.selected.length > 1) || response.selected.some(o => response.eliminated.includes(o))) ctx.addIssue({ code: 'custom', message: 'Invalid saved response.' });
  }
});
export type Attempt = z.infer<typeof AttemptSchema>;
export const SettingsSchema = z.object({ theme: z.enum(['light', 'dark']).default('dark'), fontSize: z.number().min(14).max(24).default(17), resumeOnLaunch: z.boolean().default(true) });
export type Settings = z.infer<typeof SettingsSchema>;
const BackupBase = z.object({
  format: z.literal('recall-desk-backup'), createdAt: z.string(),
  exams: z.array(ExamSchema), attempts: z.array(AttemptSchema),
  notes: z.record(z.string(), z.string()), settings: SettingsSchema
});
export const BackupSchema = z.union([
  BackupBase.extend({ version: z.literal(3), ...TimelineDataSchema.shape, ...MaterialDataSchema.shape }),
  BackupBase.extend({ version: z.literal(2), ...TimelineDataSchema.shape }).transform(b => ({ ...b, version: 3 as const, ...emptyMaterials() })),
  BackupBase.extend({ version: z.literal(1) }).transform(b => ({ ...b, version: 3 as const, ...emptyTimeline(), ...emptyMaterials() }))
]).superRefine((b, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  for (const rows of [b.exams, b.attempts, b.goals, b.milestones, b.studySessions, b.manualActivities, b.evidenceLinks, b.resources, b.studyPacks]) {
    if (new Set(rows.map(r => r.id)).size !== rows.length) issue('Backup contains duplicate IDs.');
  }
  if (new Set(b.attemptReviews.map(r => r.attemptId)).size !== b.attemptReviews.length) issue('Duplicate attempt reviews.');
  for (const r of b.attemptReviews) { const a = b.attempts.find(a => a.id === r.attemptId); if (!a || r.excludedQuestionIds.some(id => !a.questionOrder.includes(id))) issue('Invalid diagnostic review.'); }
  const resourceIds = new Set(b.resources.map(r => r.id));
  const packIds = new Set(b.studyPacks.map(p => p.id));
  if (b.resources.some(r => !packIds.has(r.packId))) issue('Study document refers to a missing pack.');
  for (const p of b.studyPacks) if (!b.goals.some(g => g.id === p.goalId) || p.resourceIds.some(id => !resourceIds.has(id)) || p.examIds.some(id => !b.exams.some(e => e.id === id))) issue('Study pack refers to missing resources, exams, or goal.');
  const goalIds = new Set(b.goals.map(g => g.id));
  const attemptIds = new Set(b.attempts.map(a => a.id));
  const milestoneIds = new Set(b.milestones.map(m => m.id));
  const eventKeys = new Set([...b.attempts.map(a => `attempt:${a.id}`), ...b.studySessions.map(s => `session:${s.id}`), ...b.manualActivities.map(a => `manual:${a.id}`)]);
  if (b.milestones.some(m => !goalIds.has(m.goalId)) || b.manualActivities.some(a => !goalIds.has(a.goalId))) issue('Timeline item refers to a missing goal.');
  if (b.studySessions.some(s => !attemptIds.has(s.attemptId))) issue('Study session refers to a missing attempt.');
  if (b.evidenceLinks.some(l => !milestoneIds.has(l.milestoneId) || !eventKeys.has(l.eventKey))) issue('Evidence link refers to a missing milestone or activity.');
});
export type Backup = z.infer<typeof BackupSchema>;
export type Library = TimelineData & MaterialData & { exams: Exam[]; attempts: Attempt[]; notes: Record<string, string>; settings: Settings; dataPath: string; lastBackup: string | null };
export type StartOptions = { questionIds?: string[]; shuffleQuestions: boolean; shuffleOptions: boolean; limit?: number; minutes?: number; outsideHelp?: string };
export const emptyResponse = (): Response => ({ selected: [], eliminated: [], flagged: false, note: '', revealed: false });
export const noteKey = (examId: string, questionId: string) => JSON.stringify([examId, questionId]);
export function isCorrect(q: Question, response: Response) {
  return response.selected.length === q.correctOptionIds.length && response.selected.every(id => q.correctOptionIds.includes(id));
}
export function score(a: Attempt, excludedIds: string[] = []) {
  const questions = a.questionOrder.filter(id => !excludedIds.includes(id)).map(id => a.exam.questions.find(q => q.id === id)!);
  const correct = questions.filter(q => isCorrect(q, a.responses[q.id])).length;
  return { correct, total: questions.length, percent: questions.length ? Math.round(100 * correct / questions.length) : 0, passed: !a.exam.diagnostic && questions.length > 0 && 100 * correct / questions.length >= a.exam.passingPercent, revealed: questions.filter(q => a.responses[q.id].revealed).length };
}
function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function createAttempt(exam: Exam, options: StartOptions, attemptId: string): Attempt {
  let questions = exam.questions.filter(q => !options.questionIds || options.questionIds.includes(q.id));
  if (options.shuffleQuestions) questions = shuffle(questions);
  if (options.limit) questions = questions.slice(0, options.limit);
  if (!questions.length) throw new Error('Choose at least one question.');
  const now = new Date().toISOString();
  return AttemptSchema.parse({
    id: attemptId, exam: structuredClone(exam), ...(options.outsideHelp ? { outsideHelp: options.outsideHelp } : {}), status: 'active', createdAt: now, updatedAt: now,
    questionOrder: questions.map(q => q.id),
    optionOrder: Object.fromEntries(questions.map(q => [q.id, (options.shuffleOptions && q.shuffleOptions ? shuffle(q.options) : q.options).map(o => o.id)])),
    responses: Object.fromEntries(questions.map(q => [q.id, emptyResponse()])), currentIndex: 0,
    elapsedSeconds: 0, ...(options.minutes ? { timeLimitSeconds: options.minutes * 60 } : {})
  });
}
export interface DesktopAPI {
  exportTemplate(request: TemplateRequest): Promise<boolean>;
  listLocalBackups?(): Promise<string[]>;
  restoreLocalBackup?(id: string): Promise<boolean>;
  library(): Promise<Library>;
  saveGoal(goal: Goal): Promise<void>;
  saveMilestone(milestone: Milestone): Promise<void>;
  deleteMilestone(id: string): Promise<void>;
  reorderMilestones(goalId: string, ids: string[]): Promise<void>;
  saveManualActivity(activity: ManualActivity): Promise<void>;
  deleteManualActivity(id: string): Promise<void>;
  linkEvidence(milestoneId: string, eventKey: string, linked: boolean): Promise<void>;
  importStudyPack(): Promise<string | null>;
  exportAttempt(attemptId: string): Promise<boolean>;
  saveAttemptReview(review: AttemptReview): Promise<void>;
  addStudyModule(packId: string, moduleId: string): Promise<string>;
  openReference(url: string): Promise<void>;
  importExam(): Promise<string | null>;
  exportExam(exam: Exam): Promise<boolean>;
  start(exam: Exam, options: StartOptions): Promise<Attempt>;
  saveAttempt(attempt: Attempt): Promise<void>;
  saveNote(key: string, text: string): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  backup(): Promise<string>;
  exportBackup(): Promise<boolean>;
  restoreBackup(): Promise<boolean>;
  openDataFolder(): Promise<void>;
  onBeforeClose(callback: () => void | Promise<void>): () => void;
  readyToClose(): void;
}
