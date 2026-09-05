import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PersonalSettingsForm } from '../../src/components/personal-settings-form';

const mock = vi.hoisted(() => ({
  patch: vi.fn(),
  get: vi.fn(),
  refresh: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock('@/lib/api', () => ({
  api: { api: { 'personal-account': { me: { $patch: mock.patch, $get: mock.get } } } },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
vi.mock('@/lib/auth-client', () => ({ authClient: { getSession: mock.getSession } }));
const original = {
  name: 'Original Name',
  address: 'Old address',
  whatsappNumber: null,
  email: 'person@example.com',
  emailVerified: true,
  phoneNumber: '+919876543210',
  phoneNumberVerified: true,
  revision: 'a'.repeat(64),
};
const saved = { ...original, name: 'New Name', address: null, revision: 'b'.repeat(64) };
beforeEach(() => {
  vi.clearAllMocks();
  mock.getSession.mockResolvedValue({});
});

describe('personal settings', () => {
  it('loads persisted values and displays contact verification without editable identities', () => {
    render(<PersonalSettingsForm initialAccount={original} />);
    expect(screen.getByLabelText('Display name')).toHaveValue(original.name);
    expect(screen.getByLabelText('Personal address (optional)')).toHaveValue(original.address);
    expect(screen.getByText('person@example.com (Verified)')).toBeInTheDocument();
    expect(screen.getByText('+919876543210 (Verified)')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });
  it('saves through the API, clears optional data, refreshes identity and reopens with persisted data', async () => {
    const user = userEvent.setup();
    mock.patch.mockResolvedValue(Response.json(saved));
    const view = render(<PersonalSettingsForm initialAccount={original} />);
    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), saved.name);
    await user.clear(screen.getByLabelText('Personal address (optional)'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Personal settings saved.');
    expect(mock.patch).toHaveBeenCalledWith({
      json: { name: saved.name, address: null, whatsappNumber: null, revision: original.revision },
    });
    expect(mock.refresh).toHaveBeenCalled();
    view.unmount();
    render(<PersonalSettingsForm initialAccount={saved} />);
    expect(screen.getByLabelText('Display name')).toHaveValue(saved.name);
    expect(screen.getByLabelText('Personal address (optional)')).toHaveValue('');
  });
  it('retains edits and allows retry after a failed save', async () => {
    const user = userEvent.setup();
    mock.patch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json({ ...original, address: 'New address' }));
    render(<PersonalSettingsForm initialAccount={original} />);
    await user.clear(screen.getByLabelText('Personal address (optional)'));
    await user.type(screen.getByLabelText('Personal address (optional)'), 'New address');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your changes are still here');
    expect(screen.getByLabelText('Personal address (optional)')).toHaveValue('New address');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('status')).toHaveTextContent('saved');
  });
  it('blocks stale saves and reloads the current revision before accepting edits', async () => {
    const user = userEvent.setup();
    mock.patch.mockResolvedValueOnce(
      Response.json({ error: { message: 'Settings changed elsewhere.' } }, { status: 409 }),
    );
    mock.get.mockResolvedValue(Response.json(saved));
    render(<PersonalSettingsForm initialAccount={original} />);
    await user.type(screen.getByLabelText('Personal address (optional)'), ' edit');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Settings changed elsewhere');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reload latest settings' }));
    expect(screen.getByLabelText('Display name')).toHaveValue(saved.name);
    await user.type(screen.getByLabelText('Personal address (optional)'), 'Fresh edit');
    mock.patch.mockResolvedValue(Response.json({ ...saved, address: 'Fresh edit' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(mock.patch).toHaveBeenLastCalledWith({
      json: {
        name: saved.name,
        address: 'Fresh edit',
        whatsappNumber: null,
        revision: saved.revision,
      },
    });
  });
  it('rejects malformed WhatsApp before sending and labels its invalid field', async () => {
    const user = userEvent.setup();
    render(<PersonalSettingsForm initialAccount={original} />);
    await user.type(screen.getByLabelText('WhatsApp number (optional)'), 'not a number');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('country code');
    expect(screen.getByLabelText('WhatsApp number (optional)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(mock.patch).not.toHaveBeenCalled();
  });
});
