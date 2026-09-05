'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createBookingSchema, type BookingSlot } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@repo/ui/components/dialog';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { SelectField } from '@repo/ui/components/select-field';
import { Textarea } from '@repo/ui/components/textarea';
import { authClient } from '@/lib/auth-client';
import { requestConsultation } from '@/lib/bookings-api';
import { userFacingErrorMessage } from '@/lib/user-facing-error';

function istDay(days: number) {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000 + days * 86400000).toISOString().slice(0, 10);
}

export function BookingCta({
  designerProfileId,
  designerName,
  referredProjectId,
  loginHref,
}: {
  designerProfileId: string;
  designerName: string;
  referredProjectId?: string;
  loginHref: string;
}) {
  const { data: session, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const userRole = session && 'role' in session.user ? session.user.role : null;
  return (
    <>
      <Button variant="outline" disabled={isPending} onClick={() => setOpen(true)}>
        Book consultation
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Consultation with {designerName}</DialogTitle>
          <DialogDescription>
            Suggest up to three dates and time windows in India Standard Time. The studio will
            confirm one.
          </DialogDescription>
          {!session ? (
            <Button asChild>
              <Link href={loginHref}>Sign in to book</Link>
            </Button>
          ) : session.session.activeOrganizationId ? (
            <p>Switch to My Tickif using the workspace menu to book a personal consultation.</p>
          ) : userRole !== 'visitor' && userRole !== 'designer' ? (
            <p>A personal or designer account is required to book.</p>
          ) : !session.user.phoneNumberVerified ? (
            <p>Verify your phone number before requesting a consultation.</p>
          ) : (
            <BookingForm
              key={`${session.user.id}:${designerProfileId}`}
              designerProfileId={designerProfileId}
              referredProjectId={referredProjectId}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BookingForm({
  designerProfileId,
  referredProjectId,
}: {
  designerProfileId: string;
  referredProjectId?: string;
}) {
  const [slots, setSlots] = useState<BookingSlot[]>([{ date: istDay(1), window: 'morning' }]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = createBookingSchema.safeParse({
      designerProfileId,
      referredProjectId,
      preferredSlots: slots,
      message: message.trim() || undefined,
    });
    if (!parsed.success || slots.some((slot) => slot.date <= istDay(0))) {
      setError(
        parsed.error?.issues[0]?.message ?? 'Choose dates from tomorrow through the next 90 days.',
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      await requestConsultation(parsed.data);
      setSaved(true);
    } catch (cause) {
      setError(
        userFacingErrorMessage(
          cause,
          'Could not request the consultation. Your choices are still here.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  if (saved)
    return (
      <div className="flex flex-col gap-4">
        <p role="status">Consultation requested. Waiting for the studio to confirm your time.</p>
        <Button asChild>
          <Link href="/home/consultations">View my consultations</Link>
        </Button>
      </div>
    );
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <fieldset disabled={busy} className="flex flex-col gap-4">
        <legend className="mb-3 text-sm font-medium">Preferred times (IST)</legend>
        {slots.map((slot, index) => (
          <fieldset key={index} className="flex flex-col gap-2">
            <legend className="mb-2 text-sm">Option {index + 1}</legend>
            <Label htmlFor={`booking-date-${index}`}>Date {index + 1}</Label>
            <Input
              id={`booking-date-${index}`}
              type="date"
              required
              min={istDay(1)}
              max={istDay(90)}
              value={slot.date}
              onChange={(event) =>
                setSlots(
                  slots.map((value, position) =>
                    position === index ? { ...value, date: event.target.value } : value,
                  ),
                )
              }
            />
            <SelectField
              label={`Time window ${index + 1}`}
              placeholder="Select a time window"
              value={slot.window}
              onValueChange={(window) => {
                const parsed =
                  createBookingSchema.shape.preferredSlots.element.shape.window.safeParse(window);
                if (parsed.success)
                  setSlots(
                    slots.map((value, position) =>
                      position === index ? { ...value, window: parsed.data } : value,
                    ),
                  );
              }}
              options={['morning', 'afternoon', 'evening'].map((value) => ({
                value,
                label: value,
              }))}
            />
            {slots.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSlots(slots.filter((_, position) => position !== index))}
              >
                Remove option {index + 1}
              </Button>
            ) : null}
          </fieldset>
        ))}
        {slots.length < 3 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setSlots([...slots, { date: istDay(slots.length + 1), window: 'morning' }])
            }
          >
            Add another time
          </Button>
        ) : null}
        <Label htmlFor="booking-message">What would you like to discuss? (optional)</Label>
        <Textarea
          id="booking-message"
          value={message}
          maxLength={2000}
          onChange={(event) => setMessage(event.target.value)}
        />
      </fieldset>
      <p className="text-sm text-muted-foreground">
        Your name, email and phone number are shared privately with the studio for this
        consultation.
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button disabled={busy} type="submit">
        {busy ? 'Requesting…' : 'Request consultation'}
      </Button>
    </form>
  );
}
