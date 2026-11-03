'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import type { SendWhatsappCode } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/dialog';
import { api } from '@/lib/api';
import { readApiErrorMessage } from '@/lib/api-response';
import { OtpInput } from '@/components/otp-input';
import {
  countries,
  normalizePhoneInput,
  PhoneNumberInput,
  toE164PhoneNumber,
} from '@/components/phone-number-input';

export type WhatsappContactProof = { phoneNumber: string; verificationId: string };

/** Only verified edits leave the dialog; closing it preserves the current contact. */
export function WhatsappContactField({
  phoneNumber,
  target,
  onVerified,
  onClear,
  id,
  ariaLabel,
  ariaInvalid,
  ariaDescribedBy,
  disabled,
}: SendWhatsappCode & {
  id?: string;
  ariaLabel?: string;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  disabled?: boolean;
  onVerified: (proof: WhatsappContactProof) => void;
  onClear: () => void;
}) {
  const inputId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => normalizePhoneInput(phoneNumber, countries[0]!));
  const [challenge, setChallenge] = useState<{ id: string; phoneNumber: string }>();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [verifiedNumber, setVerifiedNumber] = useState<string>();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const cooldowns = useRef(new Map<string, number>());
  const [now, setNow] = useState(Date.now);
  const number = toE164PhoneNumber(draft.country, draft.phone);
  const cooldown = Math.max(
    0,
    Math.ceil(((cooldowns.current.get(number ?? '') ?? 0) - now) / 1000),
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);
  function changeOpen(value: boolean) {
    if (inFlight.current) return;
    if (value) {
      setDraft(normalizePhoneInput(phoneNumber, countries[0]!));
      setChallenge(undefined);
      setCode(['', '', '', '', '', '']);
      setError(undefined);
      setNow(Date.now());
    }
    setOpen(value);
  }
  async function send() {
    if (inFlight.current || disabled) return;
    if (!number) {
      setError('Enter a valid mobile number.');
      return;
    }
    if (Date.now() < (cooldowns.current.get(number) ?? 0)) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const response = await api.api.whatsapp.send.$post({ json: { phoneNumber: number, target } });
      if (!response.ok)
        throw new Error(await readApiErrorMessage(response, 'Could not send WhatsApp code.'));
      const result = await response.json();
      if (!mounted.current) return;
      cooldowns.current.set(number, Date.now() + 60_000);
      setNow(Date.now());
      setChallenge({ id: result.challengeId, phoneNumber: number });
      setCode(['', '', '', '', '', '']);
    } catch (cause) {
      if (mounted.current)
        setError(cause instanceof Error ? cause.message : 'Could not send code.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function verify() {
    if (!challenge || inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const response = await api.api.whatsapp.verify.$post({
        json: {
          phoneNumber: challenge.phoneNumber,
          target,
          challengeId: challenge.id,
          code: code.join(''),
        },
      });
      if (!response.ok)
        throw new Error(await readApiErrorMessage(response, 'Could not verify WhatsApp code.'));
      const result = await response.json();
      if (!mounted.current) return;
      onVerified({ phoneNumber: challenge.phoneNumber, verificationId: result.verificationId });
      setVerifiedNumber(challenge.phoneNumber);
      setOpen(false);
    } catch (cause) {
      if (mounted.current)
        setError(cause instanceof Error ? cause.message : 'Could not verify code.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="grid gap-2">
      <Dialog open={open} onOpenChange={changeOpen}>
        <div className="relative">
          <Input
            id={id}
            type="tel"
            readOnly
            value={phoneNumber}
            placeholder="Add a WhatsApp number"
            aria-label={ariaLabel}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            className="pr-11"
          />
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label="Edit WhatsApp number"
              className="absolute right-1 top-1/2 z-10 -translate-y-1/2 active:-translate-y-1/2"
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
          </DialogTrigger>
        </div>
        <DialogContent
          className="sm:max-w-sm"
          showCloseButton={!busy}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById(inputId)?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {challenge ? 'Verify WhatsApp number' : 'Edit WhatsApp number'}
            </DialogTitle>
            <DialogDescription>
              {challenge
                ? `Enter the six-digit code sent to ${challenge.phoneNumber}.`
                : 'Enter your number, then verify the WhatsApp code to update it.'}
            </DialogDescription>
          </DialogHeader>
          {challenge ? (
            <>
              <OtpInput
                value={code}
                onComplete={verify}
                onChange={(value) => {
                  setCode(value);
                  setError(undefined);
                }}
                disabled={busy}
                ariaInvalid={Boolean(error)}
                ariaDescribedBy={error ? errorId : undefined}
              />
              <p className="text-xs text-muted-foreground">Codes expire in five minutes.</p>
              <Button
                type="button"
                disabled={busy || code.some((digit) => !digit)}
                onClick={verify}
              >
                {busy ? 'Verifying…' : 'Verify'}
              </Button>
              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setChallenge(undefined);
                    setError(undefined);
                  }}
                >
                  Edit phone number
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || cooldown > 0}
                  onClick={send}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor={inputId}>Phone number</Label>
                <PhoneNumberInput
                  id={inputId}
                  phone={draft.phone}
                  selectedCountry={draft.country}
                  disabled={busy}
                  onPhoneChange={(phone) => {
                    setDraft((value) => ({ ...value, phone }));
                    setError(undefined);
                  }}
                  onSelectedCountryChange={(country) => {
                    setDraft((value) => ({ ...value, country }));
                    setError(undefined);
                  }}
                  onEnter={send}
                />
              </div>
              <Button type="button" disabled={busy || !number || cooldown > 0} onClick={send}>
                {busy ? 'Sending…' : cooldown > 0 ? `Send OTP in ${cooldown}s` : 'Send OTP'}
              </Button>
              {phoneNumber ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    onClear();
                    setVerifiedNumber(undefined);
                    setOpen(false);
                  }}
                >
                  Remove number
                </Button>
              ) : null}
            </>
          )}
          {error ? (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
      {verifiedNumber && verifiedNumber === phoneNumber ? (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          WhatsApp number verified.
        </p>
      ) : null}
    </div>
  );
}
