import { redirect } from 'next/navigation';
import { LoginCard } from '@/components/login-card';
import { getServerSession, rolePassesCheck } from '@/lib/auth-guard';
import { ADMIN_MODERATION_PATH } from '@/lib/auth-paths';

export const metadata = {
  title: 'Admin sign in · Tickif',
};

export default async function AdminLoginPage() {
  const session = await getServerSession({ disableCookieCache: true });

  if (session) {
    if (rolePassesCheck(session.user.role, 'admin')) {
      redirect(ADMIN_MODERATION_PATH);
    }
    redirect('/unauthorized');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <LoginCard intent="admin" />
    </main>
  );
}
