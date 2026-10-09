import Link from 'next/link';
import { TickifBrandLogo } from '@/components/tickif-brand-logo';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support';

const links = [
  { href: '/', label: 'Browse' },
  { href: '/blog', label: 'Blog' },
  { href: '/', label: 'About' },
  { href: '/', label: 'Privacy' },
  { href: SUPPORT_WHATSAPP_URL, label: 'Report a problem' },
];

export function PublicFooter({ landing = false }: { landing?: boolean }) {
  const year = new Date().getFullYear();

  if (landing)
    return (
      <footer className="mt-auto px-5 pb-8 pt-14 sm:px-8 lg:px-12">
        <div className="flex flex-col justify-between gap-10 md:flex-row">
          <div>
            <Link
              href="/"
              aria-label="Tickif home"
              className="inline-flex items-center gap-3 p-2.5"
            >
              <img src="/images/landing/logo-mark.svg" alt="" />
              <img
                src="/images/landing/logo-word.svg"
                alt="Tickif"
                className="dark:brightness-0 dark:invert"
              />
            </Link>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Real Indian homes, reviewed by people,
              <br />
              and the designers who made them.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-[72px]">
            <div>
              <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Explore
              </h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/#browse-by-room">Rooms</Link>
                </li>
                <li>
                  <Link href="/#browse-by-city">Cities</Link>
                </li>
                <li>
                  <Link href="/#browse-by-propertyType">Project types</Link>
                </li>
                <li>
                  <Link href="/designers">Designers</Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                For designers
              </h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/login?mode=designer">List your projects</Link>
                </li>
                <li>
                  <Link href="/#for-designers">Pricing</Link>
                </li>
                <li>
                  <Link href="/designer/verification">Verification</Link>
                </li>
                <li>
                  <Link href="/login?mode=designer">Designer login</Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Company
              </h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href={SUPPORT_WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Report a problem
                  </a>
                </li>
                {['About', 'Takedown policy', 'Terms & privacy'].map((label) => (
                  <li key={label}>
                    <span
                      aria-disabled="true"
                      title="Coming soon"
                      className="cursor-not-allowed text-muted-foreground"
                    >
                      {label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>
        <div className="mt-10 flex flex-wrap justify-between gap-4 border-t border-border pt-5 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          <span>© {year} Tickif · Photos watermarked and protected</span>
          <span>Made in Chennai</span>
        </div>
      </footer>
    );

  return (
    <footer className="mt-auto bg-surface-inverse">
      <div className="flex w-full flex-col items-center gap-5 px-6 py-8 text-center sm:flex-row sm:justify-between sm:px-12 sm:text-left">
        <TickifBrandLogo label="tickif" tone="inverse" />
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-xs font-medium text-surface-inverse-foreground/50 transition-colors hover:text-surface-inverse-foreground/80"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <span className="text-xs font-medium text-surface-inverse-foreground/50">
          © {year} Tickif
        </span>
      </div>
    </footer>
  );
}
