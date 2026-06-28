import { redirect } from 'next/navigation';

type EditDesignerProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditDesignerProjectPage({ params }: EditDesignerProjectPageProps) {
  const { id } = await params;
  redirect(`/designer/projects/upload?projectId=${id}`);
}
