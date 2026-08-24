import { notFound } from 'next/navigation';
import { SubscribeDemo } from '@/components/subscribe/subscribe-demo';

export const metadata = {
  title: 'Subscribe Flow Demo · Tickif',
};

/**
 * Development-only demo route for the E-120 Subscribe flow.
 * Returns 404 in production to prevent fake subscription operations.
 */
export default function SubscribeDemoPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <SubscribeDemo />;
}
