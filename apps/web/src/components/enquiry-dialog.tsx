'use client';

import { useState, useTransition } from 'react';
import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@repo/ui/components/dialog';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';
import { Textarea } from '@repo/ui/components/textarea';
import { cn } from '@repo/ui/lib/utils';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EnquiryContext =
  | { type: 'project'; projectName: string; designerName: string; designerLocation?: string | null; designerLogoUrl?: string | null }
  | { type: 'designer'; designerName: string; designerLocation?: string | null; designerLogoUrl?: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: EnquiryContext;
  designerProfileId: string;
  referredProjectId?: string | null;
  /** Verified phone number to display read-only. */
  phoneNumber?: string | null;
  /** Email to display read-only. */
  email?: string | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEMPLATE_CHIPS = [
  { label: 'Request quotation', template: 'Hi, I would like to request a quotation for my project. Could you share your pricing and availability?' },
  { label: 'Book consultation', template: 'Hi, I would like to book a consultation to discuss my requirements. Please let me know your available slots.' },
  { label: 'Timeline enquiry', template: 'Hi, I would like to understand the typical timeline for a project like mine. Could you share more details?' },
  { label: 'Design ideas', template: 'Hi, I am looking for design ideas and inspiration for my space. I would love to discuss possibilities with you.' },
  { label: 'Material enquiry', template: 'Hi, I have some questions about materials and finishes you typically work with. Could we discuss?' },
  { label: 'General question', template: '' },
] as const;

const BUDGET_OPTIONS = [
  { value: 'under-5l', label: 'Under \u20B95 Lakh' },
  { value: '5-10l', label: '\u20B95\u201310 Lakh' },
  { value: '10-20l', label: '\u20B910\u201320 Lakh' },
  { value: '20-50l', label: '\u20B920\u201350 Lakh' },
  { value: '50l-plus', label: '\u20B950 Lakh+' },
  { value: 'prefer-not-to-say', label: 'Prefer not to say' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultSubject(context: EnquiryContext): string {
  if (context.type === 'project') {
    return `Enquiry about ${context.projectName}`;
  }
  return `General enquiry for ${context.designerName}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EnquiryDialog({
  open,
  onOpenChange,
  context,
  designerProfileId,
  referredProjectId,
  phoneNumber,
  email,
}: Props) {
  const [subject] = useState(defaultSubject(context));
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setDescription('');
    setBudget('');
    setActiveChip(null);
    setError(null);
    setSuccess(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleChipSelect(chip: typeof TEMPLATE_CHIPS[number]) {
    setActiveChip(chip.label);
    if (chip.template) {
      setDescription(chip.template);
    }
  }

  function handleSubmit() {
    if (!isValid) return;
    setError(null);

    startTransition(async () => {
      try {
        const response = await api.api.enquiries.$post({
          json: {
            designerProfileId,
            referredProjectId: referredProjectId ?? undefined,
            subject: subject.trim(),
            description: description.trim(),
            templateUsed: activeChip ?? undefined,
            budget,
          },
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          let msg = `Could not send enquiry (${response.status}). Please try again.`;
          if (body && typeof body === 'object') {
            if ('error' in body && body.error && typeof body.error === 'object') {
              const err = body.error as Record<string, unknown>;
              msg = String(err.message ?? msg);
              if (Array.isArray(err.details) && err.details.length > 0) {
                const detail = err.details[0] as { path?: string; message?: string };
                msg = `${msg}: ${detail.path ?? ''} ${detail.message ?? ''}`.trim();
              }
            } else if ('message' in body && typeof body.message === 'string') {
              msg = body.message;
            }
          }
          setError(msg);
          return;
        }

        setSuccess(true);
      } catch {
        setError('Something went wrong. Please check your connection and try again.');
      }
    });
  }

  const isValid = description.trim().length > 0 && budget.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[calc(100vh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Send an Enquiry</DialogTitle>
        <DialogDescription className="sr-only">
          Tell the designer about your project or ask a question.
        </DialogDescription>

        {/* Header */}
        <div className="border-b border-border px-6 pt-5 pb-4">
          <p className="font-mono text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Send Enquiry
          </p>
          <div className="mt-3 flex items-center gap-3">
            {context.designerLogoUrl ? (
              <img
                src={context.designerLogoUrl}
                alt=""
                className="size-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {context.designerName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{context.designerName}</p>
              {context.designerLocation && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{context.designerLocation}</p>
              )}
            </div>
          </div>
        </div>

        <div className="max-h-[calc(100vh-16rem)] overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="enquiry-description" className="text-sm font-medium">
                Description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="enquiry-description"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (activeChip) setActiveChip(null);
                }}
                placeholder="Tell the designer about your project, requirements, or questions."
                maxLength={2000}
                rows={4}
                className="resize-y"
              />
            </div>

            {/* Quick Enquiry Templates (below description, no label) */}
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => handleChipSelect(chip)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    activeChip === chip.label
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Budget */}
            <SelectField
              label="Estimated Budget"
              value={budget}
              onValueChange={setBudget}
              options={[...BUDGET_OPTIONS]}
              placeholder="Select budget range"
            />

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        </div>

        {success ? (
          <div className="border-t border-border px-6 py-6 text-center">
            <p className="text-sm font-medium text-primary">Enquiry sent successfully!</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The designer will receive your enquiry and respond soon.
            </p>
          </div>
        ) : (
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="emphasis"
              disabled={!isValid || isPending}
              onClick={handleSubmit}
            >
              {isPending ? 'Sending...' : 'Send Enquiry'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
