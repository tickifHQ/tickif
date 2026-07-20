import { Container } from '@/components/container';
import { DesignerPortfolioSettings } from '@/components/designer-portfolio-settings';

export const metadata = {
  title: 'Portfolio · Tickif',
};

export default function DesignerPortfolioPage() {
  return (
    <Container className="py-10">
      <div className="mb-8 max-w-2xl">
        <p className="text-sm font-medium text-primary">Designer portfolio</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Portfolio settings</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Control your public portfolio link, branding, and which sections homeowners see.
        </p>
      </div>

      <DesignerPortfolioSettings />
    </Container>
  );
}
