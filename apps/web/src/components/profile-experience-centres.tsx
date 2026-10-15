'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { ExperienceCenter, PublicPortfolioResponse } from '@repo/contracts';
import { CalendarDays, MapPin, Navigation, Phone, Star } from 'lucide-react';
import { GoogleMapEmbed, googleMapEmbedUrl } from '@repo/ui/components/google-map-embed';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@repo/ui/components/tabs';
import { formatRating } from '@/lib/public-portfolio-view';

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
}: {
  centres: ExperienceCenter[];
  portfolio: PublicPortfolioResponse;
  loginHref: string;
}) {
  const [selected, setSelected] = useState('0');
  const centre = centres[Number(selected)];
  if (!centre) return null;
  const mapsHref = mapsLink(centre);
  const preview =
    portfolio.heroCoverUrl ??
    portfolio.projects.projects.find((project) => project.coverImageUrl)?.coverImageUrl;
  const states = [...new Set(centres.map((item) => item.state))];
  const googleRating =
    portfolio.sections.overallRating && portfolio.reviewVisibility.google.overallRating
      ? portfolio.stats.google
      : null;
  const phone = centre.phone?.trim();
  const digits = phone?.replace(/\D/g, '');
  const callHref = digits ? `tel:${phone?.startsWith('+') ? '+' : ''}${digits}` : null;

  return (
    <Tabs
      value={selected}
      onValueChange={setSelected}
      className="profile-centres-card"
      data-slot="experience-center-card"
    >
      <div className="profile-centres-map">
        <TabsList aria-label="Experience centres" className="profile-centre-selector">
          {states.map((state) => (
            <div
              key={state}
              role="group"
              aria-label={state}
              className="flex flex-wrap items-center gap-1.5"
            >
              <span className="rounded-lg bg-card px-2 py-1 font-mono text-xs text-card-foreground">
                {state}
              </span>
              {centres.map((item, index) =>
                item.state === state ? (
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
                ) : null,
              )}
            </div>
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
          </figure>
        ) : null}
        <header className="profile-centre-heading">
          <h3>{centre.name}</h3>
          <p>{[centre.city, centre.state].filter(Boolean).join(', ')}</p>
          {googleRating && googleRating.reviewCount > 0 ? (
            <div className="profile-centre-rating">
              <strong>{formatRating(googleRating.rating)}</strong>
              <span aria-label={`${formatRating(googleRating.rating)} out of 5`}>
                {Array.from({ length: 5 }, (_, index) => (
                  <Star
                    key={index}
                    aria-hidden="true"
                    className={index < Math.round(googleRating.rating) ? 'is-filled' : undefined}
                  />
                ))}
              </span>
              <em>({googleRating.reviewCount})</em>
              <i aria-hidden="true">·</i>
              <b>Interior design showroom</b>
            </div>
          ) : null}
        </header>
        <div className="profile-centre-content">
          <div className="profile-centre-detail-row">
            <MapPin className="size-5 shrink-0" aria-hidden="true" />
            {mapsHref ? (
              <a href={mapsHref} target="_blank" rel="noopener noreferrer nofollow">
                {centre.address}
                {centre.postalCode ? <span className="block">{centre.postalCode}</span> : null}
              </a>
            ) : (
              <address className="not-italic">
                {centre.address}
                {centre.postalCode ? <span className="block">{centre.postalCode}</span> : null}
              </address>
            )}
          </div>
          {callHref && phone ? (
            <div className="profile-centre-detail-row">
              <Phone className="size-5 shrink-0" aria-hidden="true" />
              <a href={callHref}>{phone}</a>
            </div>
          ) : null}
          {mapsHref ? (
            <div className="profile-centre-detail-row">
              <Navigation className="size-5 shrink-0" aria-hidden="true" />
              <a href={mapsHref} target="_blank" rel="noopener noreferrer nofollow">
                Open in Maps
              </a>
            </div>
          ) : null}
          <div className="profile-centre-detail-row">
            <CalendarDays className="size-5 shrink-0" aria-hidden="true" />
            <p>Contact the studio to arrange a visit</p>
          </div>
        </div>
      </aside>
    </Tabs>
  );
}
