import { requireAuth } from '@/lib/auth-guard';
import { DesignerPortfolio } from '@/components/designer-portfolio';

export const metadata = {
  title: 'Portfolio · Tickif',
};

export default async function DesignerPortfolioPage() {
  await requireAuth({ requiredRole: 'designer' });
  return <DesignerPortfolio />;
}
