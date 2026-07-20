import { Container } from '@/components/container';
import { DesignerPortfolioSettings } from '@/components/designer-portfolio-settings';
import { DesignerProfileEditorPlaceholder } from '@/components/designer-profile-editor-placeholder';

export const metadata = {
  title: 'Edit profile · Tickif',
};

export default function DesignerProfilePage() {
  return (
    <Container className="py-10">
      <div className="mb-8 max-w-2xl">
        <p className="text-sm font-medium text-primary">Designer profile</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Edit your profile</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Update how homeowners see your studio, contact details, and service footprint.
        </p>
      </div>

      <div className="grid gap-10">
        <section>
          <h2 className="mb-4 text-xl font-semibold tracking-tight">
            Portfolio settings
          </h2>
          <DesignerPortfolioSettings />
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold tracking-tight">
            Profile details
          </h2>
          <DesignerProfileEditorPlaceholder />
        </section>
      </div>
    </Container>
  );
}
