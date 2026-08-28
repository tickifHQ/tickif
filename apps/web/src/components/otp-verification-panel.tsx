'use client';

import { BadgeCheck, ChevronRight, X } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import { OtpInput } from '@/components/otp-input';

interface OtpVerificationPanelProps {
  code: string[];
  sentTo: string;
  onCodeChange: (value: string[]) => void;
  onVerify: () => void;
  onResend: () => void;
  onCancel: () => void;
  loading?: boolean;
  resendDisabled?: boolean;
  resendLabel?: string;
  verifyLabel?: string;
  error?: string | null;
}

export function OtpVerificationPanel({
  code,
  sentTo,
  onCodeChange,
  onVerify,
  onResend,
  onCancel,
  loading = false,
  resendDisabled = false,
  resendLabel = 'Resend',
  verifyLabel = 'Verify',
  error,
}: OtpVerificationPanelProps) {
  return (
    <div data-testid="phone-otp-verification" className="flex flex-col">
      <div
        data-slot="verification-header"
        className="flex items-center gap-2 border-b border-border bg-muted/30 p-3"
      >
        <h3 className="min-w-0 flex-1 text-base font-medium leading-relaxed text-foreground">
          Enter verification code
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          onClick={onCancel}
          aria-label="Close verification"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex size-24 items-center justify-center rounded-full bg-gradient-to-b from-muted to-transparent p-4">
            <div className="flex size-16 items-center justify-center rounded-full border border-border bg-background shadow-xs">
              <BadgeCheck className="size-8 text-muted-foreground" aria-hidden="true" />
            </div>
          </div>
          <p className="text-center text-base leading-6 text-muted-foreground">
            We’ve sent a code to <span className="font-medium text-foreground">{sentTo}</span>
          </p>
        </div>

        <OtpInput
          value={code}
          onChange={onCodeChange}
          onComplete={onVerify}
          disabled={loading}
          length={6}
          variant="verification"
        />

        {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}

        <div className="flex items-center justify-center gap-1 text-sm leading-relaxed">
          <span className="text-muted-foreground">Didn’t get the code?</span>
          <button
            type="button"
            onClick={onResend}
            disabled={resendDisabled || loading}
            className="font-medium text-primary underline-offset-2 hover:underline disabled:no-underline disabled:opacity-50"
          >
            {resendLabel}
          </button>
        </div>
      </div>

      <div
        data-slot="verification-footer"
        className="flex items-center justify-end gap-3 border-t border-border bg-muted/30 p-3"
      >
        <Button type="button" variant="ghost" className="text-muted-foreground" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={onVerify} disabled={loading || code.some((digit) => !digit)}>
          {loading ? 'Verifying…' : verifyLabel}
          <ChevronRight className="size-5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
