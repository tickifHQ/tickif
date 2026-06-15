import type { CompletionStep, ProfileCompletionResponse } from '@repo/contracts';
import { profilesRepository, type DesignerProfileRecord } from './repository.js';

/**
 * Profile completion use-cases. Business logic lives here — no Hono, no Drizzle.
 *
 * The completion response powers the designer-dashboard onboarding checklist.
 *
 * Important distinction:
 * - `steps` = onboarding checklist (broad lifecycle steps for the UI)
 * - `score` = profile field completion percentage (name, bio, city, scope, logo, contact)
 * - `missing` = which profile fields are still incomplete
 */

/** Minimum score (0–100) to pass the publishing gate. */
const COMPLETION_THRESHOLD = 60;

/** The required profile fields that drive the completion score. */
const REQUIRED_FIELDS = ['display-name', 'bio', 'logo', 'city', 'scope', 'contact'] as const;
type RequiredField = (typeof REQUIRED_FIELDS)[number];

type CompletionInput = {
  userId: string;
  orgId: string | null;
};

type FieldCheckResult = {
  filled: RequiredField[];
  missing: RequiredField[];
};

export const profilesService = {
  async getCompletion(input: CompletionInput): Promise<ProfileCompletionResponse> {
    // Resolve orgId if not provided
    const orgId = input.orgId ?? (await profilesRepository.hasOrganization(input.userId));

    // Fetch profile ONCE and thread through (avoids duplicate DB hits)
    const profile = orgId ? await profilesRepository.findByOrgId(orgId) : null;

    // Parallelize independent reads
    const [hasGoogle, hasProject, fieldCheck] = await Promise.all([
      profilesRepository.hasGoogleAccount(input.userId),
      profile ? profilesRepository.hasProject(profile.id) : Promise.resolve(false),
      this._checkProfileFields(input.userId, profile),
    ]);

    // Build steps
    const steps: CompletionStep[] = [
      {
        key: 'signed-in-with-google',
        label: 'Sign in with Google',
        done: hasGoogle,
      },
      {
        key: 'org-created',
        label: 'Create your organization',
        done: !!orgId,
      },
      {
        key: 'profile-completed',
        label: 'Complete your profile',
        done: fieldCheck.missing.length === 0,
      },
      {
        key: 'first-project-uploaded',
        label: 'Upload your first project',
        done: hasProject,
      },
    ];

    // Score is based on profile FIELDS, not steps
    const score = Math.round(
      (fieldCheck.filled.length / REQUIRED_FIELDS.length) * 100,
    );

    return { steps, score, missing: fieldCheck.missing };
  },

  /**
   * Gating helper for the publishing flow. Returns pass: true if score meets
   * threshold, or a reason string explaining what's missing.
   */
  async isComplete(input: CompletionInput): Promise<{ pass: boolean; reason?: string }> {
    const result = await profilesService.getCompletion(input);
    if (result.score >= COMPLETION_THRESHOLD) {
      return { pass: true };
    }
    return {
      pass: false,
      reason: `Profile completion ${result.score}% is below the required ${COMPLETION_THRESHOLD}%. Missing: ${result.missing.join(', ')}`,
    };
  },

  /**
   * Check which required profile fields are filled vs missing.
   * Accepts an already-fetched profile to avoid redundant DB queries.
   */
  async _checkProfileFields(
    userId: string,
    profile: DesignerProfileRecord | null,
  ): Promise<FieldCheckResult> {
    if (!profile) {
      return { filled: [], missing: [...REQUIRED_FIELDS] };
    }

    // Parallelize the async checks (city count, scope count, contact)
    const [cityCount, scopeCount, hasContact] = await Promise.all([
      profilesRepository.countFootprintByKind(profile.id, 'city'),
      profilesRepository.countFootprintByKind(profile.id, 'scope'),
      profilesRepository.hasContact(userId),
    ]);

    const filled: RequiredField[] = [];
    const missing: RequiredField[] = [];

    if (profile.displayName.trim().length > 0) filled.push('display-name');
    else missing.push('display-name');

    if (profile.bio) filled.push('bio');
    else missing.push('bio');

    if (profile.logoImageId) filled.push('logo');
    else missing.push('logo');

    if (cityCount >= 1) filled.push('city');
    else missing.push('city');

    if (scopeCount >= 1) filled.push('scope');
    else missing.push('scope');

    if (hasContact) filled.push('contact');
    else missing.push('contact');

    return { filled, missing };
  },
};
