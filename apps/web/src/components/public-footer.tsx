import Link from 'next/link';

const links = [
  { href: '/', label: 'Browse' },
  { href: '/designer/dashboard', label: 'Designers' },
  { href: '/', label: 'Cost Calculator' },
  { href: '/designer/dashboard', label: 'For designers' },
  { href: '/', label: 'About' },
  { href: '/', label: 'Privacy' },
];

export function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto bg-[#1a211c]">
      <div className="mx-auto flex w-full max-w-[1512px] flex-col items-center gap-5 px-6 py-8 text-center sm:flex-row sm:justify-between sm:text-left lg:px-10">
        <span className="text-[20px] text-white">tickif</span>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {links.map((link) => (
            <Link key={link.label} href={link.href} className="text-[13px] font-medium text-white/50 transition-colors hover:text-white/80">
              {link.label}
            </Link>
          ))}
        </nav>
        <span className="text-[13px] font-medium text-white/50">© {year} Homefolio</span>
      </div>
    </footer>
  );
}
