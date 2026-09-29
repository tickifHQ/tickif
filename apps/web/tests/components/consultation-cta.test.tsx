import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConsultationCta } from '../../src/components/consultation-cta';

vi.mock('@/components/booking-cta', () => ({
  BookingCta: () => <button type="button">Scheduled consultation workflow</button>,
}));

vi.mock('@/components/enquiry-cta', () => ({
  EnquiryCta: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

describe('ConsultationCta', () => {
  it('uses the enquiry label and workflow when consultations are disabled', () => {
    render(
      <ConsultationCta
        consultationsEnabled={false}
        designerProfileId="11111111-1111-4111-8111-111111111111"
        designerName="Studio One"
        loginHref="/login"
      />,
    );

    expect(screen.getByRole('button', { name: 'Send enquiry' })).toBeInTheDocument();
    expect(screen.queryByText('Scheduled consultation workflow')).not.toBeInTheDocument();
  });

  it('restores the scheduling workflow only when explicitly enabled', () => {
    render(
      <ConsultationCta
        consultationsEnabled
        designerProfileId="11111111-1111-4111-8111-111111111111"
        designerName="Studio One"
        loginHref="/login"
      />,
    );

    expect(screen.getByText('Scheduled consultation workflow')).toBeInTheDocument();
  });
});
