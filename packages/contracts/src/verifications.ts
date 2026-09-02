import { z } from 'zod';

export const MIN_VERIFICATION_PUBLISHED_PROJECTS = 3;

export const ADMIN_VERIFICATION_QUEUE_TAB = {
  NEW: 'new',
  RE_REVIEW: 're_review',
  ACCEPTED: 'accepted',
  CHANGES_REQUESTED: 'changes_requested',
} as const;

export const ADMIN_VERIFICATION_QUEUE_TAB_VALUES = [
  ADMIN_VERIFICATION_QUEUE_TAB.NEW,
  ADMIN_VERIFICATION_QUEUE_TAB.RE_REVIEW,
  ADMIN_VERIFICATION_QUEUE_TAB.ACCEPTED,
  ADMIN_VERIFICATION_QUEUE_TAB.CHANGES_REQUESTED,
] as const;

export const adminVerificationQueueTabSchema = z
  .enum(ADMIN_VERIFICATION_QUEUE_TAB_VALUES)
  .meta({ id: 'AdminVerificationQueueTab' });
export type AdminVerificationQueueTab = z.infer<typeof adminVerificationQueueTabSchema>;

export const VERIFICATION_APPLICATION_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
} as const;

export const VERIFICATION_APPLICATION_STATUS_VALUES = [
  VERIFICATION_APPLICATION_STATUS.DRAFT,
  VERIFICATION_APPLICATION_STATUS.PENDING,
  VERIFICATION_APPLICATION_STATUS.VERIFIED,
  VERIFICATION_APPLICATION_STATUS.REJECTED,
] as const;

export const verificationApplicationStatusSchema = z
  .enum(VERIFICATION_APPLICATION_STATUS_VALUES)
  .meta({ id: 'VerificationApplicationStatus' });
export type VerificationApplicationStatus = z.infer<typeof verificationApplicationStatusSchema>;

export const VERIFICATION_EFFECTIVE_STATUS = {
  ...VERIFICATION_APPLICATION_STATUS,
  EXPIRED: 'expired',
} as const;

export const verificationEffectiveStatusSchema = z
  .enum([...VERIFICATION_APPLICATION_STATUS_VALUES, VERIFICATION_EFFECTIVE_STATUS.EXPIRED])
  .meta({ id: 'VerificationEffectiveStatus' });
export type VerificationEffectiveStatus = z.infer<typeof verificationEffectiveStatusSchema>;

export const VERIFICATION_DOCUMENT_TYPE = {
  PERSONAL_PAN: 'personal_pan',
  AADHAAR: 'aadhaar',
  GST_REGISTRATION_CERTIFICATE: 'gst_registration_certificate',
  MSME_UDYAM_REGISTRATION: 'msme_udyam_registration',
  SHOP_ESTABLISHMENT_LICENCE: 'shop_establishment_licence',
  BUSINESS_PAN: 'business_pan',
  CERTIFICATE_OF_INCORPORATION: 'certificate_of_incorporation',
} as const;

export const VERIFICATION_DOCUMENT_TYPE_VALUES = [
  VERIFICATION_DOCUMENT_TYPE.PERSONAL_PAN,
  VERIFICATION_DOCUMENT_TYPE.AADHAAR,
  VERIFICATION_DOCUMENT_TYPE.GST_REGISTRATION_CERTIFICATE,
  VERIFICATION_DOCUMENT_TYPE.MSME_UDYAM_REGISTRATION,
  VERIFICATION_DOCUMENT_TYPE.SHOP_ESTABLISHMENT_LICENCE,
  VERIFICATION_DOCUMENT_TYPE.BUSINESS_PAN,
  VERIFICATION_DOCUMENT_TYPE.CERTIFICATE_OF_INCORPORATION,
] as const;

export const BUSINESS_VERIFICATION_DOCUMENT_TYPES = [
  VERIFICATION_DOCUMENT_TYPE.GST_REGISTRATION_CERTIFICATE,
  VERIFICATION_DOCUMENT_TYPE.MSME_UDYAM_REGISTRATION,
  VERIFICATION_DOCUMENT_TYPE.SHOP_ESTABLISHMENT_LICENCE,
  VERIFICATION_DOCUMENT_TYPE.BUSINESS_PAN,
  VERIFICATION_DOCUMENT_TYPE.CERTIFICATE_OF_INCORPORATION,
] as const;

