import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EnquiryFunnelChart,
  ProfileStrengthChart,
} from '../../src/components/designer-analytics-charts';

class ChartResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe() {
    this.callback([{ contentRect: { width: 208, height: 208 } } as ResizeObserverEntry], this);
  }

  unobserve() {}

  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ChartResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EnquiryFunnelChart', () => {
  it('positions each stage marker at the start of its proportional segment', () => {
    const { container } = render(
      <EnquiryFunnelChart leads={{ total: 15, new: 5, contacted: 3, closed: 5, spam: 2 }} />,
    );

    expect(container.querySelector('[data-enquiry-stage="new"]')).toHaveStyle({ left: '0%' });
    expect(container.querySelector('[data-enquiry-stage="contacted"]')).toHaveStyle({
      left: '33.33333333333333%',
    });
    expect(container.querySelector('[data-enquiry-stage="closed"]')).toHaveStyle({
      left: '53.333333333333336%',
    });
    expect(container.querySelector('[data-enquiry-stage="spam"]')).toHaveStyle({
      left: '86.66666666666667%',
    });
  });

  it('omits markers for empty stages so labels do not overlap', () => {
    const { container } = render(
      <EnquiryFunnelChart leads={{ total: 5, new: 5, contacted: 0, closed: 0, spam: 0 }} />,
    );

    expect(container.querySelector('[data-enquiry-stage="new"]')).toBeInTheDocument();
    expect(container.querySelector('[data-enquiry-stage="contacted"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-enquiry-stage="closed"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-enquiry-stage="spam"]')).not.toBeInTheDocument();
  });
});

describe('ProfileStrengthChart', () => {
  it('renders equal-length profile segments with fully rounded ends', () => {
    const { container } = render(
      <ProfileStrengthChart
        profileCompletion={{
          score: 78,
          missing: [],
          steps: [],
        }}
      />,
    );

    const segments = Array.from(
      container.querySelectorAll<SVGLineElement>('.recharts-polar-grid-angle line'),
    );
    const segmentLengths = segments.map((segment) =>
      Math.hypot(
        Number(segment.getAttribute('x2')) - Number(segment.getAttribute('x1')),
        Number(segment.getAttribute('y2')) - Number(segment.getAttribute('y1')),
      ),
    );
    const backgroundSegments = segments.slice(0, 50);
    const firstSegment = backgroundSegments[0]!;
    const lastSegment = backgroundSegments.at(-1)!;

    expect(segments).toHaveLength(89);
    expect(segments.every((segment) => segment.getAttribute('stroke-linecap') === 'round')).toBe(
      true,
    );
    expect(segments.every((segment) => segment.getAttribute('stroke-width') === '6')).toBe(true);
    expect(segmentLengths.every((length) => Math.abs(length - segmentLengths[0]!) < 0.001)).toBe(
      true,
    );
    expect(Number(firstSegment.getAttribute('x1'))).toBeLessThan(100);
    expect(Number(lastSegment.getAttribute('x1'))).toBeGreaterThan(100);
    expect(Number(firstSegment.getAttribute('y1'))).toBeGreaterThan(100);
    expect(Number(lastSegment.getAttribute('y1'))).toBeGreaterThan(100);
    expect(
      Math.max(...backgroundSegments.map((segment) => Number(segment.getAttribute('y1')))),
    ).toBeLessThan(168);
  });
});
