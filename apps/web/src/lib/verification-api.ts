import {
  verificationDocumentContentTypeSchema,
  verificationDocumentUploadResponseSchema,
  verificationStateResponseSchema,
  type VerificationDocumentType,
  type VerificationStateResponse,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { handleApiResponse } from '@/lib/api-response';

const LOAD_ERROR = 'Could not load verification details.';

export async function fetchVerificationState(
  headers?: Record<string, string>,
): Promise<VerificationStateResponse> {
  const response = await api.api.verifications.$get({}, headers ? { headers } : undefined);
  return handleApiResponse(response, verificationStateResponseSchema, LOAD_ERROR);
}

export async function uploadVerificationDocument(
  type: VerificationDocumentType,
  file: File,
): Promise<VerificationStateResponse> {
  const contentType = verificationDocumentContentTypeSchema.safeParse(file.type);
  if (!contentType.success) {
    throw new Error('Upload a PDF, JPEG, or PNG file.');
  }

  const presignResponse = await api.api.verifications.documents['upload-url'].$post({
    json: { type, contentType: contentType.data, size: file.size },
  });
  const reservation = await handleApiResponse(
    presignResponse,
    verificationDocumentUploadResponseSchema,
    'Could not prepare the document upload.',
  );

  try {
    const storageResponse = await fetch(reservation.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType.data },
      body: file,
    });
    if (!storageResponse.ok) throw new Error('Could not upload the document.');

    const commitResponse = await api.api.verifications.documents[':versionId'].commit.$post({
      param: { versionId: reservation.documentVersionId },
    });
    return await handleApiResponse(
      commitResponse,
      verificationStateResponseSchema,
      'Could not finish the document upload.',
    );
  } catch (error) {
    await api.api.verifications.documents[':versionId']
      .$delete({ param: { versionId: reservation.documentVersionId } })
      .catch(() => undefined);
    throw error;
  }
}

export async function removeVerificationDocument(
  versionId: string,
): Promise<VerificationStateResponse> {
  const response = await api.api.verifications.documents[':versionId'].$delete({
    param: { versionId },
  });
  return handleApiResponse(
    response,
    verificationStateResponseSchema,
    'Could not remove the verification document.',
  );
}

export async function submitVerification(): Promise<VerificationStateResponse> {
  const response = await api.api.verifications.submit.$post();
  return handleApiResponse(
    response,
    verificationStateResponseSchema,
    'Could not submit verification.',
  );
}
