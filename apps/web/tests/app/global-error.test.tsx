import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GlobalError from '../../app/global-error';

describe('GlobalError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a recoverable document and retries through the App Router reset callback', async () => {
    const error = new Error('root layout failed');
    const reset = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<GlobalError error={error} reset={reset} />);

    expect(document.documentElement).toHaveAttribute('lang', 'en');
    expect(document.body).toHaveClass('min-h-screen', 'bg-background', 'text-foreground');
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to discovery' })).toHaveAttribute('href', '/');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalledOnce();
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(error));
  });
});
