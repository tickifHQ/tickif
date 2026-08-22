import { describe, expect, it } from 'vitest';
import {
  BUSINESS_VERIFICATION_DOCUMENT_TYPES,
  VERIFICATION_DOCUMENT_TYPE,
  rejectVerificationSchema,
  verificationDocumentUploadSchema,
} from '../src/verifications.js';

describe('verification contracts', () => {
  it('keeps the supported business-document set closed and typed', () => {
    expect(BUSINESS_VERIFICATION_DOCUMENT_TYPES).toContain(
      VERIFICATION_DOCUMENT_TYPE.GST_REGISTRATION_CERTIFICATE,
    );
    expect(BUSINESS_VERIFICATION_DOCUMENT_TYPES).not.toContain(
      VERIFICATION_DOCUMENT_TYPE.AADHAAR as never,
    );
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
});
