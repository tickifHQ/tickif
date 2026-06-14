import { z } from 'zod';

/** A single onboarding checklist step. */
export const completionStepSchema = z.object({
  key: z.string(),
  label: z.string(),
  done: z.boolean(),
});
export type CompletionStep = z.infer<typeof completionStepSchema>;

/** Response shape for GET /api/profiles/me/completion */
export const profileCompletionResponseSchema = z
  .object({
    steps: z.array(completionStepSchema),
    score: z.number().int().min(0).max(100),
    missing: z.array(z.string()),
  })
  .meta({ id: 'ProfileCompletion' });
export type ProfileCompletionResponse = z.infer<typeof profileCompletionResponseSchema>;

// --- Onboarding (E-35) ---

/**
 * POST /api/profiles/me — designer onboarding request.
 *
 * Note: locality validation is deferred because taxonomy_kind currently has no
 * 'locality' kind. When added (under taxonomy epic #6), localityIds can be
 * appended to this contract without breaking changes.
 */
export const onboardDesignerSchema = z
  .object({
    entityType: z.enum(['individual', 'company']),
    userName: z.string().trim().min(2).max(100),
    companyName: z.string().trim().min(2).max(100).optional(),
    bio: z.string().max(500).optional(),
    cityIds: z.array(z.string().uuid()).max(5).default([]),
    scopeIds: z.array(z.string().uuid()).max(10).default([]),
    themeIds: z.array(z.string().uuid()).max(10).default([]),
  })
  .refine((d) => d.entityType === 'individual' || !!d.companyName, {
    message: 'companyName is required for company entity type',
    path: ['companyName'],
  });
export type OnboardDesignerInput = z.infer<typeof onboardDesignerSchema>;

/** POST /api/profiles/me — onboarding response. */
export const onboardDesignerResponseSchema = z
  .object({
    profile: z.object({
      id: z.string().uuid(),
      orgId: z.string(),
      displayName: z.string(),
      entityType: z.enum(['individual', 'company']),
      status: z.string(),
      createdAt: z.string(),
    }),
    organization: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
    }),
  })
  .meta({ id: 'OnboardDesignerResponse' });
export type OnboardDesignerResponse = z.infer<typeof onboardDesignerResponseSchema>;
