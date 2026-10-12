'use client';

import { useId } from 'react';
import { ArrowRight, BadgeCheck, ChevronRight, Clock, ShieldCheck, X } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import { OtpInput } from '@/components/otp-input';

interface OtpVerificationPanelProps {
  code: string[];
  sentTo: string;
  onCodeChange: (value: string[]) => void;
  onVerify: (code?: string[]) => void;
  onResend: () => void;
  onCancel: () => void;
  onClose?: () => void;
  presentation?: 'default' | 'login';
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
  onClose,
  presentation = 'default',
  loading = false,
  resendDisabled = false,
  resendLabel = 'Resend',
  verifyLabel = 'Verify',
  error,
}: OtpVerificationPanelProps) {
  const errorId = useId();
  if (presentation === 'login') {
    return (
      <div
        data-testid="phone-otp-verification"
        className="flex min-w-0 flex-1 flex-col gap-6 p-5 sm:p-8"
      >
        <div data-slot="verification-header" className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-medium text-foreground">
            Enter verification code
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose ?? onCancel}
            aria-label="Close verification"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>We sent a 6-digit code to</span>
          <span className="font-medium text-foreground">{sentTo}</span>
          <Button
            type="button"
            variant="link"
            size="xs"
            className="h-auto px-0"
            onClick={onCancel}
            disabled={loading}
            aria-label="Edit phone number"
          >
            Edit
          </Button>
        </div>
        <OtpInput
          value={code}
          onChange={onCodeChange}
          onComplete={onVerify}
          autoSubmit
          disabled={loading}
          length={6}
          variant="login"
          ariaInvalid={Boolean(error)}
          ariaDescribedBy={error ? errorId : undefined}
        />
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden="true" />
          <Button
            type="button"
            variant="link"
            size="xs"
            className="h-auto px-0"
            onClick={onResend}
            disabled={resendDisabled || loading}
          >
            {resendLabel}
          </Button>
        </div>
        <div data-slot="verification-footer" className="flex flex-col gap-3">
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => onVerify()}
            disabled={loading || code.some((digit) => !digit)}
          >
            {loading ? 'Verifying…' : verifyLabel}
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Button>
          <p className="text-xs text-muted-foreground">
            Auto-verifies when all 6 digits are entered.
          </p>
          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Codes expire in 5 minutes. We will never ask for your code on a call.
          </p>
        </div>
      </div>
    );
  }
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
        <Button
          type="button"
          onClick={() => onVerify()}
          disabled={loading || code.some((digit) => !digit)}
        >
          {loading ? 'Verifying…' : verifyLabel}
          <ChevronRight className="size-5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
