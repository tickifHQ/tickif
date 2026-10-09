import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PortfolioAccentColor } from '../../src/components/portfolio-accent-color';

describe('PortfolioAccentColor', () => {
  it('previews valid custom hex before applying it with the keyboard', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PortfolioAccentColor value="#FF8F73" onChange={onChange} />);
    const input = screen.getByLabelText('Custom accent hex');
    await user.clear(input);
    await user.type(input, '#123abc');
    expect(
      screen
        .getByRole('region', { name: 'Accent colour preview' })
        .style.getPropertyValue('--primary'),
    ).toBe('#123ABC');
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('#123ABC');
  });

  it.each(['', '#fff', '#12345G', 'red', 'url(https://example.test)', '#123456; color:red'])(
    'rejects invalid draft %s without previewing or applying it',
    (value) => {
      const onChange = vi.fn();
      render(<PortfolioAccentColor value="#FF8F73" onChange={onChange} />);
      fireEvent.change(screen.getByLabelText('Custom accent hex'), { target: { value } });
      expect(screen.getByLabelText('Custom accent hex')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('alert')).toHaveTextContent('Enter a six-digit hex colour');
      expect(
        screen
          .getByRole('region', { name: 'Accent colour preview' })
          .style.getPropertyValue('--primary'),
      ).toBe('#FF8F73');
      expect(screen.getByRole('button', { name: 'Use colour' })).toBeDisabled();
      fireEvent.keyDown(screen.getByLabelText('Custom accent hex'), { key: 'Enter' });
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it('cancels a draft and keeps picker changes local until applied', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PortfolioAccentColor value="#FF8F73" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Choose custom accent colour'), {
      target: { value: '#223344' },
    });
    expect(screen.getByLabelText('Custom accent hex')).toHaveValue('#223344');
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel colour change' }));
    expect(screen.getByLabelText('Custom accent hex')).toHaveValue('#FF8F73');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds Tickif green alongside the eight presets and replaces a draft with a preset', async () => {
    function Harness() {
      const [value, setValue] = useState('#234567');
      return <PortfolioAccentColor value={value} onChange={setValue} />;
    }
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Accent colour preset' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(9);
    expect(screen.getByRole('menuitem', { name: /Tickif green/ })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /Forest green/ }));
    expect(screen.getByLabelText('Custom accent hex')).toHaveValue('#2D8659');
    fireEvent.change(screen.getByLabelText('Custom accent hex'), { target: { value: '#ABCDEF' } });
    await user.click(screen.getByRole('button', { name: 'Accent colour preset' }));
    await user.click(screen.getByRole('menuitem', { name: /Forest green/ }));
    expect(screen.getByLabelText('Custom accent hex')).toHaveValue('#2D8659');
    expect(
      screen
        .getByRole('region', { name: 'Accent colour preview' })
        .style.getPropertyValue('--primary'),
    ).toBe('#2D8659');
  });
});
