'use client';

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { DesignerLogoAvatar } from '@/components/designer-logo-avatar';
import { EnquiryCta } from '@/components/enquiry-cta';

/** The reference's floating control appears after the hero and yields to the
 * full enquiry section. Reuses the same real eligibility/authentication flow. */
export function ProfileFloatingEnquiry({
  designerProfileId,
  designerName,
  logoUrl,
  initials,
  loginHref,
}: {
  designerProfileId: string;
  designerName: string;
  logoUrl: string | null;
  initials: string;
  loginHref: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const hero = document.querySelector('[aria-label="Portfolio hero"]');
    const enquiry = document.getElementById('enquire');
    if (!hero || !enquiry) return;
    let heroVisible = true;
    let enquiryVisible = false;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === hero) heroVisible = entry.isIntersecting;
        if (entry.target === enquiry) enquiryVisible = entry.isIntersecting;
      }
      setVisible(!heroVisible && !enquiryVisible);
    });
    observer.observe(hero);
    observer.observe(enquiry);
    return () => observer.disconnect();
  }, []);
  return (
    <aside
      className="profile-floating"
      aria-label="Contact this studio"
      data-visible={visible}
      aria-hidden={!visible}
      inert={!visible}
    >
      <DesignerLogoAvatar
        logoUrl={logoUrl}
        alt=""
        sizePx={38}
        className="size-9.5 shrink-0 bg-primary text-primary-foreground"
        fallback={initials}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{designerName}</p>
        <p className="text-xs opacity-65">Enquire on Tickif</p>
      </div>
      <EnquiryCta
        context={{ type: 'designer', designerName }}
        designerProfileId={designerProfileId}
        loginHref={loginHref}
        ariaLabel="Enquire about this studio"
        variant="default"
        className="profile-floating-action h-10 shrink-0 px-5"
      >
        Enquire <ArrowRight className="size-4" />
      </EnquiryCta>
    </aside>
  );
}
