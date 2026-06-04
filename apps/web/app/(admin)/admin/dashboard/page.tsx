import { Container } from '@/components/container';

export const metadata = {
  title: 'Admin dashboard · Tickif',
};

/** Placeholder admin landing — moderation and ops tooling land in later epics. */
export default function AdminDashboardPage() {
  return (
    <Container className="py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Admin dashboard</h1>
      <p className="mt-2 text-neutral-600">
        Review submissions, manage designers, and oversee the platform. This is a placeholder
        scaffold.
      </p>
    </Container>
  );
}
