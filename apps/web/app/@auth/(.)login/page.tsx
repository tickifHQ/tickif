import { RoutedLoginDialog } from '@/components/routed-login-dialog';
import { safeCallbackPath } from '@/lib/auth-paths';

type LoginModalPageProps = {
  searchParams: Promise<{
    callbackURL?: string | string[];
    mode?: string | string[];
    next?: string | string[];
  }>;
};

export default async function LoginModalPage({ searchParams }: LoginModalPageProps) {
  const params = await searchParams;
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const callbackPath = safeCallbackPath(params.callbackURL) ?? safeCallbackPath(params.next);
  const loginHref = callbackPath
    ? `/login?callbackURL=${encodeURIComponent(callbackPath)}`
    : '/login';

  return (
    <RoutedLoginDialog
      loginHref={loginHref}
      initialMode={mode === 'designer' ? 'designer' : 'browsing'}
    />
  );
}
