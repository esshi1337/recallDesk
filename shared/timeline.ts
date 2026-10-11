import { z } from 'zod';

const id = z.string().min(1).max(160);
const date = z.iso.date();
const timestamp = z.iso.datetime();
export const GoalSchema = z.object({
  id, title: z.string().trim().min(1).max(200), description: z.string().default(''),
  examIds: z.array(id), examDate: date.optional(), archived: z.boolean().default(false), createdAt: timestamp
});
export const MilestoneSchema = z.object({
  id, goalId: id, title: z.string().trim().min(1).max(200), description: z.string().default(''),
  targetDate: date.optional(), status: z.enum(['planned', 'in-progress', 'completed', 'deferred']),
  completedAt: timestamp.optional(), order: z.number().int().min(0),
  targetPercent: z.number().min(0).max(100).optional(), targetAttempts: z.number().int().min(1).max(100).default(1),
  resourceRefs: z.array(z.object({ resourceId: id, headingId: z.string().optional() })).optional()
});
export const StudySessionSchema = z.object({
  id, attemptId: id, startedAt: timestamp, lastRecordedAt: timestamp, endedAt: timestamp.optional(),
  seconds: z.number().min(0), recovered: z.boolean().default(false)
});
export const ManualActivitySchema = z.object({
  id, goalId: id, title: z.string().trim().min(1).max(200),
  kind: z.enum(['reading', 'lab', 'video', 'other']), date,
  minutes: z.number().min(0).max(1440).default(0), note: z.string().default('')
});
export const EvidenceLinkSchema = z.object({ id, milestoneId: id, eventKey: z.string().min(1) });
export const TimelineDataSchema = z.object({
  goals: z.array(GoalSchema), milestones: z.array(MilestoneSchema),
  studySessions: z.array(StudySessionSchema), manualActivities: z.array(ManualActivitySchema), evidenceLinks: z.array(EvidenceLinkSchema)
});
export type Goal = z.infer<typeof GoalSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type StudySession = z.infer<typeof StudySessionSchema>;
export type ManualActivity = z.infer<typeof ManualActivitySchema>;
export type EvidenceLink = z.infer<typeof EvidenceLinkSchema>;
export type TimelineData = z.infer<typeof TimelineDataSchema>;
export const emptyTimeline = (): TimelineData => ({ goals: [], milestones: [], studySessions: [], manualActivities: [], evidenceLinks: [] });

// Calendar dates are local dates, not UTC-midnight timestamps (which can shift a day).
export function localDate(value: Date | string = new Date()): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dayNumber(value: string) { return Date.parse(`${value}T12:00:00Z`) / 86400000; }
export function shiftDate(value: string, days: number) { return new Date((dayNumber(value) + days) * 86400000).toISOString().slice(0, 10); }
