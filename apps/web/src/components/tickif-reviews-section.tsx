import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { TickifReviews } from '@/components/tickif-reviews';
import { getServerSession, activeContextForSession } from '@/lib/auth-guard';
import { fetchOwnReview, fetchTickifReviews } from '@/lib/reviews-api';

export async function TickifReviewsSection({
  designerProfileId,
  slug,
  bookingId,
  page = 1,
}: {
  designerProfileId: string;
  slug: string;
  bookingId?: string;
  page?: number;
}) {
  const [session, published] = await Promise.all([
    getServerSession({ disableCookieCache: true }),
    fetchTickifReviews(designerProfileId, page).catch(() => null),
  ]);
  if (published && page > Math.max(published.totalPages, 1)) {
    const query = new URLSearchParams({ reviewsPage: String(Math.max(published.totalPages, 1)) });
    if (bookingId) query.set('bookingId', bookingId);
    redirect(`/d/${encodeURIComponent(slug)}?${query}#tickif-reviews`);
  }
  const personal =
    !!session &&
    activeContextForSession(session).kind === 'personal' &&
    ['visitor', 'designer'].includes(session.user.role ?? '');
  const canWrite = personal && session?.user.phoneNumberVerified === true;
  const cookie = (await headers()).get('cookie') ?? '';
  const mine = personal
    ? await fetchOwnReview(designerProfileId, cookie).catch(() => undefined)
    : undefined;
  const href = `/d/${encodeURIComponent(slug)}${bookingId ? `?bookingId=${encodeURIComponent(bookingId)}` : ''}#tickif-reviews`;
  return (
    <TickifReviews
      designerProfileId={designerProfileId}
      bookingId={bookingId}
      initialPage={published}
      initialOwn={mine?.item ?? null}
      canWrite={canWrite}
      loginHref={!session ? `/login?callbackURL=${encodeURIComponent(href)}` : undefined}
      viewerMessage={
        session && !personal
          ? 'Switch to My Tickif personal context to write your own review.'
          : personal && !canWrite
            ? 'A verified phone number is required to write or edit a review.'
            : undefined
      }
      initialError={
        !published || (personal && mine === undefined)
          ? 'Could not load reviews. Please reload before making changes.'
          : undefined
      }
    />
  );
}