export const PERSONAL_VERIFICATION_DOCUMENT_TYPES = [
  VERIFICATION_DOCUMENT_TYPE.PERSONAL_PAN,
  VERIFICATION_DOCUMENT_TYPE.AADHAAR,
] as const;

export const verificationDocumentTypeSchema = z
  .enum(VERIFICATION_DOCUMENT_TYPE_VALUES)
  .meta({ id: 'VerificationDocumentType' });
export type VerificationDocumentType = z.infer<typeof verificationDocumentTypeSchema>;

export const VERIFICATION_DOCUMENT_STATUS = {
  PENDING_UPLOAD: 'pending_upload',
  UPLOADED: 'uploaded',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  REMOVED: 'removed',
} as const;

export const VERIFICATION_DOCUMENT_STATUS_VALUES = [
  VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD,
  VERIFICATION_DOCUMENT_STATUS.UPLOADED,
  VERIFICATION_DOCUMENT_STATUS.VERIFIED,
  VERIFICATION_DOCUMENT_STATUS.REJECTED,
  VERIFICATION_DOCUMENT_STATUS.REMOVED,
] as const;

export const verificationDocumentStatusSchema = z
  .enum(VERIFICATION_DOCUMENT_STATUS_VALUES)
  .meta({ id: 'VerificationDocumentStatus' });
export type VerificationDocumentStatus = z.infer<typeof verificationDocumentStatusSchema>;

export const VERIFICATION_REVIEW_ACTION = {
  SUBMITTED: 'submitted',
  RESUBMITTED: 'resubmitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export const VERIFICATION_REVIEW_ACTION_VALUES = [
  VERIFICATION_REVIEW_ACTION.SUBMITTED,
  VERIFICATION_REVIEW_ACTION.RESUBMITTED,
  VERIFICATION_REVIEW_ACTION.APPROVED,
  VERIFICATION_REVIEW_ACTION.REJECTED,
] as const;

export const VERIFICATION_NOTIFICATION_EVENT = {
  APPROVED: 'verification_approved',
  CHANGES_REQUESTED: 'verification_changes_requested',
} as const;

export const VERIFICATION_NOTIFICATION_EVENT_VALUES = [
  VERIFICATION_NOTIFICATION_EVENT.APPROVED,
  VERIFICATION_NOTIFICATION_EVENT.CHANGES_REQUESTED,
] as const;

export const VERIFICATION_DOCUMENT_CONTENT_TYPE_VALUES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

export const verificationDocumentContentTypeSchema = z
  .enum(VERIFICATION_DOCUMENT_CONTENT_TYPE_VALUES)
  .meta({ id: 'VerificationDocumentContentType' });

export const verificationDocumentUploadSchema = z
  .object({
    type: verificationDocumentTypeSchema,
    contentType: verificationDocumentContentTypeSchema,
    size: z.number().int().positive(),
  })
  .meta({ id: 'VerificationDocumentUpload' });
export type VerificationDocumentUploadInput = z.infer<typeof verificationDocumentUploadSchema>;

export const verificationDocumentUploadResponseSchema = z
  .object({
    documentVersionId: z.uuid(),
    uploadUrl: z.url(),
  })
  .meta({ id: 'VerificationDocumentUploadResponse' });

export const verificationDocumentVersionParamSchema = z
  .object({ versionId: z.uuid() })
  .meta({ id: 'VerificationDocumentVersionParam' });

export const verificationDocumentSchema = z
  .object({
    id: z.uuid(),
    type: verificationDocumentTypeSchema,
    version: z.number().int().positive(),
    status: verificationDocumentStatusSchema,
    contentType: verificationDocumentContentTypeSchema,
    size: z.number().int().positive(),
    committedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
  })
  .meta({ id: 'VerificationDocument' });

const eligibilityCriterionSchema = z.object({
  met: z.boolean(),
  label: z.string(),
});

