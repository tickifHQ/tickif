import Link from 'next/link';
import { AccountMenu } from '@/components/account-menu';

export function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Tickif
      </Link>
      <AccountMenu />
    </header>
  );
}
