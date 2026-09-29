import { config } from '@repo/config';
import { BookingCta } from '@/components/booking-cta';
import { EnquiryCta } from '@/components/enquiry-cta';

export function ConsultationCta({
  consultationsEnabled = config.CONSULTATIONS_ENABLED,
  designerProfileId,
  designerName,
  referredProjectId,
  projectName,
  loginHref,
  className,
}: {
  consultationsEnabled?: boolean;
  designerProfileId: string;
  designerName: string;
  referredProjectId?: string;
  projectName?: string;
  loginHref: string;
  className?: string;
}) {
  if (consultationsEnabled) {
    return (
      <BookingCta
        designerProfileId={designerProfileId}
        designerName={designerName}
        referredProjectId={referredProjectId}
        loginHref={loginHref}
        className={className}
      />
    );
  }

  const context =
    referredProjectId && projectName
      ? { type: 'project' as const, projectName, designerName }
      : { type: 'designer' as const, designerName };

  return (
    <EnquiryCta
      context={context}
      designerProfileId={designerProfileId}
      referredProjectId={referredProjectId}
      loginHref={loginHref}
      variant="outline"
      className={className}
      ariaLabel="Send enquiry"
    >
      Send enquiry
    </EnquiryCta>
  );
}
