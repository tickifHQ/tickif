import { SubscribePage } from '@/components/subscribe/subscribe-page';

export const metadata = {
  title: 'Subscribe · Tickif',
};

/**
 * E-120 Subscribe page.
 * Server component wrapper — the client component handles state and API calls.
 */
export default function DesignerSubscribePage() {
  return <SubscribePage />;
}
