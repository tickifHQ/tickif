import Link from 'next/link';

/** Root 404 boundary. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-neutral-600">
        The page you’re looking for doesn’t exist or has moved.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-50 transition-colors hover:bg-neutral-700"
      >
        Back to discovery
      </Link>
    </main>
  );
}
