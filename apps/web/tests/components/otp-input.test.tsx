import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OtpInput } from '../../src/components/otp-input';

function Harness({
  onComplete,
  autoSubmit = true,
}: {
  onComplete: (digits: string[]) => void;
  autoSubmit?: boolean;
}) {
  const [value, setValue] = useState(Array<string>(6).fill(''));
  return (
    <OtpInput value={value} onChange={setValue} onComplete={onComplete} autoSubmit={autoSubmit} />
  );
}

describe('OtpInput', () => {
  it('submits exactly the six newly typed digits, not the previous render value', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<Harness onComplete={onComplete} />);
    await user.type(screen.getByRole('textbox', { name: 'OTP digit 1' }), '12345');
    expect(onComplete).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox', { name: 'OTP digit 6' }), '6');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(['1', '2', '3', '4', '5', '6']);
  });

  it('supports autofill and sanitized paste with six digits only', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const first = screen.getByRole('textbox', { name: 'OTP digit 1' });
    fireEvent.change(first, { target: { value: '123456' } });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(['1', '2', '3', '4', '5', '6']);
    onComplete.mockClear();
    fireEvent.paste(first, { clipboardData: { getData: () => '98 76-54 extra' } });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(['9', '8', '7', '6', '5', '4']);
  });

  it('does not automatically submit verification flows that have not opted in', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} autoSubmit={false} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'OTP digit 1' }), {
      target: { value: '123456' },
    });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('permits Delete and backspace without verifying an incomplete code', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<Harness onComplete={onComplete} autoSubmit={false} />);
    const first = screen.getByRole('textbox', { name: 'OTP digit 1' });
    fireEvent.change(first, { target: { value: '123456' } });
    await user.click(first);
    await user.keyboard('{Delete}');
    expect(first).toHaveValue('');
    await user.click(screen.getByRole('textbox', { name: 'OTP digit 2' }));
    await user.keyboard('{Backspace}');
    expect(screen.getByRole('textbox', { name: 'OTP digit 2' })).toHaveValue('');
    expect(onComplete).not.toHaveBeenCalled();
  });
});
