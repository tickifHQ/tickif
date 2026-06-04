import { Container } from '@/components/container';

export const metadata = {
  title: 'Designer dashboard · Tickif',
};

/** Placeholder designer landing — real widgets land in later epics. */
export default function DesignerDashboardPage() {
  return (
    <Container className="py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Designer dashboard</h1>
      <p className="mt-2 text-neutral-600">
        Manage your portfolio, projects, and leads here. This is a placeholder scaffold.
      </p>
    </Container>
  );
}
