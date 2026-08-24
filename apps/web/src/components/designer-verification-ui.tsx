'use client';

import { useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import {
  VERIFICATION_DOCUMENT_STATUS,
  VERIFICATION_DOCUMENT_TYPE,
  type VerificationDocumentType,
  type VerificationStateResponse,
} from '@repo/contracts';
import { AnimatedCollapsibleContent } from '@repo/ui/components/animated-collapsible-content';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Label } from '@repo/ui/components/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@repo/ui/components/tooltip';
import { cn } from '@repo/ui/lib/utils';
import {
  Check,
  CheckCircle2,
  ChevronsUpDown,
  CircleAlert,
  CircleDashed,
  CloudUpload,
  Eye,
  FileText,
  FileUp,
  Info,
  ListChecks,
  LoaderCircle,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';

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

export type VerificationDocument = VerificationStateResponse['documents'][number];

export type UploadDisplay = {
  format: string;
  name: string;
  progress: number;
  sizeKb: number;
};

export function verificationDocumentLabel(type: VerificationDocumentType): string {
  if (type === VERIFICATION_DOCUMENT_TYPE.PERSONAL_PAN) return 'PAN card';
  if (type === VERIFICATION_DOCUMENT_TYPE.AADHAAR) return 'Aadhaar';
  const option = documentOptions.find((candidate) => candidate.value === type);
  if (!option) return 'Verification document';
  return 'selectedLabel' in option ? option.selectedLabel : option.label;
}

export function documentDisplay(document: VerificationDocument): UploadDisplay {
  const format = document.contentType === 'application/pdf' ? 'PDF' : 'IMG';
  return {
    format,
    name: verificationDocumentLabel(document.type),
    progress: document.status === VERIFICATION_DOCUMENT_STATUS.PENDING_UPLOAD ? 10 : 100,
    sizeKb: Math.max(1, Math.ceil(document.size / 1024)),
  };
}

export function localFileDisplay(file: File): UploadDisplay {
  const extension = file.name.split('.').pop()?.toUpperCase();
  return {
    format: extension && extension.length <= 4 ? extension : 'FILE',
    name: file.name,
    progress: 10,
    sizeKb: Math.max(1, Math.ceil(file.size / 1024)),
  };
}

export function DocumentTypeSelect({
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

export function ResubmitAlertIcon({ className }: { className?: string }) {
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

export function VerifiedStatusBadge() {
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

export function ResubmitStatusBadge({ note }: { note: string | null }) {
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

export function InReviewStatusBadge() {
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

export function UploadedStatusBadge() {
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

export function VerificationSection({
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

export function DetailHeading({
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

export function VerifiedIdentityRow({
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

export function FileUploadArea({
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

export function FileUploadCard({
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

export function Requirement({
  children,
  complete = false,
}: {
  children: ReactNode;
  complete?: boolean;
}) {
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

export function VerificationBenefits({
  businessDocumentPresent,
  publishedProjectCount,
  personalIdentityVerified,
  requiredProjectCount,
  projectsVerified,
}: {
  businessDocumentPresent: boolean;
  publishedProjectCount: number;
  personalIdentityVerified: boolean;
  requiredProjectCount: number;
  projectsVerified: boolean;
}) {
  const requirements = [
    { complete: personalIdentityVerified, label: 'Identity (Phone, Account owner)' },
    { complete: businessDocumentPresent, label: 'Proof of Entity registration' },
    {
      complete: projectsVerified,
      label: `Projects (${publishedProjectCount}/${requiredProjectCount})`,
    },
  ];
  return (
    <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
      <section className="relative overflow-hidden rounded-xl bg-verification-hero p-7 text-verification-hero-foreground">
        <div
          className="absolute -right-16 -top-16 size-56 rounded-full bg-verification-hero-glow opacity-15 blur-xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-col items-start gap-2.5">
          <p className="text-2xs font-mono leading-none tracking-widest text-verification-hero-foreground/45 uppercase">
            Company verification · Corporate plan
          </p>
          <h2 className="text-2xl leading-tight font-semibold tracking-tight">
            <span className="block">Verified studios get 3× more enquiries. </span>
            <span className="block">Yours could be one of them.</span>
          </h2>
          <p className="text-xs leading-relaxed text-verification-hero-foreground/60">
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
                className="rounded-full border border-verification-hero-foreground/20 bg-verification-hero-foreground/10 px-3 py-2 text-xs leading-none font-medium text-verification-hero-foreground/85"
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
