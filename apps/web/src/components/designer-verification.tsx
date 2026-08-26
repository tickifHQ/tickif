'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  BUSINESS_VERIFICATION_DOCUMENT_TYPES,
  PERSONAL_VERIFICATION_DOCUMENT_TYPES,
  VERIFICATION_APPLICATION_STATUS,
  VERIFICATION_DOCUMENT_STATUS,
  VERIFICATION_DOCUMENT_TYPE,
  type VerificationDocumentType,
  type VerificationStateResponse,
} from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/dialog';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { TipCallout } from '@repo/ui/components/tip-callout';
import { cn } from '@repo/ui/lib/utils';
import { CircleAlert, PencilLine, Phone, UserRound } from 'lucide-react';
import {
  DetailHeading,
  DocumentTypeSelect,
  FileUploadArea,
  FileUploadCard,
  InReviewStatusBadge,
  Requirement,
  ResubmitAlertIcon,
  ResubmitStatusBadge,
  UploadedStatusBadge,
  VerificationBenefits,
  verificationDocumentLabel as documentLabel,
  VerificationSection,
  VerifiedIdentityRow,
  VerifiedStatusBadge,
  documentDisplay,
  localFileDisplay,
  type UploadDisplay,
  type VerificationDocument,
} from '@/components/designer-verification-ui';
import { OtpVerificationPanel } from '@/components/otp-verification-panel';
import {
  countries,
  normalizePhoneInput,
  PhoneNumberInput,
  toE164PhoneNumber,
  type Country,
} from '@/components/phone-number-input';
import { authClient } from '@/lib/auth-client';
import { UserFacingError, userFacingErrorMessage } from '@/lib/user-facing-error';
import {
  fetchVerificationState,
  removeVerificationDocument,
  submitVerification,
  uploadVerificationDocument,
} from '@/lib/verification-api';

const businessDocumentTypes = new Set<VerificationDocumentType>(
  BUSINESS_VERIFICATION_DOCUMENT_TYPES,
);
const supportingDocumentTypes = new Set<VerificationDocumentType>(
  PERSONAL_VERIFICATION_DOCUMENT_TYPES,
);

type BusyAction =
  | 'business-upload'
  | 'identity-save'
  | 'otp-send'
  | 'otp-verify'
  | 'document-remove'
  | 'submit'
  | 'supporting-upload'
  | null;

function hasCompletedPersonalIdentity(state: VerificationStateResponse): boolean {
  return state.eligibility.phoneVerified.met && state.eligibility.legalNamePresent.met;
}

