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
  ConsultationsPage: () => <div>Consultations inbox</div>,
}));

describe('legacy designer consultations route', () => {
  beforeEach(() => {
    mock.redirect.mockReset();
    mock.consultationsEnabled = false;
  });

  it('redirects to the unified Leads page', async () => {
    const { default: Page } =
      await import('../../../../app/(designer)/designer/consultations/page');

    Page({ searchParams: Promise.resolve({}) });

    expect(mock.redirect).toHaveBeenCalledWith('/designer/leads');
  });

  it('renders the consultation inbox only when the feature is enabled', async () => {
    mock.consultationsEnabled = true;
    const { default: Page } =
      await import('../../../../app/(designer)/designer/consultations/page');

    expect(Page({ searchParams: Promise.resolve({}) })).toBeTruthy();
    expect(mock.redirect).not.toHaveBeenCalled();
  });
});
