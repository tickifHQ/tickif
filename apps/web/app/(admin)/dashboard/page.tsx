import Link from 'next/link';
import { Button } from '@repo/ui/components/button';

export const metadata = {
  title: 'Admin dashboard · Tickif',
};

export default function AdminDashboardPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-2xl font-semibold text-foreground">Admin dashboard</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Choose a review queue to continue with admin operations.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/moderation">Open moderation</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/verifications">Profile verification</Link>
        </Button>
      </div>
    </div>
  );
}
