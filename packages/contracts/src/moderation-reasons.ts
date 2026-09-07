import { z } from 'zod';

export const MODERATION_REASON_CODE_VALUES = [
  'project-details',
  'image-quality',
  'image-authenticity',
  'room-tagging',
  'project-ownership',
  'budget-scope-clarity',
  'duplicate-content',
  'other',
] as const;

export const moderationReasonCodeSchema = z
  .enum(MODERATION_REASON_CODE_VALUES)
  .meta({ id: 'ModerationReasonCode' });
export type ModerationReasonCode = z.infer<typeof moderationReasonCodeSchema>;

export const moderationReasonCodesSchema = z
  .array(moderationReasonCodeSchema)
  .max(8)
  .refine((codes) => new Set(codes).size === codes.length, 'Select each category only once')
  .meta({ id: 'ModerationReasonCodes' });

export const MODERATION_REASON_OPTIONS = [
  {
    value: 'project-details',
    label: 'Project details',
    description: 'Complete or correct the project details highlighted by the review team.',
  },
  {
    value: 'image-quality',
    label: 'Image quality',
    description: 'Use clear, well-lit images that show the completed work.',
  },
  {
    value: 'image-authenticity',
    label: 'Image authenticity',
    description:
      'Provide original images of the actual project and address the authenticity concerns in the note.',
  },
  {
    value: 'room-tagging',
    label: 'Room tagging',
    description: 'Assign each photo to the correct room and check its tags.',
  },
  {
    value: 'project-ownership',
    label: 'Project ownership',
    description:
      'Clarify your studio’s role in the project and provide the requested ownership evidence.',
  },
  {
    value: 'budget-scope-clarity',
    label: 'Budget/scope clarity',
    description: 'Clarify the project budget and what the scope of work includes.',
  },
  {
    value: 'duplicate-content',
    label: 'Duplicate content',
    description:
      'Remove duplicate content or explain how this project differs from the existing listing.',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Follow the review team’s note before submitting again.',
  },
] as const satisfies readonly { value: ModerationReasonCode; label: string; description: string }[];

/** Compatibility for historical free-text codes; new inputs always use the closed schema. */
export function normalizeModerationReasonCode(code: string | null): ModerationReasonCode | null {
  if (code === null) return null;
  const parsed = moderationReasonCodeSchema.safeParse(code);
  return parsed.success ? parsed.data : 'other';
}
