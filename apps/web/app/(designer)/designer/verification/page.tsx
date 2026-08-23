import { headers } from 'next/headers';
import { DesignerVerification } from '@/components/designer-verification';
import { requireAuth } from '@/lib/auth-guard';
import { fetchVerificationState } from '@/lib/verification-api';

export const metadata = {
  title: 'Verification · Tickif',
};

export default async function DesignerVerificationPage() {
  await requireAuth({ requiredRole: 'designer' });
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');

  if (!cookie) {
    return (
      <DesignerVerification
        initialState={null}
        initialLoadError="Your session could not be read."
      />
    );
  }

  try {
    const state = await fetchVerificationState({ cookie });
    return <DesignerVerification initialState={state} />;
  } catch (error) {
    return (
      <DesignerVerification
        initialState={null}
        initialLoadError={
          error instanceof Error ? error.message : 'Could not load verification details.'
        }
      />
    );
  }
}
