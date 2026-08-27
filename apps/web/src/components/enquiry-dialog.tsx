'use client';

import { useState, useTransition } from 'react';
import type { EnquiryResponse } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@repo/ui/components/dialog';
import { Label } from '@repo/ui/components/label';
import { Textarea } from '@repo/ui/components/textarea';
import { cn } from '@repo/ui/lib/utils';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EnquiryContext =
  | {
      type: 'project';
      projectName: string;
      designerName: string;
      designerLocation?: string | null;
      designerLogoUrl?: string | null;
    }
  | {
      type: 'designer';
      designerName: string;
      designerLocation?: string | null;
      designerLogoUrl?: string | null;
    };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: EnquiryContext;
  designerProfileId: string;
  referredProjectId?: string | null;
  /** Notifies the caller after the enquiry has been persisted. */
  onSuccess?: (enquiry: EnquiryResponse) => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEMPLATE_CHIPS = [
  {
    label: 'Request quotation',
    template:
      'Hi, I would like to request a quotation for my project. Could you share your pricing and availability?',
  },
  {
    label: 'Book consultation',
    template:
      'Hi, I would like to book a consultation to discuss my requirements. Please let me know your available slots.',
  },
  {
    label: 'Timeline enquiry',
    template:
      'Hi, I would like to understand the typical timeline for a project like mine. Could you share more details?',
  },
  {
    label: 'Design ideas',
    template:
      'Hi, I am looking for design ideas and inspiration for my space. I would love to discuss possibilities with you.',
  },
  {
    label: 'Material enquiry',
    template:
      'Hi, I have some questions about materials and finishes you typically work with. Could we discuss?',
  },
  { label: 'General question', template: '' },
] as const;

const BUDGET_STEPS = [
  { value: 5, label: '\u20B95L' },
  { value: 10, label: '\u20B910L' },
  { value: 20, label: '\u20B920L' },
  { value: 50, label: '\u20B950L+' },
] as const;

function budgetRangeToString(min: number, max: number): string {
  const minVal = BUDGET_STEPS[min]!.value;
  const maxVal = BUDGET_STEPS[max]!.value;
  if (min === max) return `${minVal}l`;
  return `${minVal}-${maxVal}l`;
}

function budgetRangeLabel(min: number, max: number): string {
  const minLabel = BUDGET_STEPS[min]!.label;
  const maxLabel = BUDGET_STEPS[max]!.label;
  if (min === max) return minLabel;
  return `${minLabel} \u2013 ${maxLabel}`;
}

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
  onSuccess,
}: Props) {
  const [subject] = useState(defaultSubject(context));
  const [description, setDescription] = useState('');
  const [budgetMin, setBudgetMin] = useState(0);
  const [budgetMax, setBudgetMax] = useState(3);
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setDescription('');
    setBudgetMin(0);
    setBudgetMax(3);
    setActiveChip(null);
    setError(null);
    setSuccess(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleChipSelect(chip: (typeof TEMPLATE_CHIPS)[number]) {
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
            budget: budgetRangeToString(budgetMin, budgetMax),
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

        const enquiry = await response.json();
        onSuccess?.(enquiry);
        setSuccess(true);
      } catch {
        setError('Something went wrong. Please check your connection and try again.');
      }
    });
  }

  const isValid = description.trim().length > 0;

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
                {context.designerName
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{context.designerName}</p>
              {context.designerLocation && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {context.designerLocation}
                </p>
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

            {/* Budget Range Slider */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Estimated Budget <span className="text-destructive">*</span>
              </Label>
              <div className="relative px-2 pt-2 pb-1">
                {/* Track background (grey) */}
                <div className="absolute top-[18px] left-2 right-2 h-1 rounded-full bg-border" />
                {/* Active track (green) */}
                <div
                  className="absolute top-[18px] h-1 rounded-full bg-primary"
                  style={{
                    left: `calc(${(budgetMin / 3) * 100}% + 8px - ${(budgetMin / 3) * 16}px)`,
                    right: `calc(${((3 - budgetMax) / 3) * 100}% + 8px - ${((3 - budgetMax) / 3) * 16}px)`,
                  }}
                />
                {/* Min thumb */}
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={1}
                  value={budgetMin}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val <= budgetMax) {
                      setBudgetMin(val);
                    }
                  }}
                  className="pointer-events-none absolute inset-x-2 top-[10px] h-5 w-[calc(100%-16px)] cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
                />
                {/* Max thumb */}
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={1}
                  value={budgetMax}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val >= budgetMin) {
                      setBudgetMax(val);
                    }
                  }}
                  className="pointer-events-none absolute inset-x-2 top-[10px] h-5 w-[calc(100%-16px)] cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
                />
                {/* Spacer for layout */}
                <div className="h-5" />
              </div>
              {/* Labels below slider */}
              <div className="flex justify-between px-2 text-[11px] text-muted-foreground">
                {BUDGET_STEPS.map((step, i) => (
                  <span
                    key={step.value}
                    className={cn(
                      i >= budgetMin && i <= budgetMax ? 'font-medium text-primary' : '',
                    )}
                  >
                    {step.label}
                  </span>
                ))}
              </div>
              <p className="text-xs font-medium text-foreground">
                {budgetRangeLabel(budgetMin, budgetMax)}
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Notice */}
            <p className="text-xs text-muted-foreground">
              Your contact details and enquiry will be shared with the designer.
            </p>
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
            <Button variant="emphasis" disabled={!isValid || isPending} onClick={handleSubmit}>
              {isPending ? 'Sending...' : 'Send Enquiry'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
