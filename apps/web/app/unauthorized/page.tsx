import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Unauthorized — Tickif',
};

/**
 * Minimal unauthorized page. Publicly accessible (no auth check).
 * Shown when a user attempts to access a role-restricted route.
 */
export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-neutral-900">Access denied</h1>
        <p className="mt-2 text-sm text-neutral-500">
          You don't have permission to view this page.
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <a
            href="/"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Go home
          </a>
          <a
            href="/login"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Sign in
          </a>
        </div>
      </div>
    </main>
  );
}
