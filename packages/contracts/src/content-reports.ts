import { z } from 'zod';

export const PROJECT_REPORT_REASON_VALUES = [
  'spam',
  'misleading',
  'inappropriate',
  'copyright',
  'other',
] as const;

export const projectReportReasonSchema = z
  .enum(PROJECT_REPORT_REASON_VALUES)
  .meta({ id: 'ProjectReportReason' });
export type ProjectReportReason = z.infer<typeof projectReportReasonSchema>;

export const createProjectReportSchema = z
  .object({
    reason: projectReportReasonSchema,
    details: z.string().trim().min(10).max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.reason === 'other' && !value.details) {
      context.addIssue({
        code: 'custom',
        path: ['details'],
        message: 'Tell us what is wrong with this project.',
      });
    }
  })
  .meta({ id: 'CreateProjectReport' });
export type CreateProjectReportInput = z.infer<typeof createProjectReportSchema>;

export const projectReportResponseSchema = z
  .object({
    projectId: z.uuid(),
    reported: z.literal(true),
  })
  .meta({ id: 'ProjectReportResponse' });
export type ProjectReportResponse = z.infer<typeof projectReportResponseSchema>;
