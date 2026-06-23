import { Container } from '@/components/container';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/card';
import { Button } from '@repo/ui/components/button';

export const metadata = {
  title: 'Designer dashboard · Tickif',
};

export default function DesignerDashboardPage() {
  return (
    <Container className="py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Designer dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Manage your portfolio, profile, projects, and leads from one place.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Edit your profile</CardTitle>
            <CardDescription>
              Keep your studio details, contact links, and service footprint up to date.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/designer/profile">Open profile editor</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </Container>
  );
}
