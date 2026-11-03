'use client';

import { useRef, useState } from 'react';
import type { SendWhatsappCode } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { api } from '@/lib/api';
import { readApiErrorMessage } from '@/lib/api-response';
import { OtpVerificationPanel } from '@/components/otp-verification-panel';

export type WhatsappContactProof = { phoneNumber: string; verificationId: string };

/** Key by target and number at call sites so edits discard stale challenges. */
export function WhatsappContactVerification({
  phoneNumber,
  target,
  onVerified,
}: SendWhatsappCode & { onVerified: (proof: WhatsappContactProof) => void }) {
  const [challengeId, setChallengeId] = useState<string>();
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string>();
  const [verified, setVerified] = useState(false);
  const [resendAt, setResendAt] = useState(0);

  async function send() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (Date.now() < resendAt) throw new Error('Wait 60 seconds before requesting another code.');
      const response = await api.api.whatsapp.send.$post({ json: { phoneNumber, target } });
      if (!response.ok)
        throw new Error(await readApiErrorMessage(response, 'Could not send WhatsApp code.'));
      const result = await response.json();
      setChallengeId(result.challengeId);
      setCode(['', '', '', '', '', '']);
      setResendAt(Date.now() + 60_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send code.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function verify(digits = code) {
    if (!challengeId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const response = await api.api.whatsapp.verify.$post({
        json: { phoneNumber, target, challengeId, code: digits.join('') },
      });
      if (!response.ok)
        throw new Error(await readApiErrorMessage(response, 'Could not verify WhatsApp code.'));
      const result = await response.json();
      setVerified(true);
      onVerified({ phoneNumber, verificationId: result.verificationId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not verify code.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (verified)
    return (
      <div className="grid gap-2">
        <p role="status" className="text-sm text-muted-foreground">
          WhatsApp verified. Save your changes within five minutes.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setVerified(false);
            setChallengeId(undefined);
          }}
        >
          Verify again
        </Button>
      </div>
    );
  return (
    <div className="grid gap-2">
      {challengeId ? (
        <OtpVerificationPanel
          code={code}
          sentTo={`WhatsApp ${phoneNumber}`}
          onCodeChange={setCode}
          onVerify={verify}
          onResend={send}
          onCancel={() => setChallengeId(undefined)}
          loading={busy}
          error={error}
        />
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !/^\+[1-9]\d{7,14}$/.test(phoneNumber)}
            onClick={send}
          >
            Verify WhatsApp number
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
