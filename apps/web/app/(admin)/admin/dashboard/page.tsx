import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Admin dashboard · Tickif',
};

/** Keep the existing dashboard URL as a stable entry point for moderation. */
export default function AdminDashboardPage() {
  redirect('/admin/moderation');
}
