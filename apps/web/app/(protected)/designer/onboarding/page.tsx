import { DesignerOnboarding } from '@/components/designer-onboarding';
import { getServerSession } from '@/lib/auth-guard';

export const metadata = {
  title: 'Designer onboarding · Tickif',
};

export default async function DesignerOnboardingPage() {
  const session = await getServerSession();

  return (
    <DesignerOnboarding
      signedInAs={session?.user.email ?? null}
      signedInName={session?.user.name ?? null}
    />
  );
}