export const verificationReviewEventSchema = z
  .object({
    id: z.uuid(),
    attempt: z.number().int().positive(),
    action: z.enum(VERIFICATION_REVIEW_ACTION_VALUES),
    fromStatus: verificationApplicationStatusSchema,
    toStatus: verificationApplicationStatusSchema,
    actorLabel: z.string(),
    note: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .meta({ id: 'VerificationReviewEvent' });

export const verificationStateResponseSchema = z
  .object({
    applicationId: z.uuid(),
    status: verificationEffectiveStatusSchema,
    applicationEditable: z.boolean(),
    attempt: z.number().int().positive(),
    identity: z.object({
      ownerName: z.string(),
      ownerPhone: z.string().nullable(),
      canEdit: z.boolean(),
    }),
    permissions: z.object({ canManage: z.boolean() }),
    eligibility: z.object({
      eligible: z.boolean(),
      phoneVerified: eligibilityCriterionSchema,
      legalNamePresent: eligibilityCriterionSchema,
      businessDocumentPresent: eligibilityCriterionSchema,
      publishedProjects: eligibilityCriterionSchema.extend({
        current: z.number().int().nonnegative(),
        required: z.number().int().positive(),
      }),
    }),
    documents: z.array(verificationDocumentSchema),
    history: z.array(verificationReviewEventSchema),
    latestNote: z.string().nullable(),
    submittedAt: z.string().datetime().nullable(),
    reviewedAt: z.string().datetime().nullable(),
    approvedAt: z.string().datetime().nullable(),
    expiresAt: z.string().datetime().nullable(),
  })
  .meta({ id: 'VerificationStateResponse' });
export type VerificationStateResponse = z.infer<typeof verificationStateResponseSchema>;

export const adminVerificationQueueQuerySchema = z
  .object({
    tab: adminVerificationQueueTabSchema.default(ADMIN_VERIFICATION_QUEUE_TAB.NEW),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .meta({ id: 'AdminVerificationQueueQuery' });
export type AdminVerificationQueueQuery = z.infer<typeof adminVerificationQueueQuerySchema>;

export const verificationApplicationIdParamSchema = z
  .object({ id: z.uuid() })
  .meta({ id: 'VerificationApplicationIdParam' });

export const adminVerificationQueueItemSchema = z
  .object({
    id: z.uuid(),
    organizationId: z.string().min(1),
    organizationName: z.string().min(1),
    designerName: z.string().min(1),
    attempt: z.number().int().positive(),
    status: z.enum([
      VERIFICATION_APPLICATION_STATUS.PENDING,
      VERIFICATION_APPLICATION_STATUS.VERIFIED,
      VERIFICATION_APPLICATION_STATUS.REJECTED,
    ]),
    submittedAt: z.string().datetime(),
    reviewedAt: z.string().datetime().nullable(),
    documentCount: z.number().int().nonnegative(),
  })
  .meta({ id: 'AdminVerificationQueueItem' });

export const adminVerificationQueueResponseSchema = z
  .object({
    items: z.array(adminVerificationQueueItemSchema),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    tab: adminVerificationQueueTabSchema,
  })
  .meta({ id: 'AdminVerificationQueueResponse' });
export type AdminVerificationQueueResponse = z.infer<typeof adminVerificationQueueResponseSchema>;

export const adminVerificationDetailResponseSchema = z
  .object({
    application: z.object({
      id: z.uuid(),
      organizationId: z.string().min(1),
      organizationName: z.string().min(1),
      designerName: z.string().min(1),
      ownerName: z.string().min(1),
      ownerEmail: z.email(),
      ownerPhone: z.string().nullable(),
      status: verificationApplicationStatusSchema,
      attempt: z.number().int().positive(),
      submittedAt: z.string().datetime().nullable(),
      reviewedAt: z.string().datetime().nullable(),
      approvedAt: z.string().datetime().nullable(),
      expiresAt: z.string().datetime().nullable(),
    }),
    eligibility: z.object({
      phoneVerified: eligibilityCriterionSchema,
      publishedProjects: eligibilityCriterionSchema.extend({
        current: z.number().int().nonnegative(),
        required: z.number().int().positive(),
      }),
    }),
    documents: z.array(verificationDocumentSchema),
    history: z.array(verificationReviewEventSchema),
  })
  .meta({ id: 'AdminVerificationDetailResponse' });
export type AdminVerificationDetailResponse = z.infer<typeof adminVerificationDetailResponseSchema>;

export const rejectVerificationSchema = z
  .object({
    note: z.string().trim().min(1).max(2_000),
    rejectedDocumentVersionIds: z.array(z.uuid()).max(20).optional(),
  })
  .meta({ id: 'RejectVerification' });
export type RejectVerificationInput = z.infer<typeof rejectVerificationSchema>;

export const verificationDocumentDownloadResponseSchema = z
  .object({ downloadUrl: z.url() })
  .meta({ id: 'VerificationDocumentDownloadResponse' });
