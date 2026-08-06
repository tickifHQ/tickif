import {
  profileCompletionResponseSchema,
  profileOwnerResponseSchema,
  type ProfileCompletionResponse,
  type ProfileOwnerResponse,
  type UpdateProfileInput,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { handleApiResponse } from '@/lib/api-response';

export async function updateDesignerProfile(
  input: UpdateProfileInput,
): Promise<ProfileOwnerResponse> {
  const response = await api.api.profiles.me.$patch({ json: input });
  return handleApiResponse(
    response,
    profileOwnerResponseSchema,
    'Could not save profile settings.',
    'The saved profile response was invalid. Please refresh.',
  );
}

export async function fetchProfileCompletion(): Promise<ProfileCompletionResponse> {
  const response = await api.api.profiles.me.completion.$get();
  return handleApiResponse(
    response,
    profileCompletionResponseSchema,
    'Could not refresh profile completion.',
    'The profile completion response was invalid.',
  );
}
