import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Carousel,
  CarouselContent,
  CarouselControls,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '../../src/components/carousel';

const carouselMocks = vi.hoisted(() => {
  const scrollNext = vi.fn();
  const scrollPrev = vi.fn();
  const api = {
    canScrollNext: vi.fn(() => true),
    canScrollPrev: vi.fn(() => true),
    off: vi.fn(),
    on: vi.fn(),
    scrollNext,
    scrollPrev,
  };
  const useEmblaCarousel = vi.fn(() => [vi.fn(), api]);

  return { api, scrollNext, scrollPrev, useEmblaCarousel };
});

vi.mock('embla-carousel-react', () => ({
  default: carouselMocks.useEmblaCarousel,
}));

describe('Carousel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes looping options to Embla and exposes accessible slide controls', async () => {
    const user = userEvent.setup();

    render(
      <Carousel aria-label="Project images" opts={{ loop: true }}>
        <CarouselContent>
          <CarouselItem>Living room</CarouselItem>
          <CarouselItem>Dining area</CarouselItem>
        </CarouselContent>
        <CarouselControls>
          <CarouselPrevious />
          <CarouselNext />
        </CarouselControls>
      </Carousel>,
    );

    expect(carouselMocks.useEmblaCarousel).toHaveBeenCalledWith(
      expect.objectContaining({ axis: 'x', loop: true }),
      undefined,
    );
    expect(screen.getByRole('region', { name: 'Project images' })).toHaveAttribute(
      'aria-roledescription',
      'carousel',
    );
    expect(screen.getAllByRole('group')).toHaveLength(2);

    const previousButton = screen.getByRole('button', { name: 'Previous slide' });
    const nextButton = screen.getByRole('button', { name: 'Next slide' });

    expect(previousButton.querySelector('.lucide-chevron-left')).toBeInTheDocument();
    expect(nextButton.querySelector('.lucide-chevron-right')).toBeInTheDocument();

    await user.click(nextButton);
    expect(carouselMocks.scrollNext).toHaveBeenCalledOnce();

    fireEvent.keyDown(screen.getByRole('region', { name: 'Project images' }), {
      key: 'ArrowLeft',
    });
    expect(carouselMocks.scrollPrev).toHaveBeenCalledOnce();
  });

  it('hides controls when every slide fits in the viewport', () => {
    carouselMocks.api.canScrollNext.mockReturnValue(false);
    carouselMocks.api.canScrollPrev.mockReturnValue(false);

    render(
      <Carousel aria-label="Project images">
        <CarouselContent>
          <CarouselItem>Living room</CarouselItem>
        </CarouselContent>
        <CarouselControls>
          <CarouselPrevious />
          <CarouselNext />
        </CarouselControls>
      </Carousel>,
    );

    expect(screen.queryByRole('button', { name: 'Previous slide' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next slide' })).toBeNull();
  });

  it('does not intercept arrow keys from interactive descendants', () => {
    render(
      <Carousel aria-label="Project images">
        <CarouselContent>
          <CarouselItem>
            <a href="/image/example">Open image</a>
          </CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    const link = screen.getByRole('link', { name: 'Open image' });
    const eventResult = fireEvent.keyDown(link, { key: 'ArrowRight' });

    expect(eventResult).toBe(true);
    expect(carouselMocks.scrollNext).not.toHaveBeenCalled();
  });
});
