import { ImageResponse } from 'next/og';
import { PublicSocialCard } from '@/components/public-social-card';
import { fetchPublicProject, isUnavailableProject } from '@/lib/public-project-api';
import { socialImageData, SOCIAL_IMAGE_HEADERS } from '@/lib/social-image';
import { SOCIAL_IMAGE_SIZE } from '@/lib/social-metadata';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await fetchPublicProject(id);
  if (!project || isUnavailableProject(project))
    return new Response('Project not found', { status: 404, headers: SOCIAL_IMAGE_HEADERS });
  const [image, logo] = await Promise.all([
    socialImageData(project.coverImageUrl),
    socialImageData(project.designer.logoUrl),
  ]);
  const eyebrow =
    [
      project.specifications.city?.label ?? project.specifications.cityName,
      project.specifications.propertySubtype?.label ?? project.specifications.propertyType?.label,
    ]
      .filter(Boolean)
      .join(' · ') || 'A published project on Tickif';
  return new ImageResponse(
    <PublicSocialCard
      title={project.title}
      eyebrow={eyebrow}
      image={image}
      studio={project.designer.displayName}
      logo={logo}
    />,
    { ...SOCIAL_IMAGE_SIZE, headers: SOCIAL_IMAGE_HEADERS },
  );
}
