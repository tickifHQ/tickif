import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanyStory } from '../../src/components/profile-company-story';

afterEach(() => vi.restoreAllMocks());
describe('company story disclosure', () => {
  it('expands overflowing copy without losing the company story', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(140);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(84);
    const user = userEvent.setup();
    render(<CompanyStory story="Our complete company story." />);
    const button = screen.getByRole('button', { name: 'Read more' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(screen.getByText('Our complete company story.')).toHaveClass('is-expanded');
    expect(screen.getByRole('button', { name: 'Read less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Read less' }));
    expect(screen.getByText('Our complete company story.')).not.toHaveClass('is-expanded');
  });
  it('omits the disclosure when all copy fits', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(42);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(42);
    render(<CompanyStory story="Short company story." />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
