'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { ExperienceCenter, PublicPortfolioResponse } from '@repo/contracts';
import { MapPin, Navigation, Phone, MessageSquare } from 'lucide-react';
import { GoogleMapEmbed, googleMapEmbedUrl } from '@repo/ui/components/google-map-embed';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@repo/ui/components/tabs';
import { EnquiryCta } from '@/components/enquiry-cta';

function mapsLink(centre: ExperienceCenter) {
  if (googleMapEmbedUrl(centre.mapsUrl)) {
    return `https://www.google.com/maps/search/?${new URLSearchParams({
      api: '1',
      query: [centre.address, centre.city, centre.state].filter(Boolean).join(', '),
    })}`;
  }
  if (!centre.mapsUrl) return null;
  try {
    const url = new URL(centre.mapsUrl);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** One selected centre drives the map, contact details and navigation link. */
export function ProfileExperienceCentres({
  centres,
  portfolio,
  loginHref,
}: {
  centres: ExperienceCenter[];
  portfolio: PublicPortfolioResponse;
  loginHref: string;
}) {
  const [selected, setSelected] = useState('0');
  const centre = centres[Number(selected)];
  if (!centre) return null;
  const mapsHref = mapsLink(centre);
  const phone = centre.phone?.trim();
  const digits = phone?.replace(/\D/g, '');
  const callHref = digits ? `tel:${phone?.startsWith('+') ? '+' : ''}${digits}` : null;
  const preview =
    portfolio.heroCoverUrl ??
    portfolio.projects.projects.find((project) => project.coverImageUrl)?.coverImageUrl;
  const location = [centre.city, centre.state].filter(Boolean).join(', ');

  return (
    <Tabs
      value={selected}
      onValueChange={setSelected}
      className="profile-centres-card"
      data-slot="experience-center-card"
    >
      <div className="profile-centres-map">
        <TabsList aria-label="Experience centres" className="profile-centre-selector">
          {centres.map((item, index) => (
            <TabsTrigger
              value={String(index)}
              key={`${item.name}-${index}`}
              aria-label={item.name}
              title={item.name}
            >
              <span className="profile-centre-pin" aria-hidden="true" />
              <span className="truncate">
                {centres.filter((entry) => entry.city === item.city).length > 1
                  ? item.address.split(',')[0] || item.name
                  : item.city}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {centres.map((item, index) => (
          <TabsContent key={index} value={String(index)} className="profile-centre-map-panel">
            <GoogleMapEmbed
              src={item.mapsUrl}
              query={[item.address, item.city, item.state, item.postalCode]
                .filter(Boolean)
                .join(', ')}
              title={`Google Maps — ${item.name}`}
              className="profile-centre-map"
            />
          </TabsContent>
        ))}
      </div>
      <aside className="profile-centre-details" aria-label="Selected experience centre">
        {preview ? (
          <figure className="profile-centre-photo">
            <Image
              src={preview}
              alt={`${portfolio.displayName} portfolio`}
              width={400}
              height={200}
              unoptimized
              className="h-full w-full object-cover"
            />
            <figcaption>Studio portfolio</figcaption>
          </figure>
        ) : null}
        <header className="profile-centre-heading">
          <h3>{centre.name}</h3>
          <p>
            {location}
            {centre.postalCode ? ` · ${centre.postalCode}` : ''}
          </p>
        </header>
        <Tabs key={selected} defaultValue="overview" className="profile-centre-content">
          <TabsList
            variant="line"
            aria-label="Centre information"
            className="profile-centre-detail-tabs"
          >
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {portfolio.bio ? <TabsTrigger value="about">About the studio</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="overview">
            <div className="profile-centre-detail-row">
              <MapPin className="size-5 shrink-0" aria-hidden="true" />
              <address className="not-italic">
                {centre.address}
                {centre.postalCode ? <span className="block">{centre.postalCode}</span> : null}
              </address>
            </div>
            {callHref && phone ? (
              <div className="profile-centre-detail-row">
                <Phone className="size-5 shrink-0" aria-hidden="true" />
                <a href={callHref} className="break-all underline-offset-4 hover:underline">
                  {phone}
                </a>
              </div>
            ) : null}
            {mapsHref ? (
              <div className="profile-centre-detail-row">
                <Navigation className="size-5 shrink-0" aria-hidden="true" />
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Open in Maps
                </a>
              </div>
            ) : null}
            <div className="profile-centre-detail-row">
              <MessageSquare className="size-5 shrink-0" aria-hidden="true" />
              <div>
                <p>Ask the studio about visiting</p>
                <EnquiryCta
                  context={{
                    type: 'designer',
                    designerName: portfolio.displayName,
                    designerLocation: location,
                    designerLogoUrl: portfolio.logoUrl,
                  }}
                  designerProfileId={portfolio.profileId}
                  loginHref={loginHref}
                  variant="link"
                  className="h-auto justify-start p-0"
                >
                  Enquire →
                </EnquiryCta>
              </div>
            </div>
          </TabsContent>
          {portfolio.bio ? (
            <TabsContent
              value="about"
              className="px-[22px] py-5 text-sm leading-relaxed whitespace-pre-wrap break-words"
            >
              {portfolio.bio}
            </TabsContent>
          ) : null}
        </Tabs>
      </aside>
    </Tabs>
  );
}
