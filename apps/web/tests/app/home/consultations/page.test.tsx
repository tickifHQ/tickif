import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ redirect: vi.fn(), consultationsEnabled: false }));

vi.mock('next/navigation', () => ({
  redirect: mock.redirect,
}));

vi.mock('@repo/config', () => ({
  config: {
    get CONSULTATIONS_ENABLED() {
      return mock.consultationsEnabled;
    },
  },
}));

vi.mock('@/components/consultations-page', () => ({
  ConsultationsPage: () => <div>My consultations</div>,
}));

describe('personal consultations route', () => {
  beforeEach(() => {
    mock.redirect.mockReset();
    mock.consultationsEnabled = false;
  });

  it('redirects to enquiries while consultations are disabled', async () => {
    const { default: Page } = await import('../../../../app/(protected)/home/consultations/page');

    Page({ searchParams: Promise.resolve({}) });

    expect(mock.redirect).toHaveBeenCalledWith('/enquiries');
  });

  it('renders consultation history only when explicitly enabled', async () => {
    mock.consultationsEnabled = true;
    const { default: Page } = await import('../../../../app/(protected)/home/consultations/page');

    expect(Page({ searchParams: Promise.resolve({}) })).toBeTruthy();
    expect(mock.redirect).not.toHaveBeenCalled();
  });
});
