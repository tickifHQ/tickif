import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ProtectedBfcacheGuard } from '../../src/components/protected-bfcache-guard';

const mock = vi.hoisted(() => ({
  router: {
    refresh: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mock.router,
}));

function dispatchPageShow(persisted: boolean) {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', {
    configurable: true,
    value: persisted,
  });
  window.dispatchEvent(event);
}

describe('ProtectedBfcacheGuard', () => {
  beforeEach(() => {
    mock.router.refresh.mockReset();
  });

  it('does not refresh on a normal pageshow', () => {
    render(<ProtectedBfcacheGuard />);

    dispatchPageShow(false);

    expect(mock.router.refresh).not.toHaveBeenCalled();
  });

  it('refreshes protected routes restored from browser back/forward cache', () => {
    render(<ProtectedBfcacheGuard />);

    dispatchPageShow(true);

    expect(mock.router.refresh).toHaveBeenCalledTimes(1);
  });
});
