import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewOrganizationForm } from '../../src/components/new-organization-form';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  createOrganization: vi.fn(),
  selectContext: vi.fn(),
  submittedInput: null as unknown,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('../../src/lib/api', () => ({
  api: {
    api: {
      orgs: {
        $post: mocks.createOrganization,
        context: { $put: mocks.selectContext },
      },
    },
  },
}));

vi.mock('../../src/components/designer-onboarding', () => ({
  DesignerOnboarding: ({
    onSubmitOnboarding,
  }: {
    onSubmitOnboarding: (input: unknown) => Promise<unknown>;
  }) => (
    <button
      type="button"
      onClick={() => {
        mocks.submittedInput = { companyName: 'Studio Two' };
        void onSubmitOnboarding({ companyName: 'Studio Two' });
      }}
    >
      Submit organisation
    </button>
  ),
}));

describe('NewOrganizationForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createOrganization.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        profile: {
          id: '11111111-1111-4111-8111-111111111111',
          orgId: 'org-2',
          displayName: 'Studio Two',
          entityType: 'company',
          status: 'active',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
        organization: { id: 'org-2', name: 'Studio Two', slug: 'studio-two' },
      }),
    });
    mocks.selectContext.mockResolvedValue({ ok: true });
  });

  it('creates the organisation then selects it before landing', async () => {
    const user = userEvent.setup();
    render(<NewOrganizationForm signedInName="Asha" signedInAs="a@x.com" />);

    await user.click(screen.getByRole('button', { name: 'Submit organisation' }));

    await waitFor(() => {
      expect(mocks.createOrganization).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mocks.selectContext).toHaveBeenCalledWith({
        json: { kind: 'organization', organizationId: 'org-2' },
      });
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
