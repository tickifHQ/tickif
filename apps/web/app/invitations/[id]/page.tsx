import { OrganizationInvitation } from '@/components/organization-invitation';

type OrganizationInvitationPageProps = {
  params: Promise<{ id: string }>;
};

export const metadata = {
  title: 'Studio invitation | Tickif',
};

export default async function OrganizationInvitationPage({
  params,
}: OrganizationInvitationPageProps) {
  const { id } = await params;
  return <OrganizationInvitation invitationId={id} />;
}
