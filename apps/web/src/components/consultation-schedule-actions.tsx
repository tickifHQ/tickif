'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelBookingSchema, type BookingResponse, type LeadConsultation } from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';
import { Textarea } from '@repo/ui/components/textarea';
import { cancelConsultation, completeConsultation, confirmConsultation } from '@/lib/bookings-api';
import { userFacingErrorMessage } from '@/lib/user-facing-error';

type ManageableConsultation = Pick<
  BookingResponse,
  'id' | 'status' | 'preferredSlots' | 'confirmedSlot' | 'cancelledBy' | 'cancelReason'
>;

const slotLabel = (slot: ManageableConsultation['preferredSlots'][number]) =>
  `${slot.date} · ${slot.window} IST`;

export function ConsultationScheduleActions({
  consultation,
  scope,
  canWrite,
}: {
  consultation: ManageableConsultation | LeadConsultation;
  scope: 'mine' | 'inbox';
  canWrite: boolean;
}) {
  const router = useRouter();
  const [slotIndex, setSlotIndex] = useState('0');
  const [action, setAction] = useState<'cancel' | 'complete' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState('');
  const open = consultation.status === 'requested' || consultation.status === 'confirmed';

  async function mutate(kind: 'confirm' | 'cancel' | 'complete') {
    if (busy || changed) return;
    const parsed = cancelBookingSchema.safeParse({ reason });
    if (kind === 'cancel' && (!parsed.success || !parsed.data.reason)) {
      setError('Enter a cancellation reason (up to 500 characters).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (kind === 'confirm') {
        const slot = consultation.preferredSlots[Number(slotIndex)];
        if (!slot) throw new Error('Choose a requested time.');
        await confirmConsultation(consultation.id, consultation.status, { confirmedSlot: slot });
      } else if (kind === 'complete') {
        await completeConsultation(consultation.id, consultation.status);
      } else {
        await cancelConsultation(consultation.id, consultation.status, { reason: reason.trim() });
      }
      setChanged(true);
      setAction(null);
      router.refresh();
    } catch (cause) {
      setError(
        userFacingErrorMessage(cause, 'Could not save the consultation. Refresh and try again.'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        {consultation.confirmedSlot
          ? `Confirmed: ${slotLabel(consultation.confirmedSlot)}`
          : 'Preferred times:'}
      </p>
      {!consultation.confirmedSlot ? (
        <ul className="flex flex-col gap-1 text-sm">
          {consultation.preferredSlots.map((slot) => (
            <li key={`${slot.date}:${slot.window}`}>{slotLabel(slot)}</li>
          ))}
        </ul>
      ) : null}
      {consultation.cancelReason ? (
        <p className="whitespace-pre-wrap break-words text-sm">
          Cancelled by {consultation.cancelledBy === 'designer' ? 'the studio' : 'the requester'}:{' '}
          {consultation.cancelReason}
        </p>
      ) : null}
      {scope === 'inbox' &&
      canWrite &&
      consultation.status === 'requested' &&
      !action &&
      !changed ? (
        <fieldset disabled={busy} className="flex flex-col gap-3">
          <SelectField
            label="Confirm preferred time"
            placeholder="Select a preferred time"
            value={slotIndex}
            onValueChange={setSlotIndex}
            options={consultation.preferredSlots.map((slot, index) => ({
              value: String(index),
              label: slotLabel(slot),
            }))}
          />
          <Button type="button" onClick={() => void mutate('confirm')}>
            Confirm consultation
          </Button>
        </fieldset>
      ) : null}
      {action === 'cancel' ? (
        <fieldset disabled={busy} className="flex flex-col gap-3">
          <Label htmlFor={`cancel-${consultation.id}`}>Cancellation reason</Label>
          <Textarea
            id={`cancel-${consultation.id}`}
            required
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button type="button" variant="destructive" onClick={() => void mutate('cancel')}>
            Confirm cancellation
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAction(null)}>
            Keep consultation
          </Button>
        </fieldset>
      ) : null}
      {action === 'complete' ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            Mark this consultation as completed? This enables a verified consultation review.
          </p>
          <Button type="button" disabled={busy} onClick={() => void mutate('complete')}>
            Confirm completion
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setAction(null)}>
            Go back
          </Button>
        </div>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {changed ? <p role="status">Consultation updated.</p> : null}
      <div className="flex flex-wrap gap-3">
        {open && canWrite && !action && !changed ? (
          <Button
            type="button"
            disabled={busy}
            variant="outline"
            onClick={() => setAction('cancel')}
          >
            Cancel consultation
          </Button>
        ) : null}
        {scope === 'inbox' &&
        canWrite &&
        consultation.status === 'confirmed' &&
        !action &&
        !changed ? (
          <Button type="button" disabled={busy} onClick={() => setAction('complete')}>
            Mark completed
          </Button>
        ) : null}
        {error ? (
          <Button type="button" variant="outline" onClick={() => router.refresh()}>
            Reload consultation
          </Button>
        ) : null}
      </div>
    </div>
  );
}
