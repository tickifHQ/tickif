import { getFollowing } from '@/lib/following.server';
import { VisitorHomeLoadError } from '@/components/visitor-home-load-error';
import { FollowingRail } from '@/components/following-rail';

export async function VisitorFollowing({
  page = 1,
  standalone = false,
  userId,
}: {
  page?: number;
  standalone?: boolean;
  userId: string;
}) {
  try {
    const data = await getFollowing(page);
    return <FollowingRail initialData={data} userId={userId} page={page} standalone={standalone} />;
  } catch {
    return (
      <VisitorHomeLoadError
        title="Following unavailable"
        message="We could not load your followed studios. Please try again."
      />
    );
  }
}
