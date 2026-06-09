import { Container } from './container';

/** Static site footer shared across route groups. */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-neutral-200 bg-white">
      <Container className="flex flex-col gap-1 py-6 text-sm text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
        <p>© {year} Tickif. All rights reserved.</p>
        <p>Discover real interior design projects across India.</p>
      </Container>
    </footer>
  );
}
