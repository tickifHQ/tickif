/** Root loading boundary shown while a route segment streams in. */
export default function Loading() {
  return (
    <main
      className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 text-center"
      aria-busy="true"
    >
      <p className="text-sm text-neutral-500">Loading…</p>
    </main>
  );
}
