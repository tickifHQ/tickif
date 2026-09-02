import {
  adminVerificationDetailResponseSchema,
  adminVerificationQueueResponseSchema,
  verificationDocumentDownloadResponseSchema,
  type AdminVerificationDetailResponse,
  type AdminVerificationQueueResponse,
  type AdminVerificationQueueTab,
  type RejectVerificationInput,
  type RevokeVerificationInput,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { handleApiResponse } from '@/lib/api-response';

type ServerRequestInit = { headers: { cookie: string } };

const QUEUE_ERROR = 'Could not load submitted verifications.';
const DETAIL_ERROR = 'Could not load this verification application.';

export async function fetchAdminVerificationQueue(
  tab: AdminVerificationQueueTab,
  page = 1,
  requestInit?: ServerRequestInit,
): Promise<AdminVerificationQueueResponse> {
  const response = await api.api.admin.verifications.$get(
    { query: { tab, page: String(page), limit: '20' } },
    requestInit,
  );
  return handleApiResponse(response, adminVerificationQueueResponseSchema, QUEUE_ERROR);
}

export async function fetchAdminVerificationDetail(
  applicationId: string,
): Promise<AdminVerificationDetailResponse> {
  const response = await api.api.admin.verifications[':id'].$get({
    param: { id: applicationId },
  });
  return handleApiResponse(response, adminVerificationDetailResponseSchema, DETAIL_ERROR);
}

export async function fetchAdminVerificationDocumentUrl(
  applicationId: string,
  documentVersionId: string,
): Promise<string> {
  const response = await api.api.admin.verifications[':id'].documents[':versionId'].download.$get({
    param: { id: applicationId, versionId: documentVersionId },
  });
  const payload = await handleApiResponse(
    response,
    verificationDocumentDownloadResponseSchema,
    'Could not open this verification document.',
  );
  return payload.downloadUrl;
}

export async function approveAdminVerification(
  applicationId: string,
): Promise<AdminVerificationDetailResponse> {
  const response = await api.api.admin.verifications[':id'].approve.$post({
    param: { id: applicationId },
  });
  return handleApiResponse(
    response,
    adminVerificationDetailResponseSchema,
    'Could not approve this verification.',
  );
}

export async function rejectAdminVerification(
  applicationId: string,
  input: RejectVerificationInput,
): Promise<AdminVerificationDetailResponse> {
  const response = await api.api.admin.verifications[':id'].reject.$post({
    param: { id: applicationId },
    json: input,
  });
  return handleApiResponse(
    response,
    adminVerificationDetailResponseSchema,
    'Could not request verification changes.',
  );
}

export async function revokeAdminVerification(
  applicationId: string,
  input: RevokeVerificationInput,
): Promise<AdminVerificationDetailResponse> {
  const response = await api.api.admin.verifications[':id'].revoke.$post({
    param: { id: applicationId },
    json: input,
  });
  return handleApiResponse(
    response,
    adminVerificationDetailResponseSchema,
    'Could not revoke this verification approval.',
  );
}
