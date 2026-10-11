import { z } from 'zod';
import { MilestoneSchema } from './timeline';
const id = z.string().min(1).max(160);
export const StudyResourceSchema = z.object({
  id, packId: id, title: z.string().min(1), kind: z.enum(['guide', 'roadmap', 'candidate', 'answer-key']),
  fileName: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), markdown: z.string().min(1)
});
export const StudyPackRecordSchema = z.object({
  id, title: z.string().min(1), revision: z.number().int().positive(), goalId: id,
  examIds: z.array(id), resourceIds: z.array(id), modules: z.array(MilestoneSchema),
  importedAt: z.string(), warnings: z.array(z.string()).default([])
});
export const AttemptReviewSchema = z.object({ attemptId: id, excludedQuestionIds: z.array(id), note: z.string().default('') });
export const MaterialDataSchema = z.object({ resources: z.array(StudyResourceSchema), studyPacks: z.array(StudyPackRecordSchema), attemptReviews: z.array(AttemptReviewSchema) });
export type StudyResource = z.infer<typeof StudyResourceSchema>;
export type StudyPackRecord = z.infer<typeof StudyPackRecordSchema>;
export type AttemptReview = z.infer<typeof AttemptReviewSchema>;
export type MaterialData = z.infer<typeof MaterialDataSchema>;
export const emptyMaterials = (): MaterialData => ({ resources: [], studyPacks: [], attemptReviews: [] });
export function documentHeadings(markdown: string) {
  let fence = ''; const headings: { id: string; title: string; level: number }[] = [];
  for (const line of markdown.split('\n')) {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) { if (!fence) fence = f[1][0]; else if (f[1][0] === fence) fence = ''; continue; }
    if (fence) continue;
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (match) headings.push({ id: `heading-${headings.length}`, title: match[2].replace(/[*`]/g, ''), level: match[1].length });
  }
  return headings;
}
