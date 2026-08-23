'use client';

import Link from 'next/link';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import {
  VERIFICATION_APPLICATION_STATUS,
  VERIFICATION_DOCUMENT_STATUS,
  VERIFICATION_DOCUMENT_TYPE,
  VERIFICATION_EFFECTIVE_STATUS,
  type VerificationDocumentType,
  type VerificationStateResponse,
} from '@repo/contracts';
import { AnimatedCollapsibleContent } from '@repo/ui/components/animated-collapsible-content';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Badge } from '@repo/ui/components/badge';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@repo/ui/components/tooltip';
import { cn } from '@repo/ui/lib/utils';
import {
  CheckCircle2,
  Check,
  ChevronsUpDown,
  CircleAlert,
  CircleDashed,
  CloudUpload,
  Eye,
  FileUp,
  FileText,
  Info,
  ListChecks,
  LoaderCircle,
  PencilLine,
  Phone,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { OtpVerificationPanel } from '@/components/otp-verification-panel';
import {
  countries,
  normalizePhoneInput,
  PhoneNumberInput,
  toE164PhoneNumber,
  type Country,
} from '@/components/phone-number-input';
import { authClient } from '@/lib/auth-client';
import {
  fetchVerificationState,
  removeVerificationDocument,
  submitVerification,
  uploadVerificationDocument,
} from '@/lib/verification-api';

const documentOptions = [
  {
    value: VERIFICATION_DOCUMENT_TYPE.GST_REGISTRATION_CERTIFICATE,
    label: 'GST Registration Certificate',
    description:
      'GSTIN certificate from the GST portal. Only if your studio is registered. It is not required if you are below the ₹20L threshold.',
    badge: { label: 'Most common', tone: 'success' },
  },
  {
    value: VERIFICATION_DOCUMENT_TYPE.MSME_UDYAM_REGISTRATION,
    label: 'MSME Registration',
    selectedLabel: 'MSME certificate',
    description:
      'Free registration at udyamregistration.gov.in. Most design studios qualify. Strongly recommended if you do not have GST.',
    badge: { label: 'Free · 10 mins online', tone: 'info' },
  },
  {
    value: VERIFICATION_DOCUMENT_TYPE.SHOP_ESTABLISHMENT_LICENCE,
    label: 'Shop & Establishment Licence',
    description:
      'Tamil Nadu shops and establishment registration from your local municipal corporation. Used by studios with a physical office address.',
  },
  {
    value: VERIFICATION_DOCUMENT_TYPE.BUSINESS_PAN,
    label: 'PAN Card',
    description:
      'For sole proprietors, your personal PAN is also your business PAN. Partnerships and firms may use the firm PAN.',
  },
  {
    value: VERIFICATION_DOCUMENT_TYPE.CERTIFICATE_OF_INCORPORATION,
    label: 'Certificate of Incorporation',
    description:
      'Certificate issued by the Ministry of Corporate Affairs. Only applicable if your studio is a registered company or LLP.',
    badge: { label: 'For Pvt. Ltd. / LLP only', tone: 'neutral' },
  },
] as const;

function DocumentTypeSelect({
  disabled = false,
  onValueChange,
  value,
}: {
  disabled?: boolean;
  onValueChange: (value: VerificationDocumentType) => void;
  value: VerificationDocumentType;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = documentOptions.find((option) => option.value === value);

  return (
    <div className="space-y-1">
      <Label className="text-[13px] text-muted-foreground">Select document type</Label>
      <button
        type="button"
        role="combobox"
        aria-controls="document-type-options"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Select document type"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-left text-xs shadow-xs outline-none transition-colors hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span
          className={cn('truncate', selectedOption ? 'text-foreground' : 'text-muted-foreground')}
        >
          {selectedOption && 'selectedLabel' in selectedOption
            ? selectedOption.selectedLabel
            : (selectedOption?.label ?? 'Choose document to upload')}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      <AnimatedCollapsibleContent open={open}>
        <div
          id="document-type-options"
          role="listbox"
          aria-label="Document types"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
          className="space-y-1 rounded-md border border-border bg-card p-2 shadow-xs"
        >
          {documentOptions.map((option) => {
            const selected = option.value === value;

            return (
              <button
                type="button"
                role="option"
                aria-selected={selected}
                key={option.value}
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2 rounded-lg p-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-background shadow-xs',
                    selected && 'border-primary bg-primary text-primary-foreground',
                  )}
                >
                  {selected ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      {option.label}
                    </span>
                    {'badge' in option ? (
                      <Badge
                        shape="square"
                        size="compact"
                        variant="secondary"
                        className={cn(
                          'rounded-md px-2 py-1 text-[11px] font-normal',
                          option.badge.tone === 'success' && 'bg-success-lighter text-success',
                          option.badge.tone === 'info' && 'bg-info/10 text-info',
                          option.badge.tone === 'neutral' && 'bg-muted text-muted-foreground',
                        )}
                      >
                        {option.badge.label}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="block text-xs leading-snug whitespace-normal text-foreground-disabled">
                    {option.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </AnimatedCollapsibleContent>
    </div>
  );
}

type UploadDisplay = {
  format: string;
  name: string;
  progress: number;
  sizeKb: number;
};

function ResubmitAlertIcon({ className }: { className?: string }) {
  return (
    <CircleAlert
      className={cn(
        'shrink-0 fill-destructive text-destructive-foreground [&>circle]:stroke-destructive [&>path]:stroke-destructive-foreground',
        className,
      )}
      aria-hidden="true"
    />
  );
}

function VerifiedStatusBadge() {
  return (
    <Badge
      variant="secondary"
      shape="square"
      size="compact"
      className="rounded-md bg-success-lighter pl-1 pr-2 text-[13px] leading-[1.1] font-medium text-success [&_svg]:size-4"
    >
      <CheckCircle2
        className="fill-success text-success-foreground [&>circle]:stroke-success [&>path]:stroke-success-foreground"
        aria-hidden="true"
      />
      Verified
    </Badge>
  );
}

function ResubmitStatusBadge({ note }: { note: string | null }) {
  return (
    <>
      <Badge
        variant="secondary"
        shape="square"
        size="compact"
        className="rounded-md bg-destructive/10 pl-1 pr-2 text-[13px] leading-[1.1] font-medium text-destructive [&_svg]:size-4"
      >
        <ResubmitAlertIcon />
        Resubmit
      </Badge>
      {note ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="View resubmission reason"
              className="rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Info className="size-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            hideArrow
            side="right"
            sideOffset={8}
            className="max-w-xs border border-border bg-background px-3 py-2 text-left text-foreground shadow-lg"
          >
            <p className="font-medium">Changes needed:</p>
            <p className="mt-1 leading-relaxed text-muted-foreground">{note}</p>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </>
  );
}

function VerificationSection({
  children,
  description,
  status,
  title,
}: {
  children: ReactNode;
  description: string;
  status?: ReactNode;
  title: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section className="rounded-2xl bg-muted/30 p-1">
      {status ? <div className="flex items-center gap-1 px-2 pt-2">{status}</div> : null}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start gap-2 p-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-relaxed font-medium text-foreground">{title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <ChevronsUpDown className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      <AnimatedCollapsibleContent open={open}>{children}</AnimatedCollapsibleContent>
    </section>
  );
}

function DetailHeading({
  action,
  description,
  icon,
  title,
}: {
  action?: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-success/20 bg-success-lighter text-success">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-[13px] leading-tight font-medium text-foreground">{title}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  );
}

function VerifiedIdentityRow({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-success/20 bg-success-lighter text-success">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-[13px] leading-normal font-semibold text-foreground">{title}</h3>
        <p className="text-xs leading-normal text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function FileUploadArea({
  description,
  disabled = false,
  id,
  onFile,
}: {
  description: string;
  disabled?: boolean;
  id: string;
  onFile: (file: File) => void;
}) {
  function acceptFile(file: File | undefined) {
    if (file) onFile(file);
  }

  return (
    <label
      htmlFor={id}
      className={cn(
        'flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-strong bg-muted/25 px-8 py-6 text-center transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/50',
      )}
      onDragOver={(event) => {
        if (!disabled) event.preventDefault();
      }}
      onDrop={(event: DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        if (!disabled) acceptFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        id={id}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="sr-only"
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => acceptFile(event.target.files?.[0])}
      />
      <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
        <CloudUpload className="size-4" aria-hidden="true" />
        <span>Upload Files</span>
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
    </label>
  );
}

function FileUploadCard({
  file,
  onRemove,
  removeLabel,
  removing = false,
  showCompletionStatus = true,
  size = 'regular',
}: {
  file: UploadDisplay;
  onRemove?: () => void;
  removeLabel?: string;
  removing?: boolean;
  showCompletionStatus?: boolean;
  size?: 'compact' | 'regular';
}) {
  const completed = file.progress === 100;
  const compact = size === 'compact';

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card',
        compact ? 'space-y-1 py-1.5 pl-2 pr-2.5' : 'space-y-2 px-3 py-2.5',
      )}
    >
      <div className={cn('flex items-center', compact ? 'gap-2.5' : 'gap-3')}>
        <div
          className={cn(
            'relative flex shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground',
            compact ? 'size-8' : 'size-10',
          )}
        >
          <FileText className={compact ? 'size-5' : 'size-6'} aria-hidden="true" />
          <span
            className={cn(
              'absolute -left-1 rounded bg-destructive px-1 py-0.5 leading-none font-semibold text-destructive-foreground',
              compact ? '-bottom-0.5 text-[8px]' : '-bottom-0.5 text-[9px]',
            )}
          >
            {file.format}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn('truncate font-medium text-foreground', compact ? 'text-xs' : 'text-sm')}
          >
            {file.name}
          </p>
          <div
            className={cn(
              'flex flex-wrap items-center gap-1 text-muted-foreground',
              compact ? 'text-[11px]' : 'text-xs',
            )}
          >
            <span>
              {completed ? file.sizeKb : 0} KB of {file.sizeKb} KB
            </span>
            {completed && (compact || !showCompletionStatus) ? null : completed ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <span className="flex size-3.5 items-center justify-center rounded-full bg-success text-success-foreground">
                    <Check className="size-2.5" strokeWidth={3} aria-hidden="true" />
                  </span>
                  Completed
                </span>
              </>
            ) : (
              <>
                <span aria-hidden="true">·</span>
                <LoaderCircle
                  className="size-3.5 animate-spin text-info motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <span>Uploading...</span>
              </>
            )}
          </div>
        </div>
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive',
              compact ? 'size-8' : 'size-9',
            )}
            aria-label={removeLabel ?? `Remove ${file.name}`}
            onClick={onRemove}
            disabled={removing}
          >
            {removing ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Trash2 className="size-4" />
            )}
          </Button>
        ) : null}
      </div>
      {completed ? null : (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          aria-label={`${file.progress}% uploaded`}
          role="progressbar"
          aria-valuenow={file.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-info" style={{ width: `${file.progress}%` }} />
        </div>
      )}
    </div>
  );
}

function Requirement({ children, complete = false }: { children: ReactNode; complete?: boolean }) {
  return (
    <li
      className={cn(
        'flex items-center gap-1.5 text-xs',
        complete ? 'text-muted-foreground line-through' : 'text-foreground-disabled',
      )}
    >
      {complete ? (
        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-success text-surface-inverse-foreground">
          <Check className="size-3" strokeWidth={3} aria-hidden="true" />
        </span>
      ) : (
        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground-disabled text-surface-inverse-foreground">
          <X className="size-3" strokeWidth={3} aria-hidden="true" />
        </span>
      )}
      <span>{children}</span>
    </li>
  );
}

function VerificationBenefits({
  businessDocumentPresent,
  personalIdentityVerified,
  projectsVerified,
}: {
  businessDocumentPresent: boolean;
  personalIdentityVerified: boolean;
  projectsVerified: boolean;
}) {
  const requirements = [
    { complete: personalIdentityVerified, label: 'Identity (Phone, Account owner)' },
    { complete: businessDocumentPresent, label: 'Proof of Entity registration' },
    { complete: projectsVerified, label: 'Projects (3/3)' },
  ];

  return (
    <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
      <section className="relative overflow-hidden rounded-xl bg-button-fancy p-7 text-button-fancy-foreground [background-image:var(--verification-hero-background)]">
        <div
          className="absolute -right-16 -top-16 size-56 rounded-full bg-[var(--verification-hero-glow)] opacity-15 blur-xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-col items-start gap-2.5">
          <p className="font-mono text-[10px] leading-none tracking-[0.08em] text-button-fancy-foreground/45 uppercase">
            Company verification · Corporate plan
          </p>
          <h2 className="text-[26px] leading-[1.25] font-semibold tracking-[-0.015em]">
            Verified studios get 3× more enquiries. Yours could be one of them.
          </h2>
          <p className="text-xs leading-relaxed text-button-fancy-foreground/60">
            Homeowners filter by verified companies first. A badge on your profile and every project
            tells them Tickif has checked your business is real. It takes under 10 minutes.
          </p>
          <div className="flex flex-wrap items-start gap-x-2.5 gap-y-1.5">
            {[
              '3× more lead conversions',
              'Priority search ranking',
              'Under 10 minutes to apply',
            ].map((benefit) => (
              <span
                key={benefit}
                className="rounded-full border border-button-fancy-foreground/20 bg-button-fancy-foreground/10 px-3 py-2 text-xs leading-none font-medium text-button-fancy-foreground/85"
              >
                {benefit}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 font-mono text-xs tracking-wide text-muted-foreground uppercase">
          <ListChecks className="size-4" aria-hidden="true" />
          Required information
        </h2>
        <ul className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {requirements.map((requirement) => (
            <li
              key={requirement.label}
              className="flex items-center gap-2 border-b border-border px-3 py-2.5 text-[13px] text-muted-foreground last:border-b-0"
            >
              {requirement.complete ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <CircleDashed className="size-4 shrink-0" aria-hidden="true" />
              )}
              {requirement.label}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 font-mono text-xs tracking-wide text-muted-foreground uppercase">
          <ShieldCheck className="size-4" aria-hidden="true" />
          Privacy
        </h2>
        <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
          Documents are reviewed only by Tickif admin staff. Nothing you upload here is visible on
          your public profile or shared with homeowners.
        </p>
      </section>
    </aside>
  );
}

const businessDocumentTypes = new Set<VerificationDocumentType>(
  documentOptions.map((option) => option.value),
);
const supportingDocumentTypes = new Set<VerificationDocumentType>([
  VERIFICATION_DOCUMENT_TYPE.PERSONAL_PAN,
  VERIFICATION_DOCUMENT_TYPE.AADHAAR,
]);

type VerificationDocument = VerificationStateResponse['documents'][number];
type BusyAction =
  | 'business-upload'
  | 'identity-save'
  | 'otp-send'
  | 'otp-verify'
  | 'document-remove'
  | 'submit'
  | 'supporting-upload'
  | null;

function documentLabel(type: VerificationDocumentType): string {
  if (type === VERIFICATION_DOCUMENT_TYPE.PERSONAL_PAN) return 'PAN card';
  if (type === VERIFICATION_DOCUMENT_TYPE.AADHAAR) return 'Aadhaar';
  const option = documentOptions.find((candidate) => candidate.value === type);
  if (!option) return 'Verification document';
  return 'selectedLabel' in option ? option.selectedLabel : option.label;
}

function documentDisplay(document: VerificationDocument): UploadDisplay {
  const format = document.contentType === 'application/pdf' ? 'PDF' : 'IMG';
  return {
    format,
    name: documentLabel(document.type),
    progress: document.status === VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD ? 10 : 100,
    sizeKb: Math.max(1, Math.ceil(document.size / 1024)),
  };
}

function localFileDisplay(file: File): UploadDisplay {
  const extension = file.name.split('.').pop()?.toUpperCase();
  return {
    format: extension && extension.length <= 4 ? extension : 'FILE',
    name: file.name,
    progress: 10,
    sizeKb: Math.max(1, Math.ceil(file.size / 1024)),
  };
}

function InReviewStatusBadge() {
  return (
    <Badge
      variant="secondary"
      shape="square"
      size="compact"
      className="rounded-md pl-1 pr-2 text-[13px] leading-[1.1] font-medium [&_svg]:size-4"
    >
      <Eye aria-hidden="true" />
      In review
    </Badge>
  );
}

function UploadedStatusBadge() {
  return (
    <Badge
      variant="secondary"
      shape="square"
      size="compact"
      className="rounded-md pl-1 pr-2 text-[13px] leading-[1.1] font-medium [&_svg]:size-4"
    >
      <FileUp aria-hidden="true" />
      Uploaded
    </Badge>
  );
}

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
            } catch (loadError) {
              setError(
                loadError instanceof Error
                  ? loadError.message
                  : 'Could not load verification details.',
              );
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
  const businessDocument = [...businessDocuments].sort((left, right) => {
    const priority = {
      [VERIFICATION_DOCUMENT_STATUS.VERIFIED]: 0,
      [VERIFICATION_DOCUMENT_STATUS.UPLOADED]: 1,
      [VERIFICATION_DOCUMENT_STATUS.REJECTED]: 2,
      [VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD]: 3,
      [VERIFICATION_DOCUMENT_STATUS.REMOVED]: 4,
    };
    return priority[left.status] - priority[right.status];
  })[0];
  const supportingDocument = state.documents.find((document) =>
    supportingDocumentTypes.has(document.type),
  );
  const businessDocumentVerified =
    businessDocument?.status === VERIFICATION_DOCUMENT_STATUS.VERIFIED;
  const businessDocumentPresent = state.eligibility.businessDocumentPresent.met;
  const applicationPending = state.status === VERIFICATION_APPLICATION_STATUS.PENDING;
  const applicationVerified = state.status === VERIFICATION_APPLICATION_STATUS.VERIFIED;
  const needsRejectedBusinessDocument =
    state.status === VERIFICATION_APPLICATION_STATUS.REJECTED && !businessDocumentPresent;
  const applicationEditable =
    state.status === VERIFICATION_APPLICATION_STATUS.DRAFT ||
    state.status === VERIFICATION_APPLICATION_STATUS.REJECTED ||
    state.status === VERIFICATION_EFFECTIVE_STATUS.EXPIRED;
  const canManage = state.permissions.canManage && applicationEditable;
  const enteredPhone = phone ? `${selectedCountry.code} ${phone}` : 'Account owner phone';
  const persistedPhone = normalizePhoneInput(state.identity.ownerPhone ?? '', countries[0]!);
  const verifiedPhone = persistedPhone.phone
    ? `${persistedPhone.country.code} ${persistedPhone.phone}`
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
      setError(actionError instanceof Error ? actionError.message : 'Something went wrong.');
    } finally {
      setBusyAction(null);
    }
  }

  function handleSendOtp() {
    void runAction('otp-send', async () => {
      const normalizedPhone = toE164PhoneNumber(selectedCountry, phone);
      if (!normalizedPhone)
        throw new Error(`Enter a valid phone number for ${selectedCountry.name}.`);
      const result = await authClient.phoneNumber.sendOtp({ phoneNumber: normalizedPhone });
      if (result.error) throw new Error(result.error.message || 'Could not send OTP.');
      setOtp(['', '', '', '', '', '']);
      setOtpSent(true);
    });
  }

  function handleVerifyOtp() {
    void runAction('otp-verify', async () => {
      const normalizedPhone = toE164PhoneNumber(selectedCountry, phone);
      if (!normalizedPhone)
        throw new Error(`Enter a valid phone number for ${selectedCountry.name}.`);
      const code = otp.join('');
      if (code.length !== 6) throw new Error('Enter the full 6-digit OTP.');
      const result = await authClient.phoneNumber.verify({
        phoneNumber: normalizedPhone,
        code,
        updatePhoneNumber: true,
      });
      if (result.error) throw new Error(result.error.message || 'Invalid or expired OTP.');
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
        throw new Error('Enter the account owner’s full legal name.');
      }
      const result = await authClient.updateUser({ name });
      if (result.error) throw new Error(result.error.message || 'Could not save the owner name.');
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
                    description={`${verifiedPhone} · OTP verified`}
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
                        ? `${verifiedPhone} · OTP verified`
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
                              ? () => setDocumentPendingRemoval(supportingDocument)
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
              ) : businessDocument?.status === VERIFICATION_DOCUMENT_STATUS.REJECTED ? (
                <ResubmitStatusBadge note={state.latestNote} />
              ) : applicationPending ? (
                <InReviewStatusBadge />
              ) : businessDocumentPresent ? (
                <UploadedStatusBadge />
              ) : null
            }
          >
            {applicationPending ? (
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                {businessDocument ? (
                  <FileUploadCard
                    file={documentDisplay(businessDocument)}
                    showCompletionStatus={false}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    The submitted document could not be displayed. Refresh the page or contact
                    support if this continues.
                  </p>
                )}
              </div>
            ) : businessDocumentVerified ? (
              <div className="p-4">
                {businessDocument ? (
                  <FileUploadCard
                    file={documentDisplay(businessDocument)}
                    showCompletionStatus={false}
                  />
                ) : null}
              </div>
            ) : (
              <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
                <DocumentTypeSelect
                  value={documentType}
                  onValueChange={setDocumentType}
                  disabled={!canManage || busyAction !== null}
                />
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <Label
                      htmlFor="business-document"
                      className="text-[13px] text-muted-foreground"
                    >
                      Upload document
                    </Label>
                    {businessDocument?.status === VERIFICATION_DOCUMENT_STATUS.REJECTED ? (
                      <span
                        role="status"
                        className="flex items-center gap-1 text-[13px] font-medium text-destructive"
                      >
                        <ResubmitAlertIcon className="size-4" />
                        Resubmit document
                      </span>
                    ) : null}
                  </div>
                  {canManage ? (
                    <FileUploadArea
                      id="business-document"
                      description="Drag and drop files here or click to upload"
                      onFile={(file) => handleDocumentUpload('business', file)}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Only an organization owner or admin can upload verification documents.
                    </p>
                  )}
                  {pendingBusinessUpload ? (
                    <FileUploadCard file={pendingBusinessUpload} />
                  ) : businessDocument ? (
                    <FileUploadCard
                      file={documentDisplay(businessDocument)}
                      onRemove={
                        canManage ? () => setDocumentPendingRemoval(businessDocument) : undefined
                      }
                      removeLabel={`Remove ${documentLabel(businessDocument.type)}`}
                      removing={
                        busyAction === 'document-remove' &&
                        documentPendingRemoval?.id === businessDocument.id
                      }
                    />
                  ) : null}
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
          {error ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <VerificationBenefits
          businessDocumentPresent={businessDocumentPresent}
          personalIdentityVerified={personalIdentityVerified}
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
          if (!open && busyAction !== 'document-remove') setDocumentPendingRemoval(null);
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
