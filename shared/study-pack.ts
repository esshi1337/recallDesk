import { z } from 'zod';
import { ExamSchema } from './model';
import { GoalSchema, MilestoneSchema } from './timeline';
import { StudyResourceSchema, documentHeadings } from './materials';
export const StudyPackSchema = z.object({
  format: z.literal('recall-desk-study-pack'), version: z.literal(1), id: z.string().min(1), title: z.string().min(1),
  revision: z.number().int().positive(), exams: z.array(ExamSchema).min(1), resources: z.array(StudyResourceSchema),
  goal: GoalSchema, milestones: z.array(MilestoneSchema), modules: z.array(MilestoneSchema), warnings: z.array(z.string()).default([])
}).superRefine((p, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  for (const rows of [p.exams, p.resources, [...p.milestones, ...p.modules]]) if (new Set(rows.map(r => r.id)).size !== rows.length) issue('Duplicate study-pack IDs.');
  if (p.goal.examIds.some(id => !p.exams.some(e => e.id === id))) issue('Goal refers to a missing exam.');
  if (p.resources.some(r => r.packId !== p.id)) issue('Resource belongs to a different pack.');
  for (const milestone of [...p.milestones, ...p.modules]) for (const ref of milestone.resourceRefs || []) {
    const resource = p.resources.find(r => r.id === ref.resourceId);
    if (resource && ref.headingId && !documentHeadings(resource.markdown).some(h => h.id === ref.headingId)) issue('Study reference points to an unknown heading.');
  }
  if ([...p.milestones, ...p.modules].some(m => m.goalId !== p.goal.id || m.status !== 'planned' || m.completedAt || (m.resourceRefs || []).some(ref => !p.resources.some(r => r.id === ref.resourceId)))) issue('Invalid study-pack milestone. Import cannot claim completed study.');
});
export type StudyPack = z.infer<typeof StudyPackSchema>;
