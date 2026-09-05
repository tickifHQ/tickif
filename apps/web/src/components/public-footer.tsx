import Link from 'next/link';
import { TickifBrandLogo } from '@/components/tickif-brand-logo';

const links = [
  { href: '/', label: 'Browse' },
  { href: '/designers', label: 'Designers' },
  { href: '/', label: 'Cost Calculator' },
  { href: '/designer/dashboard', label: 'For designers' },
  { href: '/', label: 'About' },
  { href: '/', label: 'Privacy' },
];

export function PublicFooter() {
  const year = new Date().getFullYear();

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
          © {year} Homefolio
        </span>
      </div>
    </footer>
  );
}
