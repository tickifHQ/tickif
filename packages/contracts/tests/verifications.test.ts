import { describe, expect, it } from 'vitest';
import {
  ADMIN_VERIFICATION_QUEUE_TAB,
  BUSINESS_VERIFICATION_DOCUMENT_TYPES,
  PERSONAL_VERIFICATION_DOCUMENT_TYPES,
  VERIFICATION_DOCUMENT_TYPE,
  adminVerificationQueueQuerySchema,
  rejectVerificationSchema,
  revokeVerificationSchema,
  verificationDocumentUploadSchema,
} from '../src/verifications.js';

describe('verification contracts', () => {
  it('keeps admin verification queue tabs closed and defaults to new submissions', () => {
    expect(adminVerificationQueueQuerySchema.parse({})).toMatchObject({
      tab: ADMIN_VERIFICATION_QUEUE_TAB.NEW,
      page: 1,
      limit: 20,
    });
    expect(
      [
        ADMIN_VERIFICATION_QUEUE_TAB.NEW,
        ADMIN_VERIFICATION_QUEUE_TAB.RE_REVIEW,
        ADMIN_VERIFICATION_QUEUE_TAB.ACCEPTED,
        ADMIN_VERIFICATION_QUEUE_TAB.CHANGES_REQUESTED,
      ].every((tab) => adminVerificationQueueQuerySchema.safeParse({ tab }).success),
    ).toBe(true);
    expect(adminVerificationQueueQuerySchema.safeParse({ tab: 'draft' }).success).toBe(false);
  });

  it('keeps the supported business-document set closed and typed', () => {
    expect(BUSINESS_VERIFICATION_DOCUMENT_TYPES).toContain(
      VERIFICATION_DOCUMENT_TYPE.GST_REGISTRATION_CERTIFICATE,
    );
    expect(BUSINESS_VERIFICATION_DOCUMENT_TYPES).not.toContain(
      VERIFICATION_DOCUMENT_TYPE.AADHAAR as never,
    );
  });

  it('keeps personal identity document types shared across clients and services', () => {
    expect(PERSONAL_VERIFICATION_DOCUMENT_TYPES).toEqual([
      VERIFICATION_DOCUMENT_TYPE.PERSONAL_PAN,
      VERIFICATION_DOCUMENT_TYPE.AADHAAR,
    ]);
  });

  it('accepts only private-document MIME types supported by v1', () => {
    expect(
      verificationDocumentUploadSchema.safeParse({
        type: VERIFICATION_DOCUMENT_TYPE.BUSINESS_PAN,
        contentType: 'application/pdf',
        size: 1000,
      }).success,
    ).toBe(true);
    expect(
      verificationDocumentUploadSchema.safeParse({
        type: VERIFICATION_DOCUMENT_TYPE.BUSINESS_PAN,
        contentType: 'image/svg+xml',
        size: 1000,
      }).success,
    ).toBe(false);
  });

  it('requires a user-visible rejection note', () => {
    expect(
      rejectVerificationSchema.safeParse({ note: 'Please upload a clearer copy.' }).success,
    ).toBe(true);
    expect(rejectVerificationSchema.safeParse({ note: '  ' }).success).toBe(false);
  });

  it('requires a reason when revoking an approval', () => {
    expect(
      revokeVerificationSchema.safeParse({ note: 'Identity details need another review.' }).success,
    ).toBe(true);
    expect(revokeVerificationSchema.safeParse({ note: '  ' }).success).toBe(false);
  });
});
