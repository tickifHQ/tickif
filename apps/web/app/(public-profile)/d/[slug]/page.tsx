import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicDesignerProfile } from '@/components/public-designer-profile';
import { publicDesignerProfileFixture } from '@/lib/public-designer-profile-fixture';

type PublicDesignerProfilePageProps = {
  params: Promise<{ slug: string }>;
};

export const metadata: Metadata = {
  title: 'Anika Spaces | Tickif',
  description: 'Explore verified residential interior design work by Anika Spaces.',
};

export default async function PublicDesignerProfilePage({
  params,
}: PublicDesignerProfilePageProps) {
  const { slug } = await params;

  if (slug !== publicDesignerProfileFixture.slug) {
    notFound();
  }

  return <PublicDesignerProfile profile={publicDesignerProfileFixture} />;
}
