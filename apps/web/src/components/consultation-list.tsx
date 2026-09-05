'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  cancelBookingSchema,
  type BookingResponse,
  type ListBookingsResponse,
} from '@repo/contracts';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@repo/ui/components/card';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';
import { Textarea } from '@repo/ui/components/textarea';
import { cancelConsultation, completeConsultation, confirmConsultation } from '@/lib/bookings-api';
import { userFacingErrorMessage } from '@/lib/user-facing-error';

const slotLabel = (slot: BookingResponse['preferredSlots'][number]) =>
  `${slot.date} · ${slot.window} IST`;

function ConsultationCard({
  booking,
  scope,
  canWrite,
}: {
  booking: BookingResponse;
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
  const open = booking.status === 'requested' || booking.status === 'confirmed';
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
        const slot = booking.preferredSlots[Number(slotIndex)];
        if (!slot) throw new Error('Choose a requested time.');
        await confirmConsultation(booking.id, booking.status, { confirmedSlot: slot });
      } else if (kind === 'complete') await completeConsultation(booking.id, booking.status);
      else await cancelConsultation(booking.id, booking.status, { reason: reason.trim() });
      setChanged(true);
      setAction(null);
      router.refresh();
    } catch (cause) {
      setError(
        userFacingErrorMessage(
          cause,
          'Could not save the change. Reload consultations and try again.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {scope === 'mine' ? booking.designerProfile.displayName : booking.requester.name}
        </CardTitle>
        <CardDescription>
          Requested {booking.requestedAt.slice(0, 10)} ·{' '}
          {booking.referredProject?.title ?? 'General consultation'}
        </CardDescription>
        <Badge variant="outline">
          {booking.status === 'requested' ? 'Awaiting confirmation' : booking.status}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm">
          {booking.confirmedSlot
            ? `Confirmed: ${slotLabel(booking.confirmedSlot)}`
            : 'Preferred times:'}
        </p>
        {!booking.confirmedSlot ? (
          <ul className="flex flex-col gap-1 text-sm">
            {booking.preferredSlots.map((slot) => (
              <li key={`${slot.date}:${slot.window}`}>{slotLabel(slot)}</li>
            ))}
          </ul>
        ) : null}
        {booking.message ? (
          <p className="whitespace-pre-wrap break-words text-sm">{booking.message}</p>
        ) : null}
        {scope === 'inbox' ? (
          <p className="break-words text-sm text-muted-foreground">
            Private contact: {booking.requester.email}
            {booking.requester.phoneNumber ? ` · ${booking.requester.phoneNumber}` : ''}
          </p>
        ) : null}
        {booking.cancelReason ? (
          <p className="whitespace-pre-wrap break-words text-sm">
            Cancelled by {booking.cancelledBy === 'designer' ? 'the studio' : 'the requester'}:{' '}
            {booking.cancelReason}
          </p>
        ) : null}
        {scope === 'inbox' && canWrite && booking.status === 'requested' && !changed ? (
          <fieldset disabled={busy} className="flex flex-col gap-3">
            <SelectField
              label="Confirm preferred time"
              placeholder="Select a preferred time"
              value={slotIndex}
              onValueChange={setSlotIndex}
              options={booking.preferredSlots.map((slot, index) => ({
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
            <Label htmlFor={`cancel-${booking.id}`}>Cancellation reason</Label>
            <Textarea
              id={`cancel-${booking.id}`}
              required
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button variant="destructive" onClick={() => void mutate('cancel')}>
              Confirm cancellation
            </Button>
            <Button variant="ghost" onClick={() => setAction(null)}>
              Keep consultation
            </Button>
          </fieldset>
        ) : null}
        {action === 'complete' ? (
          <div className="flex flex-col gap-3">
            <p>Mark this consultation as completed? This enables a verified consultation review.</p>
            <Button disabled={busy} onClick={() => void mutate('complete')}>
              Confirm completion
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setAction(null)}>
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
      </CardContent>
      <CardFooter className="flex flex-wrap gap-3">
        {open && canWrite && !action && !changed ? (
          <Button disabled={busy} variant="outline" onClick={() => setAction('cancel')}>
            Cancel consultation
          </Button>
        ) : null}
        {scope === 'inbox' && canWrite && booking.status === 'confirmed' && !action && !changed ? (
          <Button disabled={busy} onClick={() => setAction('complete')}>
            Mark completed
          </Button>
        ) : null}
        {scope === 'mine' && booking.reviewEligible && booking.designerProfile.slug ? (
          <Button asChild>
            <Link
              href={`/d/${encodeURIComponent(booking.designerProfile.slug)}?bookingId=${encodeURIComponent(booking.id)}#tickif-reviews`}
            >
              Review consultation
            </Link>
          </Button>
        ) : null}
        {error ? (
          <Button variant="outline" onClick={() => router.refresh()}>
            Reload consultations
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}

export function ConsultationList({
  data,
  scope,
  canWrite,
}: {
  data: ListBookingsResponse;
  scope: 'mine' | 'inbox';
  canWrite: boolean;
}) {
  return data.items.length ? (
    <div className="flex flex-col gap-5">
      {data.items.map((booking) => (
        <ConsultationCard
          key={`${booking.id}:${booking.status}:${booking.updatedAt}`}
          booking={booking}
          scope={scope}
          canWrite={canWrite}
        />
      ))}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">No consultations match this status.</p>
  );
}
