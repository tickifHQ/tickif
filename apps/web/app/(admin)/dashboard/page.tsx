import Link from 'next/link';
import { Button } from '@repo/ui/components/button';

export const metadata = {
  title: 'Admin dashboard · Tickif',
};

/** Keep the dashboard intentionally empty until admin dashboard content is defined. */
export default function AdminDashboardPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-2xl font-semibold text-foreground">Admin dashboard</h1>
      <Button asChild>
        <Link href="/moderation">Open moderation</Link>
      </Button>
    </div>
  );
}
