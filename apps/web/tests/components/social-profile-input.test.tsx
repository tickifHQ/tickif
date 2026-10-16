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
  it('shows the generated URL beneath the input with a safe verification link', () => {
    renderInput('@social.studio');
    const input = screen.getByRole('textbox', { name: 'Instagram' });
    const action = screen.getByRole('link', { name: /Open Instagram profile/ });
    expect(action).toHaveAttribute('href', 'https://www.instagram.com/social.studio');
    expect(action).toHaveAttribute('rel', 'noopener noreferrer');
    expect(action).toHaveAttribute('target', '_blank');
    expect(action.parentElement).toBe(input.parentElement);
    const preview = screen.getByRole('link', { name: 'https://www.instagram.com/social.studio' });
    expect(preview).toHaveAttribute('href', action.getAttribute('href'));
    expect(preview).toHaveAttribute('target', '_blank');
    expect(preview).toHaveAttribute('rel', 'noopener noreferrer');
    expect(input).toHaveAttribute('aria-describedby', 'social-instagram-preview');
    expect(screen.getByText(/Check that this opens your profile/)).toBeVisible();
  });

  it('updates the preview when the handle changes and removes it for invalid or empty values', () => {
    const { rerender } = renderInput('@first');
    const update = (value: string) =>
      rerender(
        <SocialProfileInput
          id="social-instagram"
          platform="instagram"
          value={value}
          onValueChange={vi.fn()}
        />,
      );
    update('@second');
    expect(screen.queryByText('https://www.instagram.com/first')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://www.instagram.com/second' })).toBeVisible();
    update('https://linkedin.com/in/second');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    update('');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-describedby');
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
