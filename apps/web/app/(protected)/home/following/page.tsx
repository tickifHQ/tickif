import { followingQuerySchema } from '@repo/contracts';
import { VisitorFollowing } from '@/components/visitor-following';
import { requireActiveVisitor } from '@/lib/auth-guard';

export default async function FollowingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireActiveVisitor();
  const params = await searchParams;
  const parsed = followingQuerySchema.safeParse(params);
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8">
      <h1 className="text-2xl font-medium">Studios you follow</h1>
      <VisitorFollowing
        userId={session.user.id}
        standalone
        page={parsed.success ? parsed.data.page : 1}
      />
    </main>
  );
}