export function DesignerVerification({
  initialLoadError = null,
  initialState,
}: {
  initialLoadError?: string | null;
  initialState: VerificationStateResponse | null;
}) {
  const initialPhone = normalizePhoneInput(initialState?.identity.ownerPhone ?? '', countries[0]!);
  const [verificationState, setVerificationState] = useState(initialState);
  const [selectedCountry, setSelectedCountry] = useState<Country>(initialPhone.country);
  const [phone, setPhone] = useState(initialPhone.phone);
  const [ownerName, setOwnerName] = useState(initialState?.identity.ownerName ?? '');
  const [documentType, setDocumentType] = useState<VerificationDocumentType>(
    VERIFICATION_DOCUMENT_TYPE.MSME_UDYAM_REGISTRATION,
  );
  const [supportingDocumentType, setSupportingDocumentType] = useState<VerificationDocumentType>(
    VERIFICATION_DOCUMENT_TYPE.PERSONAL_PAN,
  );
  const [isEditingPhone, setIsEditingPhone] = useState(
    !initialState?.eligibility.phoneVerified.met,
  );
  const [isEditingIdentityDetails, setIsEditingIdentityDetails] = useState(
    initialState ? !hasCompletedPersonalIdentity(initialState) : false,
  );
  const ownerNameInputRef = useRef<HTMLInputElement>(null);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [pendingBusinessUpload, setPendingBusinessUpload] = useState<UploadDisplay | null>(null);
  const [pendingSupportingUpload, setPendingSupportingUpload] = useState<UploadDisplay | null>(
    null,
  );
  const [documentPendingRemoval, setDocumentPendingRemoval] = useState<VerificationDocument | null>(
    null,
  );
  const [error, setError] = useState<string | null>(initialLoadError);

  useEffect(() => {
    setVerificationState(initialState);
    setError(initialLoadError);
    setPendingBusinessUpload(null);
    setPendingSupportingUpload(null);
    setDocumentPendingRemoval(null);
    setOtpSent(false);
    setOtp(['', '', '', '', '', '']);

    if (!initialState) return;

    const nextPhone = normalizePhoneInput(initialState.identity.ownerPhone ?? '', countries[0]!);
    setSelectedCountry(nextPhone.country);
    setPhone(nextPhone.phone);
    setOwnerName(initialState.identity.ownerName);
    setIsEditingPhone(!initialState.eligibility.phoneVerified.met);
    setIsEditingIdentityDetails(!hasCompletedPersonalIdentity(initialState));
  }, [initialLoadError, initialState]);

  if (!verificationState) {
    return (
      <div className="mx-auto w-full max-w-7xl p-6">
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error ?? 'Could not load verification details.'}</AlertDescription>
        </Alert>
        <Button
          type="button"
          className="mt-4"
          onClick={async () => {
            setError(null);
            try {
              setVerificationState(await fetchVerificationState());
            } catch {
              setError('Could not load verification details.');
            }
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const state = verificationState;
  const personalIdentityVerified = hasCompletedPersonalIdentity(state);
  const approvedProjects = Math.min(
    state.eligibility.publishedProjects.required,
    Math.max(0, state.eligibility.publishedProjects.current),
  );
  const requiredProjects = state.eligibility.publishedProjects.required;
  const projectsVerified = state.eligibility.publishedProjects.met;
  const businessDocuments = state.documents.filter((document) =>
    businessDocumentTypes.has(document.type),
  );
  const sortedBusinessDocuments = [...businessDocuments].sort((left, right) => {
    const priority = {
      [VERIFICATION_DOCUMENT_STATUS.VERIFIED]: 0,
      [VERIFICATION_DOCUMENT_STATUS.UPLOADED]: 1,
      [VERIFICATION_DOCUMENT_STATUS.REJECTED]: 2,
      [VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD]: 3,
      [VERIFICATION_DOCUMENT_STATUS.REMOVED]: 4,
    };
    return priority[left.status] - priority[right.status];
  });
  const primaryBusinessDocument = sortedBusinessDocuments[0];
  const supportingDocument = state.documents.find((document) =>
    supportingDocumentTypes.has(document.type),
  );
  const businessDocumentVerified = sortedBusinessDocuments.some(
    (document) => document.status === VERIFICATION_DOCUMENT_STATUS.VERIFIED,
  );
  const businessDocumentPresent = state.eligibility.businessDocumentPresent.met;
  const applicationPending = state.status === VERIFICATION_APPLICATION_STATUS.PENDING;
  const applicationVerified = state.status === VERIFICATION_APPLICATION_STATUS.VERIFIED;
  const needsRejectedBusinessDocument =
    state.status === VERIFICATION_APPLICATION_STATUS.REJECTED && !businessDocumentPresent;
  const applicationEditable = state.applicationEditable;
  const canManage = state.permissions.canManage && applicationEditable;
  const enteredPhone = phone ? `${selectedCountry.code} ${phone}` : 'Account owner phone';
  const persistedPhone = normalizePhoneInput(state.identity.ownerPhone ?? '', countries[0]!);
  const verifiedPhone = persistedPhone.phone
    ? `${persistedPhone.country.code} ${persistedPhone.phone}`
    : 'Account owner phone';
  const verifiedPhoneDescription = state.identity.ownerPhone
    ? `${verifiedPhone} · OTP verified`
    : state.eligibility.phoneVerified.met
      ? 'Verified by the account owner'
      : 'Account owner phone';
  const phoneNumberIsValid = toE164PhoneNumber(selectedCountry, phone) !== null;

  async function refreshState() {
    const nextState = await fetchVerificationState();
    setVerificationState(nextState);
    setOwnerName(nextState.identity.ownerName);
    const nextPhone = normalizePhoneInput(nextState.identity.ownerPhone ?? '', selectedCountry);
    setSelectedCountry(nextPhone.country);
    setPhone(nextPhone.phone);
    return nextState;
  }

  async function runAction(action: Exclude<BusyAction, null>, operation: () => Promise<void>) {
    setBusyAction(action);
    setError(null);
    try {
      await operation();
    } catch (actionError) {
      setError(userFacingErrorMessage(actionError, 'Something went wrong. Please try again.'));
    } finally {
      setBusyAction(null);
    }
  }

  function handleSendOtp() {
    void runAction('otp-send', async () => {
      const normalizedPhone = toE164PhoneNumber(selectedCountry, phone);
      if (!normalizedPhone)
        throw new UserFacingError(`Enter a valid phone number for ${selectedCountry.name}.`);
      const result = await authClient.phoneNumber.sendOtp({ phoneNumber: normalizedPhone });
      if (result.error) throw new UserFacingError(result.error.message || 'Could not send OTP.');
      setOtp(['', '', '', '', '', '']);
      setOtpSent(true);
    });
  }

  function handleVerifyOtp() {
    void runAction('otp-verify', async () => {
      const normalizedPhone = toE164PhoneNumber(selectedCountry, phone);
      if (!normalizedPhone)
        throw new UserFacingError(`Enter a valid phone number for ${selectedCountry.name}.`);
      const code = otp.join('');
      if (code.length !== 6) throw new UserFacingError('Enter the full 6-digit OTP.');
      const result = await authClient.phoneNumber.verify({
        phoneNumber: normalizedPhone,
        code,
        updatePhoneNumber: true,
      });
      if (result.error)
        throw new UserFacingError(result.error.message || 'Invalid or expired OTP.');
      const nextState = await refreshState();
      setIsEditingIdentityDetails(!hasCompletedPersonalIdentity(nextState));
      setOtpSent(false);
      setIsEditingPhone(false);
    });
  }

  function handleCancelOtp() {
    setOtpSent(false);
    setOtp(['', '', '', '', '', '']);
    setError(null);
  }

  function handleSaveOwnerName() {
    void runAction('identity-save', async () => {
      const name = ownerName.trim();
      if (name.length < 2 || name.length > 100) {
        throw new UserFacingError('Enter the account owner’s full legal name.');
      }
      const result = await authClient.updateUser({ name });
      if (result.error)
        throw new UserFacingError(result.error.message || 'Could not save the owner name.');
      const nextState = await refreshState();
      setIsEditingIdentityDetails(!hasCompletedPersonalIdentity(nextState));
    });
  }

  function handleDocumentUpload(kind: 'business' | 'supporting', file: File) {
    const type = kind === 'business' ? documentType : supportingDocumentType;
    const setPending = kind === 'business' ? setPendingBusinessUpload : setPendingSupportingUpload;
    const action = kind === 'business' ? 'business-upload' : 'supporting-upload';
    setPending(localFileDisplay(file));
    void runAction(action, async () => {
      try {
        const nextState = await uploadVerificationDocument(type, file);
        setVerificationState(nextState);
      } finally {
        setPending(null);
      }
    });
  }

  function handleRemoveDocument() {
    if (!documentPendingRemoval) return;
    const versionId = documentPendingRemoval.id;
    void runAction('document-remove', async () => {
      const nextState = await removeVerificationDocument(versionId);
      setVerificationState(nextState);
      setDocumentPendingRemoval(null);
    });
  }

  function requestDocumentRemoval(document: VerificationDocument) {
    setError(null);
    setDocumentPendingRemoval(document);
  }

  function handleSubmit() {
    void runAction('submit', async () => {
      setVerificationState(await submitVerification());
    });
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Get Verified</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Three steps. Most studios finish in under 10 minutes. Only documents you actually have, no
          unnecessary paperwork.
        </p>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2.55fr)_minmax(17rem,1fr)]">
        <div className="space-y-4">
          <VerificationSection
            title="Personal identity"
            description="Your phone number is OTP-verified and tied to your Aadhaar-linked mobile. No separate upload needed."
            status={personalIdentityVerified ? <VerifiedStatusBadge /> : null}
          >
            {!applicationEditable ? (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="border-b border-border p-5">
                  <VerifiedIdentityRow
                    title="Phone number"
                    description={verifiedPhoneDescription}
                    icon={<Phone className="size-4" aria-hidden="true" />}
                  />
                </div>
                <div className="p-5">
                  <VerifiedIdentityRow
                    title="Account owner"
                    description={`${state.identity.ownerName} · Account owner`}
                    icon={<UserRound className="size-4" aria-hidden="true" />}
                  />
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="space-y-5 border-b border-border p-5">
                  <DetailHeading
                    title="Phone number"
                    description={
                      state.eligibility.phoneVerified.met
                        ? verifiedPhoneDescription
                        : 'Verify your mobile number'
                    }
                    icon={<Phone className="size-4" aria-hidden="true" />}
                    action={
                      state.identity.canEdit && state.eligibility.phoneVerified.met ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setIsEditingPhone(true)}
                          aria-label="Edit phone number"
                        >
                          <PencilLine className="size-4" aria-hidden="true" />
                        </Button>
                      ) : null
                    }
                  />
                  {state.identity.canEdit && isEditingPhone ? (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <PhoneNumberInput
                          id="verification-phone"
                          phone={phone}
                          placeholder="9843211210"
                          selectedCountry={selectedCountry}
                          onPhoneChange={setPhone}
                          onSelectedCountryChange={setSelectedCountry}
                          showDialCode={false}
                          wrapperClassName="min-w-0 flex-1"
                          inputClassName="h-9"
                          countryButtonClassName="h-9"
                          disabled={busyAction !== null}
                        />
                        <Button
                          type="button"
                          variant="inverted"
                          size="compact"
                          className="w-full sm:w-32"
                          onClick={handleSendOtp}
                          disabled={busyAction !== null || !phoneNumberIsValid}
                        >
                          {busyAction === 'otp-send'
                            ? 'Sending…'
                            : otpSent
                              ? 'Resend OTP'
                              : 'Get OTP'}
                        </Button>
                      </div>
                    </div>
                  ) : !state.identity.canEdit && !state.eligibility.phoneVerified.met ? (
                    <p className="text-xs text-muted-foreground">
                      Only the organization owner can verify the account phone number.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2.5 p-5">
                  <DetailHeading
                    title="Account owner"
                    description="Match the name registered to your OTP-verified mobile / PAN"
                    icon={<UserRound className="size-4" aria-hidden="true" />}
                  />
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label
                        htmlFor="verification-owner-name"
                        className="text-[13px] text-muted-foreground"
                      >
                        Account owner - Full legal name
                      </Label>
                      {state.identity.canEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label="Edit account owner and supporting ID"
                          aria-controls="supporting-identity-fields"
                          aria-expanded={isEditingIdentityDetails}
                          onClick={() => {
                            setIsEditingIdentityDetails(true);
                            ownerNameInputRef.current?.focus();
                          }}
                        >
                          <PencilLine className="size-4" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        ref={ownerNameInputRef}
                        id="verification-owner-name"
                        value={ownerName}
                        onChange={(event) => setOwnerName(event.target.value)}
                        className="h-8"
                        disabled={!state.identity.canEdit || busyAction !== null}
                        readOnly={!isEditingIdentityDetails}
                        maxLength={100}
                      />
                      {state.identity.canEdit && ownerName.trim() !== state.identity.ownerName ? (
                        <Button
                          type="button"
                          size="compact"
                          onClick={handleSaveOwnerName}
                          disabled={busyAction !== null}
                        >
                          {busyAction === 'identity-save' ? 'Saving…' : 'Save'}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {isEditingIdentityDetails || !personalIdentityVerified ? (
                    <div id="supporting-identity-fields" className="space-y-1">
                      <Label htmlFor="supporting-id" className="text-[13px] text-muted-foreground">
                        Supporting ID
                      </Label>
                      {pendingSupportingUpload ? (
                        <FileUploadCard file={pendingSupportingUpload} size="compact" />
                      ) : supportingDocument ? (
                        <FileUploadCard
                          file={documentDisplay(supportingDocument)}
                          size="compact"
                          onRemove={
                            canManage && state.identity.canEdit
                              ? () => requestDocumentRemoval(supportingDocument)
                              : undefined
                          }
                          removeLabel={`Remove ${documentLabel(supportingDocument.type)}`}
                          removing={
                            busyAction === 'document-remove' &&
                            documentPendingRemoval?.id === supportingDocument.id
                          }
                        />
                      ) : (
                        <div className="space-y-2">
                          <div className="flex gap-2" aria-label="Supporting ID type">
                            {[
                              { label: 'PAN', value: VERIFICATION_DOCUMENT_TYPE.PERSONAL_PAN },
                              { label: 'Aadhaar', value: VERIFICATION_DOCUMENT_TYPE.AADHAAR },
                            ].map((option) => (
                              <Button
                                key={option.value}
                                type="button"
                                variant={
                                  supportingDocumentType === option.value ? 'default' : 'outline'
                                }
                                size="compact"
                                onClick={() => setSupportingDocumentType(option.value)}
                                disabled={!state.identity.canEdit || busyAction !== null}
                              >
                                {option.label}
                              </Button>
                            ))}
                          </div>
                          <FileUploadArea
                            id="supporting-id"
                            description="Add PAN or Aadhaar to confirm the name faster"
                            onFile={(file) => handleDocumentUpload('supporting', file)}
                            disabled={!state.identity.canEdit || busyAction !== null}
                          />
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </VerificationSection>

          <VerificationSection
            title="One business document"
            description="Upload whichever one you have. Any single document is enough to confirm your studio is a real business entity."
            status={
              businessDocumentVerified ? (
                <VerifiedStatusBadge />
              ) : primaryBusinessDocument?.status === VERIFICATION_DOCUMENT_STATUS.REJECTED ? (
                <ResubmitStatusBadge note={state.latestNote} />
              ) : applicationPending ? (
                <InReviewStatusBadge />
              ) : businessDocumentPresent ? (
                <UploadedStatusBadge />
              ) : null
            }
          >
            {applicationPending ? (
              <div className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
                {sortedBusinessDocuments.length > 0 ? (
                  sortedBusinessDocuments.map((document) => (
                    <FileUploadCard
                      key={document.id}
                      file={documentDisplay(document)}
                      showCompletionStatus={false}
                    />
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    The submitted document could not be displayed. Refresh the page or contact
                    support if this continues.
                  </p>
                )}
              </div>
            ) : businessDocumentVerified ? (
              <div className="space-y-2 p-4">
                {sortedBusinessDocuments.map((document) => (
                  <FileUploadCard
                    key={document.id}
                    file={documentDisplay(document)}
                    showCompletionStatus={false}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
                {businessDocumentPresent ? null : (
                  <DocumentTypeSelect
                    value={documentType}
                    onValueChange={setDocumentType}
                    disabled={!canManage || busyAction !== null}
                  />
                )}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <Label
                      htmlFor="business-document"
                      className="text-[13px] text-muted-foreground"
                    >
                      Upload document
                    </Label>
                    {primaryBusinessDocument?.status === VERIFICATION_DOCUMENT_STATUS.REJECTED ? (
                      <span
                        role="status"
                        className="flex items-center gap-1 text-[13px] font-medium text-destructive"
                      >
                        <ResubmitAlertIcon className="size-4" />
                        Resubmit document
                      </span>
                    ) : null}
                  </div>
                  {canManage && !businessDocumentPresent ? (
                    <FileUploadArea
                      id="business-document"
                      description="Drag and drop files here or click to upload"
                      onFile={(file) => handleDocumentUpload('business', file)}
                      disabled={busyAction !== null}
                    />
                  ) : !canManage ? (
                    <p className="text-xs text-muted-foreground">
                      Only an organization owner or admin can upload verification documents.
                    </p>
                  ) : null}
                  {pendingBusinessUpload ? <FileUploadCard file={pendingBusinessUpload} /> : null}
                  {sortedBusinessDocuments.map((document) => (
                    <FileUploadCard
                      key={document.id}
                      file={documentDisplay(document)}
                      onRemove={canManage ? () => requestDocumentRemoval(document) : undefined}
                      removeLabel={`Remove ${documentLabel(document.type)}`}
                      removing={
                        busyAction === 'document-remove' &&
                        documentPendingRemoval?.id === document.id
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </VerificationSection>

          <VerificationSection
            title="3 approved projects on Homefolio"
            description="Your actual work is the strongest proof you're a real designer. Projects you've already uploaded count automatically."
            status={projectsVerified ? <VerifiedStatusBadge /> : null}
          >
            <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <div
                  className="flex gap-1.5"
                  aria-label={`${approvedProjects} of ${requiredProjects} projects approved`}
                >
                  {Array.from({ length: requiredProjects }, (_, index) => (
                    <span
                      key={index}
                      className={cn(
                        'h-2 w-9 rounded-full',
                        index < approvedProjects ? 'bg-success' : 'bg-muted',
                      )}
                    />
                  ))}
                </div>
                <span className="font-mono text-[13px] font-medium uppercase">
                  {approvedProjects} / {requiredProjects} approved
                </span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {projectsVerified ? (
                  `You have ${requiredProjects} approved live projects.`
                ) : (
                  <>
                    You have {approvedProjects} approved live projects. Upload{' '}
                    {requiredProjects - approvedProjects} more and get it approved to complete this
                    step.{' '}
                    <Link
                      href="/designer/projects/upload"
                      className="font-medium text-primary underline underline-offset-2"
                    >
                      Upload a project →
                    </Link>
                  </>
                )}
              </p>
            </div>
          </VerificationSection>

          {applicationVerified ? null : (
            <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
              <ul className="space-y-1.5">
                <Requirement complete={personalIdentityVerified}>
                  Identity confirmed at signup
                </Requirement>
                <Requirement complete={businessDocumentPresent}>
                  Upload one business document
                </Requirement>
                <Requirement complete={projectsVerified}>
                  {requiredProjects} approved projects (you have {approvedProjects})
                </Requirement>
              </ul>
              {applicationPending ? (
                <>
                  <TipCallout variant="info">
                    Once you submit, the admin team reviews within 2–5 business days. They may ask
                    for a quick clarification on your document; you&apos;ll get a notification if
                    they do. Approved documents don&apos;t need to be re-submitted.
                  </TipCallout>
                  <Button type="button" className="w-full" disabled>
                    Submitted
                  </Button>
                </>
              ) : (
                <>
                  <TipCallout variant="info">
                    Once you submit, the admin team reviews within 2–5 business days. They may ask
                    for a quick clarification on your document; you&apos;ll get a notification if
                    they do. Approved documents don&apos;t need to be re-submitted.
                  </TipCallout>
                  <Button
                    type="button"
                    variant={needsRejectedBusinessDocument ? 'outline' : 'default'}
                    size={needsRejectedBusinessDocument ? 'sm' : 'default'}
                    className={cn(
                      'w-full',
                      needsRejectedBusinessDocument &&
                        'border-border bg-muted text-[13px] leading-[1.1] text-muted-foreground shadow-none disabled:opacity-100',
                    )}
                    onClick={handleSubmit}
                    disabled={
                      needsRejectedBusinessDocument ||
                      !state.eligibility.eligible ||
                      !canManage ||
                      busyAction !== null
                    }
                  >
                    {busyAction === 'submit'
                      ? 'Submitting…'
                      : state.status === VERIFICATION_APPLICATION_STATUS.REJECTED &&
                          !needsRejectedBusinessDocument
                        ? 'Resubmit for verification'
                        : 'Submit for verification'}
                  </Button>
                </>
              )}
            </section>
          )}
          {error && !documentPendingRemoval ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <VerificationBenefits
          businessDocumentPresent={businessDocumentPresent}
          publishedProjectCount={approvedProjects}
          personalIdentityVerified={personalIdentityVerified}
          requiredProjectCount={requiredProjects}
          projectsVerified={projectsVerified}
        />
      </div>
      <Dialog
        open={otpSent}
        onOpenChange={(open) => {
          if (!open) handleCancelOtp();
        }}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-surface-inverse/20 backdrop-blur-sm"
          className="max-w-lg gap-0 overflow-hidden rounded-xl p-0 shadow-xl"
        >
          <DialogTitle className="sr-only">Enter verification code</DialogTitle>
          <DialogDescription className="sr-only">
            Enter the six digit code sent to your phone number.
          </DialogDescription>
          <OtpVerificationPanel
            code={otp}
            sentTo={enteredPhone}
            onCodeChange={(value) => {
              setOtp(value);
              setError(null);
            }}
            onVerify={handleVerifyOtp}
            onResend={handleSendOtp}
            onCancel={handleCancelOtp}
            loading={busyAction !== null}
            resendDisabled={busyAction !== null}
            verifyLabel="Verify"
            error={error}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={documentPendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open && busyAction !== 'document-remove') {
            setDocumentPendingRemoval(null);
            setError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove document?</DialogTitle>
            <DialogDescription>
              {documentPendingRemoval
                ? `Remove ${documentLabel(documentPendingRemoval.type)} from this verification application? You can upload a replacement before submitting.`
                : null}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDocumentPendingRemoval(null)}
              disabled={busyAction === 'document-remove'}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRemoveDocument}
              disabled={busyAction === 'document-remove'}
            >
              {busyAction === 'document-remove' ? 'Removing…' : 'Remove document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
