import { Container } from '@/components/container';
import { DesignerProfileEditor } from '@/components/designer-profile-editor';
import { getProfileEditorPageData } from '@/lib/profile-editor-data';

export const metadata = {
  title: 'Edit profile · Tickif',
};

export default async function DesignerProfilePage() {
  const data = await getProfileEditorPageData();

  return (
    <Container className="py-10">
      <div className="mb-8 max-w-2xl">
        <p className="text-sm font-medium text-primary">Designer profile</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Edit your profile</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Update how homeowners see your studio, contact details, and service footprint.
        </p>
      </div>

      <DesignerProfileEditor
        initialCompletion={data.completion}
        initialProfile={data.profile}
        taxonomy={data.taxonomy}
        taxonomyError={data.taxonomyError}
      />
    </Container>
  );
}
