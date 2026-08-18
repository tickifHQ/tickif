'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PublicProjectGalleryImage } from '@repo/contracts';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@repo/ui/components/carousel';
import type { CarouselApi } from '@repo/ui/components/carousel';
import { Expand } from 'lucide-react';
import { ProtectedPublicImage } from '@/components/protected-public-image';

type HeroImage = Pick<PublicProjectGalleryImage, 'id' | 'roomName' | 'url'>;

export function ProjectHeroCarousel({
  images,
  projectTitle,
}: {
  images: HeroImage[];
  projectTitle: string;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!api) return;

    function updateActiveIndex() {
      setActiveIndex(api?.selectedScrollSnap() ?? 0);
    }

    updateActiveIndex();
    api.on('reInit', updateActiveIndex);
    api.on('select', updateActiveIndex);

    return () => {
      api.off('reInit', updateActiveIndex);
      api.off('select', updateActiveIndex);
    };
  }, [api]);

  if (images.length === 0) {
    return (
      <div
        role="img"
        aria-label={`${projectTitle} images unavailable`}
        className="grid aspect-[16/7] min-h-72 place-items-center rounded-xl bg-muted text-sm text-muted-foreground"
      >
        Project images are unavailable
      </div>
    );
  }

  const hasMultipleImages = images.length > 1;

  return (
    <Carousel
      aria-label="Project gallery"
      opts={{ align: 'center', loop: hasMultipleImages }}
      setApi={setApi}
      className="group overflow-hidden"
    >
      <CarouselContent className="ml-0 sm:-ml-3">
        {images.map((image, index) => (
          <CarouselItem
            key={image.id}
            aria-label={`Image ${index + 1} of ${images.length}`}
            className="basis-full pl-0 sm:basis-15/16 sm:pl-3"
          >
            <Link
              href={`/image/${image.id}`}
              aria-label={`Open ${image.roomName ?? projectTitle} image`}
              className="group/slide relative block aspect-[4/3] overflow-hidden rounded-xl bg-muted sm:aspect-[16/9] lg:aspect-[16/7]"
            >
              <ProtectedPublicImage
                src={image.url}
                alt={`${projectTitle}${image.roomName ? `, ${image.roomName}` : ''}`}
                className="size-full select-none object-cover"
                fetchPriority={index === 0 ? 'high' : undefined}
                loading={index === 0 ? 'eager' : 'lazy'}
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-foreground/5 via-transparent to-foreground/40" />
              {image.roomName ? (
                <span className="absolute bottom-5 left-5 rounded-md bg-foreground/60 px-3 py-2 text-sm font-medium text-background backdrop-blur-sm">
                  {image.roomName}
                </span>
              ) : null}
              <span className="absolute bottom-5 right-5 inline-flex items-center gap-1.5 rounded-full bg-background/95 px-3 py-2 text-xs font-medium text-foreground opacity-0 shadow-sm transition-opacity group-hover/slide:opacity-100 group-focus-within/slide:opacity-100 motion-reduce:transition-none">
                Open
                <Expand aria-hidden className="size-3.5" />
              </span>
            </Link>
          </CarouselItem>
        ))}
      </CarouselContent>

      {hasMultipleImages ? (
        <>
          <CarouselPrevious
            variant="neutral"
            size="icon"
            aria-label="Previous project image"
            className="left-3 size-10 rounded-md opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none sm:left-14"
          />
          <CarouselNext
            variant="neutral"
            size="icon"
            aria-label="Next project image"
            className="right-3 size-10 rounded-md opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none sm:right-14"
          />
        </>
      ) : null}

      <p className="sr-only" aria-live="polite">
        Image {activeIndex + 1} of {images.length}
      </p>
    </Carousel>
  );
}
