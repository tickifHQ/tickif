import Link from 'next/link';
import type { BookingResponse, ListBookingsResponse } from '@repo/contracts';
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
import { ConsultationScheduleActions } from '@/components/consultation-schedule-actions';

const requestedDateFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeZone: 'Asia/Kolkata',
});

function ConsultationCard({
  booking,
  scope,
  canWrite,
}: {
  booking: BookingResponse;
  scope: 'mine' | 'inbox';
  canWrite: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {scope === 'mine' ? booking.designerProfile.displayName : booking.requester.name}
        </CardTitle>
        <CardDescription>
          Requested {requestedDateFormatter.format(new Date(booking.requestedAt))} ·{' '}
          {booking.referredProject?.title ?? 'General consultation'}
        </CardDescription>
        <Badge variant="outline">
          {booking.status === 'requested' ? 'Awaiting confirmation' : booking.status}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {booking.message ? (
          <p className="whitespace-pre-wrap break-words text-sm">{booking.message}</p>
        ) : null}
        {scope === 'inbox' ? (
          <p className="break-words text-sm text-muted-foreground">
            Private contact: {booking.requester.email}
            {booking.requester.phoneNumber ? ` · ${booking.requester.phoneNumber}` : ''}
          </p>
        ) : null}
        <ConsultationScheduleActions consultation={booking} scope={scope} canWrite={canWrite} />
      </CardContent>
      {scope === 'mine' && booking.reviewEligible && booking.designerProfile.slug ? (
        <CardFooter className="flex flex-wrap gap-3">
          <Button asChild>
            <Link
              href={`/d/${encodeURIComponent(booking.designerProfile.slug)}?bookingId=${encodeURIComponent(booking.id)}#tickif-reviews`}
            >
              Review consultation
            </Link>
          </Button>
        </CardFooter>
      ) : null}
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
