import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { requireAuth, rolePassesCheck } from '@/lib/auth-guard';

export const metadata = {
  title: 'Onboarding · Tickif',
};

function initialsForName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : parts[0]?.slice(0, 2) ?? 'TI';
  return initials.toUpperCase();
}

export default async function VisitorOnboardingPage() {
  const session = await requireAuth();

  if (rolePassesCheck(session.user.role, 'designer')) {
    redirect('/designer/dashboard');
  }

  const displayName = session.user.name?.trim() || 'Mahi Interiors';
  const signedInAs = session.user.email?.trim() || displayName;
  const initials = initialsForName(displayName);

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(420px,600px)]">
      <section className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-[450px]">
          <div className="mb-8">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ChevronLeft className="size-4" />
              <span>Signed in as {signedInAs}</span>
            </div>
            <h1 className="mt-2 font-display text-xl font-semibold tracking-tight text-foreground">
              Let&apos;s set up your space on Tickif
            </h1>
          </div>

          <form className="space-y-6">
            <div className="flex gap-5">
              <div className="relative flex size-[60px] shrink-0 items-center justify-center rounded-lg border border-border bg-primary/10 text-lg font-semibold text-primary">
                {initials}
                <span className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full border border-border bg-background text-[10px] text-muted-foreground">
                  ×
                </span>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="visitor-display-name" className="text-[13px] font-medium">
                  Display name
                </Label>
                <Input id="visitor-display-name" defaultValue={displayName} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="visitor-city" className="text-[13px] font-medium">
                City
              </Label>
              <select
                id="visitor-city"
                defaultValue="chennai"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="chennai">Chennai</option>
                <option value="bengaluru">Bengaluru</option>
                <option value="mumbai">Mumbai</option>
                <option value="pune">Pune</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="visitor-whatsapp" className="text-[13px] font-medium">
                WhatsApp number <span className="font-normal text-muted-foreground">(Recommended)</span>
              </Label>
              <div className="flex">
                <div className="inline-flex h-10 items-center gap-2 rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                  <span>🇮🇳</span>
                  <span>+91</span>
                </div>
                <Input id="visitor-whatsapp" type="tel" defaultValue="9123456789" className="-ml-px rounded-l-none" />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <Button asChild className="h-11 w-full">
                <Link href="/">
                  Continue
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span>Need help?</span>
                <Link href="mailto:support@tickif.in" className="font-medium text-foreground underline-offset-2 hover:underline">
                  Contact support
                </Link>
                <span>·</span>
                <Link href="/" className="font-medium text-foreground underline-offset-2 hover:underline">
                  Skip to dashboard
                </Link>
              </div>
            </div>
          </form>
        </div>
      </section>

      <aside className="relative hidden min-h-screen overflow-hidden border-l border-border bg-card lg:block">
        <div className="absolute inset-y-0 left-6 w-px border-l border-dashed border-border" />
        <div className="absolute inset-y-0 left-48 w-px border-l border-dashed border-border" />
        <div className="absolute inset-x-0 top-[35%] border-t border-border" />
        <div className="absolute inset-x-0 top-[57%] border-t border-border" />
        <figure className="absolute left-12 top-[43%] w-[22rem] -translate-y-1/2">
          <blockquote className="font-display text-2xl leading-tight text-foreground">
            &quot;Tickif is why I still have hair.
            <br />
            No more worrying about <span className="text-primary">getting clients.</span>&quot;
          </blockquote>
          <figcaption className="mt-5 flex items-center gap-3">
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              AM
            </span>
            <span>
              <span className="block text-sm font-medium text-foreground">Antika M.</span>
              <span className="block text-xs text-muted-foreground">Antika Interiors</span>
            </span>
          </figcaption>
        </figure>
        <Image
          src="/illustrations/onboarding-living-room.svg"
          alt=""
          width={334}
          height={188}
          className="absolute bottom-8 right-8 h-auto w-[334px]"
        />
      </aside>
    </main>
  );
}
