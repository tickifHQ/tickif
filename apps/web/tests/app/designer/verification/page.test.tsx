import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  fetchState: vi.fn(),
  headers: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: mock.headers }));
vi.mock('@/lib/auth-guard', () => ({ requireAuth: mock.requireAuth }));
vi.mock('@/lib/verification-api', () => ({ fetchVerificationState: mock.fetchState }));
vi.mock('@/components/designer-verification', () => ({
  DesignerVerification: ({ initialState }: { initialState: unknown }) => (
    <div data-testid="designer-verification">{initialState ? 'loaded' : 'error'}</div>
  ),
}));

describe('DesignerVerificationPage', () => {
  it('renders the verification experience', async () => {
    mock.requireAuth.mockResolvedValue({ user: { role: 'designer' } });
    mock.headers.mockResolvedValue(new Headers({ cookie: 'session=valid' }));
    mock.fetchState.mockResolvedValue({ applicationId: 'verification-1' });
    const { default: Page } = await import('../../../../app/(designer)/designer/verification/page');

    render(await Page());

    expect(screen.getByTestId('designer-verification')).toHaveTextContent('loaded');
    expect(mock.fetchState).toHaveBeenCalledWith({ cookie: 'session=valid' });
  });
});
