import Link from 'next/link';
import { BriefcaseBusiness } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import { Card, CardContent, CardHeader } from '@repo/ui/components/card';
import { PublicHeader } from '@/components/public-header';
import { requireActiveVisitor } from '@/lib/auth-guard';

export const metadata = { title: 'List your work · Tickif' };

export default async function ListYourWorkPage() {
  const session = await requireActiveVisitor();

  return (
    <>
      <PublicHeader
        isAuthenticated
        userRole={session.user.role}
        userStatus={session.user.status ?? null}
      />
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-xl items-center px-5 py-10 sm:px-8">
        <Card className="w-full">
          <CardHeader className="items-center text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <BriefcaseBusiness className="size-6" aria-hidden />
            </span>
            <h1 className="font-display text-2xl font-semibold">Use a separate designer account</h1>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-5 text-center">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Your visitor account stays separate so your saved projects, enquiries, and personal
              settings remain intact. To list professional work, sign out and continue in designer
              mode with a different phone number or email.
            </p>
            <Button asChild>
              <Link href="/home">Return to My Tickif</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
