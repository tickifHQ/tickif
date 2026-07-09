import Image from 'next/image';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAuth, rolePassesCheck } from '@/lib/auth-guard';
import { VISITOR_ONBOARDED_COOKIE } from '@/lib/visitor-onboarding';
import { VisitorOnboardingForm } from '@/components/visitor-onboarding-form';

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

  const cookieStore = await cookies();
  if (cookieStore.has(VISITOR_ONBOARDED_COOKIE)) {
    redirect('/');
  }

  const displayName = session.user.name?.trim() || 'Mahi Interiors';
  const signedInAs = session.user.email?.trim() || displayName;
  const initials = initialsForName(displayName);

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(420px,600px)]">
      <section className="flex min-h-screen items-center justify-center px-6 py-12">
        <VisitorOnboardingForm displayName={displayName} signedInAs={signedInAs} initials={initials} />
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
