import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SocialProfileInput } from '@/components/social-profile-confirmation';

function renderInput(value: string) {
  return render(
    <SocialProfileInput
      id="social-instagram"
      platform="instagram"
      value={value}
      onValueChange={vi.fn()}
    />,
  );
}

describe('compact social profile input', () => {
  it('keeps the safe external action inside the input group without below-input copy', () => {
    renderInput('@social.studio');
    const input = screen.getByRole('textbox', { name: 'Instagram' });
    const action = screen.getByRole('link', { name: /Open Instagram profile/ });
    expect(action).toHaveAttribute('href', 'https://www.instagram.com/social.studio');
    expect(action).toHaveAttribute('rel', 'noopener noreferrer');
    expect(action).toHaveAttribute('target', '_blank');
    expect(action.parentElement).toBe(input.parentElement);
    expect(screen.queryByText('https://www.instagram.com/social.studio')).not.toBeInTheDocument();
    expect(screen.queryByText(/Check that this opens/)).not.toBeInTheDocument();
  });

  it('leaves the optional empty input without an action or helper block', () => {
    renderInput('');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(/Optional\. Leave blank/)).not.toBeInTheDocument();
  });

  it('shows a wrong-platform error on hover and keeps the input editable', async () => {
    const user = userEvent.setup();
    renderInput('https://linkedin.com/in/social');
    const input = screen.getByRole('textbox', { name: 'Instagram' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'social-instagram-error');
    expect(input).toBeEnabled();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: 'Instagram link error' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/Instagram profile URL/);
  });

  it('exposes the error on keyboard focus and supports Escape and Enter toggling', async () => {
    const user = userEvent.setup();
    renderInput('javascript:alert(1)');
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Instagram link error' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/valid handle/);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/valid handle/);
  });

  it('keeps error details open after a touch-triggered click', async () => {
    renderInput('https://youtube.com/@social');
    const action = screen.getByRole('button', { name: 'Instagram link error' });
    fireEvent.pointerDown(action, { pointerType: 'touch' });
    fireEvent.pointerUp(action, { pointerType: 'touch' });
    fireEvent.click(action);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/Instagram profile URL/);
  });
});
