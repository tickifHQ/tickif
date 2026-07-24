/**
 * Streaming fallback for route segments.
 *
 * Deliberately mounted per route group rather than at `app/loading.tsx`.
 * A Suspense fallback lets Next flush the HTML shell — and therefore commit a
 * `200` — before an async page resolves, which turns a later `notFound()` or
 * `redirect()` into a soft 404 / client-side hop. That is fine for signed-in
 * screens, and wrong for anonymous, crawlable routes like `/d/{slug}`, where a
 * real `404`/`307` is what keeps unpublished portfolios out of search results.
 *
 * So: groups that sit behind the login redirect opt in here; public profile
 * routes intentionally have no fallback.
 */
export function RouteLoading() {
  return (
    <main
      className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 text-center"
      aria-busy="true"
    >
      <p className="text-sm text-muted-foreground">Loading…</p>
    </main>
  );
}
