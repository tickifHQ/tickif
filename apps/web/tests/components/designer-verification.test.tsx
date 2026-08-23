import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerificationStateResponse } from '@repo/contracts';
import { DesignerVerification } from '../../src/components/designer-verification';

const mock = vi.hoisted(() => ({
  fetchState: vi.fn(),
  removeDocument: vi.fn(),
  sendOtp: vi.fn(),
  submit: vi.fn(),
  updateUser: vi.fn(),
  uploadDocument: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock('@/lib/verification-api', () => ({
  fetchVerificationState: mock.fetchState,
  removeVerificationDocument: mock.removeDocument,
  submitVerification: mock.submit,
  uploadVerificationDocument: mock.uploadDocument,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    phoneNumber: {
      sendOtp: mock.sendOtp,
      verify: mock.verifyOtp,
    },
    updateUser: mock.updateUser,
  },
}));

const verifiedState: VerificationStateResponse = {
  applicationId: '11111111-1111-4111-8111-111111111111',
  status: 'verified',
  attempt: 1,
  identity: {
    ownerName: 'Anika Sharma',
    ownerPhone: '+919843211210',
    canEdit: true,
  },
  permissions: { canManage: true },
  eligibility: {
    eligible: true,
    phoneVerified: { met: true, label: 'Phone verified' },
    legalNamePresent: { met: true, label: 'Legal name present' },
    businessDocumentPresent: { met: true, label: 'Business document present' },
    publishedProjects: { met: true, label: 'Projects published', current: 3, required: 3 },
  },
  documents: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      type: 'msme_udyam_registration',
      version: 1,
      status: 'verified',
      contentType: 'application/pdf',
      size: 96_256,
      committedAt: '2026-08-20T10:00:00.000Z',
      createdAt: '2026-08-20T09:59:00.000Z',
    },
  ],
  history: [],
  latestNote: null,
  submittedAt: '2026-08-20T10:05:00.000Z',
  reviewedAt: '2026-08-21T10:05:00.000Z',
  approvedAt: '2026-08-21T10:05:00.000Z',
  expiresAt: '2026-10-21T10:05:00.000Z',
};

function draftState(overrides: Partial<VerificationStateResponse> = {}): VerificationStateResponse {
  return {
    ...verifiedState,
    status: 'draft',
    submittedAt: null,
    reviewedAt: null,
    approvedAt: null,
    expiresAt: null,
    documents: [{ ...verifiedState.documents[0]!, status: 'uploaded' }],
    ...overrides,
  };
}

function pendingState(
  overrides: Partial<VerificationStateResponse> = {},
): VerificationStateResponse {
  return {
    ...draftState(),
    status: 'pending',
    submittedAt: '2026-08-23T11:45:57.863Z',
    ...overrides,
  };
}

function rejectedState(
  overrides: Partial<VerificationStateResponse> = {},
): VerificationStateResponse {
  const initialState = draftState();
  return {
    ...initialState,
    status: 'rejected',
    submittedAt: '2026-08-20T10:05:00.000Z',
    reviewedAt: '2026-08-21T10:05:00.000Z',
    latestNote: 'Please upload a clearer certificate.',
    eligibility: {
      ...initialState.eligibility,
      eligible: false,
      businessDocumentPresent: { met: false, label: 'Business document present' },
    },
    documents: [{ ...verifiedState.documents[0]!, status: 'rejected' }],
    ...overrides,
  };
}

describe('DesignerVerification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.sendOtp.mockResolvedValue({ error: null });
    mock.verifyOtp.mockResolvedValue({ error: null });
    mock.updateUser.mockResolvedValue({ error: null });
  });

  it('renders the server-approved identity, document, and project count', () => {
    render(<DesignerVerification initialState={verifiedState} />);

    expect(screen.getByRole('heading', { name: 'Get Verified' })).toBeInTheDocument();
    expect(screen.getByText('+91 9843211210 · OTP verified')).toBeInTheDocument();
    expect(screen.getByText('Anika Sharma · Account owner')).toBeInTheDocument();
    expect(screen.getAllByText('Verified')).toHaveLength(3);
    expect(screen.getByText('94 KB of 94 KB')).toBeInTheDocument();
    expect(screen.getByText('MSME certificate')).toBeInTheDocument();
    expect(screen.getByText('3 / 3 approved')).toBeInTheDocument();
    expect(screen.getByText('You have 3 approved live projects.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Submit for verification' }),
    ).not.toBeInTheDocument();
  });

  it('lets the owner edit completed identity details before submission', async () => {
    const user = userEvent.setup();
    const { container } = render(<DesignerVerification initialState={draftState()} />);

    expect(screen.getAllByText('Verified')).not.toHaveLength(0);
    expect(screen.getByText('+91 9843211210 · OTP verified')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit phone number' })).toBeInTheDocument();
    const ownerNameInput = screen.getByRole('textbox', {
      name: 'Account owner - Full legal name',
    });
    expect(ownerNameInput).toHaveValue('Anika Sharma');
    expect(ownerNameInput).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(container.querySelector('#supporting-id')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit account owner and supporting ID' }));

    expect(ownerNameInput).not.toHaveAttribute('readonly');
    expect(ownerNameInput).toHaveFocus();
    expect(container.querySelector('#supporting-id')).toBeInTheDocument();
  });

  it('restores an uploaded supporting ID when the owner reopens identity editing', async () => {
    const user = userEvent.setup();
    const supportingDocument: VerificationStateResponse['documents'][number] = {
      ...verifiedState.documents[0]!,
      id: '33333333-3333-4333-8333-333333333333',
      type: 'personal_pan',
      size: 48_128,
    };
    render(
      <DesignerVerification
        initialState={draftState({
          documents: [{ ...verifiedState.documents[0]!, status: 'uploaded' }, supportingDocument],
        })}
      />,
    );

    expect(screen.queryByText('PAN card')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit account owner and supporting ID' }));

    expect(screen.getByText('PAN card')).toBeInTheDocument();
    expect(screen.getByText('47 KB of 47 KB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove PAN card' })).toBeInTheDocument();
  });

  it('uses server eligibility to enable submission and persists the transition', async () => {
    const user = userEvent.setup();
    const initialState = draftState();
    mock.submit.mockResolvedValue({ ...initialState, status: 'pending' });
    render(<DesignerVerification initialState={initialState} />);

    const submitButton = screen.getByRole('button', { name: 'Submit for verification' });
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    await waitFor(() => expect(mock.submit).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText(/Once you submit, the admin team reviews within 2–5 business days\./),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submitted' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Submit for verification' }),
    ).not.toBeInTheDocument();
  });

  it('applies a refreshed pending state after history restoration and locks the application', () => {
    const initialState = draftState();
    const { container, rerender } = render(<DesignerVerification initialState={initialState} />);

    expect(screen.getByRole('button', { name: 'Submit for verification' })).toBeEnabled();
    expect(container.querySelector('#business-document')).toBeInTheDocument();

    rerender(<DesignerVerification initialState={pendingState()} />);

    expect(screen.getByRole('button', { name: 'Submitted' })).toBeDisabled();
    expect(
      screen.getByText(
        /Once you submit, the admin team reviews within 2–5 business days\. They may ask for a quick clarification on your document; you'll get a notification if they do\. Approved documents don't need to be re-submitted\./,
      ),
    ).toBeInTheDocument();
    const inReviewBadge = screen.getByText('In review');
    expect(inReviewBadge).toHaveClass('pl-1', 'pr-2', 'text-[13px]', '[&_svg]:size-4');
    expect(inReviewBadge.querySelector('.lucide-eye')).not.toBeNull();
    expect(screen.getByText('MSME certificate')).toBeInTheDocument();
    expect(screen.getByText('94 KB of 94 KB')).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Select document type' }),
    ).not.toBeInTheDocument();
    expect(container.querySelector('#business-document')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit phone number' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit account owner and supporting ID' }),
    ).not.toBeInTheDocument();
  });

  it('marks an uploaded business document complete before admin review', () => {
    render(<DesignerVerification initialState={draftState()} />);

    const uploadedBadge = screen.getByText('Uploaded');
    expect(uploadedBadge).toHaveClass('pl-1', 'pr-2', 'text-[13px]', '[&_svg]:size-4');
    expect(uploadedBadge.querySelector('.lucide-file-up')).not.toBeNull();
    expect(screen.getByText('Upload one business document').closest('li')).toHaveClass(
      'line-through',
    );
    expect(
      screen
        .getByText('Upload one business document')
        .closest('li')
        ?.querySelector('.lucide-check'),
    ).not.toBeNull();
    expect(screen.getByText('Proof of Entity registration').parentElement).toHaveTextContent(
      'Proof of Entity registration',
    );
    expect(
      screen
        .getByText('Proof of Entity registration')
        .parentElement?.querySelector('.text-success'),
    ).not.toBeNull();
  });

  it('confirms removal of an uploaded business document and restores the upload control', async () => {
    const user = userEvent.setup();
    const initialState = draftState();
    const removedState = draftState({
      documents: [],
      eligibility: {
        ...initialState.eligibility,
        eligible: false,
        businessDocumentPresent: { met: false, label: 'Business document present' },
      },
    });
    mock.removeDocument.mockResolvedValue(removedState);
    const { container } = render(<DesignerVerification initialState={initialState} />);

    await user.click(screen.getByRole('button', { name: 'Remove MSME certificate' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Remove MSME certificate from this verification application?',
    );
    await user.click(screen.getByRole('button', { name: 'Remove document' }));

    await waitFor(() =>
      expect(mock.removeDocument).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222'),
    );
    expect(container.querySelector('#business-document')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for verification' })).toBeDisabled();
  });

  it('shows the authoritative project count and disables submission when incomplete', () => {
    const initialState = draftState({
      eligibility: {
        ...verifiedState.eligibility,
        eligible: false,
        publishedProjects: {
          met: false,
          label: 'Projects published',
          current: 2,
          required: 3,
        },
      },
    });
    render(<DesignerVerification initialState={initialState} />);

    expect(screen.getByText('2 / 3 approved')).toBeInTheDocument();
    expect(screen.getByText(/upload 1 more/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for verification' })).toBeDisabled();
    expect(
      screen
        .getByText('3 approved projects (you have 2)')
        .closest('li')
        ?.querySelector('.lucide-x'),
    ).not.toBeNull();
  });

  it('uploads and commits a selected business document through the API wrapper', async () => {
    const initialState = draftState({
      eligibility: {
        ...verifiedState.eligibility,
        eligible: false,
        businessDocumentPresent: { met: false, label: 'Business document present' },
      },
      documents: [],
    });
    mock.uploadDocument.mockResolvedValue(draftState());
    const { container } = render(<DesignerVerification initialState={initialState} />);
    const file = new File(['document'], 'registration.pdf', { type: 'application/pdf' });

    fireEvent.change(container.querySelector('#business-document')!, { target: { files: [file] } });

    await waitFor(() =>
      expect(mock.uploadDocument).toHaveBeenCalledWith('msme_udyam_registration', file),
    );
    expect(await screen.findAllByText('MSME certificate')).toHaveLength(2);
  });

  it('keeps personal identity uploads owner-only while allowing business management', () => {
    const initialState = draftState({
      identity: { ...verifiedState.identity, canEdit: false, ownerPhone: null },
      permissions: { canManage: true },
      eligibility: {
        ...verifiedState.eligibility,
        eligible: false,
        phoneVerified: { met: false, label: 'Phone verified' },
      },
      documents: [],
    });
    const { container } = render(<DesignerVerification initialState={initialState} />);

    expect(screen.getByRole('button', { name: 'PAN' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Aadhaar' })).toBeDisabled();
    expect(container.querySelector('#supporting-id')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Select document type' })).toBeEnabled();
  });

  it('updates the owner phone only after a valid OTP', async () => {
    const user = userEvent.setup();
    const initialState = draftState({
      identity: { ...verifiedState.identity, ownerPhone: null },
      eligibility: {
        ...verifiedState.eligibility,
        eligible: false,
        phoneVerified: { met: false, label: 'Phone verified' },
      },
    });
    mock.fetchState.mockResolvedValue(draftState());
    render(<DesignerVerification initialState={initialState} />);

    await user.type(screen.getByRole('textbox', { name: 'Phone number' }), '9843211210');
    await user.click(screen.getByRole('button', { name: 'Get OTP' }));
    await waitFor(() =>
      expect(mock.sendOtp).toHaveBeenCalledWith({ phoneNumber: '+919843211210' }),
    );
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toHaveClass(
      'bg-surface-inverse/20',
      'backdrop-blur-sm',
    );

    const digits = screen.getAllByRole('textbox', { name: /OTP digit/ });
    for (const [index, digit] of ['1', '2', '3', '4', '5', '6'].entries()) {
      await user.type(digits[index]!, digit);
    }
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() =>
      expect(mock.verifyOtp).toHaveBeenCalledWith({
        phoneNumber: '+919843211210',
        code: '123456',
        updatePhoneNumber: true,
      }),
    );
    expect(mock.fetchState).toHaveBeenCalledTimes(1);
  });

  it('keeps the persisted verified phone in the summary until the replacement OTP succeeds', async () => {
    const user = userEvent.setup();
    render(<DesignerVerification initialState={draftState()} />);

    await user.click(screen.getByRole('button', { name: 'Edit phone number' }));
    const phoneInput = screen.getByRole('textbox', { name: 'Phone number' });
    await user.clear(phoneInput);
    await user.type(phoneInput, '9876543210');

    expect(screen.getByText('+91 9843211210 · OTP verified')).toBeInTheDocument();
    expect(screen.queryByText('+91 9876543210 · OTP verified')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Get OTP' }));
    expect(await screen.findByText('+91 9876543210')).toBeInTheDocument();
  });

  it('requires a valid ten-digit Indian mobile number before sending an OTP', async () => {
    const user = userEvent.setup();
    const initialState = draftState({
      identity: { ...verifiedState.identity, ownerPhone: null },
      eligibility: {
        ...verifiedState.eligibility,
        eligible: false,
        phoneVerified: { met: false, label: 'Phone verified' },
      },
    });
    render(<DesignerVerification initialState={initialState} />);

    const phoneInput = screen.getByRole('textbox', { name: 'Phone number' });
    const getOtpButton = screen.getByRole('button', { name: 'Get OTP' });

    expect(getOtpButton).toBeDisabled();
    await user.type(phoneInput, '984321121');
    expect(getOtpButton).toBeDisabled();

    await user.type(phoneInput, '0123');
    expect(phoneInput).toHaveValue('9843211210');
    expect(getOtpButton).toBeEnabled();

    await user.click(getOtpButton);
    await waitFor(() =>
      expect(mock.sendOtp).toHaveBeenCalledWith({ phoneNumber: '+919843211210' }),
    );
  });

  it('shows the resubmission reason from the badge info tooltip', async () => {
    const user = userEvent.setup();
    render(<DesignerVerification initialState={rejectedState()} />);

    expect(screen.queryByText('Please upload a clearer certificate.')).not.toBeInTheDocument();
    expect(screen.getByText('Resubmit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for verification' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Resubmit for verification' }),
    ).not.toBeInTheDocument();

    await user.hover(screen.getByRole('button', { name: 'View resubmission reason' }));

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Changes needed:');
    expect(tooltip).toHaveTextContent('Please upload a clearer certificate.');
    expect(tooltip.querySelector('[data-slot="tooltip-arrow"]')).not.toBeInTheDocument();
  });

  it('enables resubmission after replacement upload and locks the next pending attempt', async () => {
    const user = userEvent.setup();
    const replacementState = rejectedState({
      eligibility: verifiedState.eligibility,
      documents: [
        {
          ...verifiedState.documents[0]!,
          id: '33333333-3333-4333-8333-333333333333',
          version: 2,
          status: 'uploaded',
        },
      ],
    });
    mock.uploadDocument.mockResolvedValue(replacementState);
    mock.submit.mockResolvedValue(
      pendingState({
        ...replacementState,
        status: 'pending',
        attempt: 2,
        latestNote: null,
      }),
    );
    const { container } = render(<DesignerVerification initialState={rejectedState()} />);
    const file = new File(['replacement'], 'clear-certificate.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(container.querySelector('#business-document')!, {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(mock.uploadDocument).toHaveBeenCalledWith('msme_udyam_registration', file),
    );
    const resubmitButton = await screen.findByRole('button', {
      name: 'Resubmit for verification',
    });
    expect(resubmitButton).toBeEnabled();

    await user.click(resubmitButton);

    await waitFor(() => expect(mock.submit).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Submitted' })).toBeDisabled();
    expect(container.querySelector('#business-document')).not.toBeInTheDocument();
    expect(screen.queryByText('Please upload a clearer certificate.')).not.toBeInTheDocument();
  });

  it('keeps the disabled submit action when the replacement upload fails', async () => {
    mock.uploadDocument.mockRejectedValue(new Error('Replacement upload failed.'));
    const { container } = render(<DesignerVerification initialState={rejectedState()} />);
    const file = new File(['replacement'], 'clear-certificate.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(container.querySelector('#business-document')!, {
      target: { files: [file] },
    });

    expect(await screen.findByText('Replacement upload failed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for verification' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Resubmit for verification' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Resubmit')).toBeInTheDocument();
  });

  it('keeps the replacement editable when server eligibility changes during resubmission', async () => {
    const user = userEvent.setup();
    const replacementState = rejectedState({
      eligibility: verifiedState.eligibility,
      documents: [
        {
          ...verifiedState.documents[0]!,
          id: '33333333-3333-4333-8333-333333333333',
          version: 2,
          status: 'uploaded',
        },
      ],
    });
    mock.submit.mockRejectedValue(new Error('Verification eligibility requirements changed.'));
    const { container } = render(<DesignerVerification initialState={replacementState} />);

    await user.click(screen.getByRole('button', { name: 'Resubmit for verification' }));

    expect(
      await screen.findByText('Verification eligibility requirements changed.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resubmit for verification' })).toBeEnabled();
    expect(container.querySelector('#business-document')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submitted' })).not.toBeInTheDocument();
  });

  it('selects a supported business document type', async () => {
    const user = userEvent.setup();
    render(<DesignerVerification initialState={draftState()} />);

    const trigger = screen.getByRole('combobox', { name: 'Select document type' });
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: /GST Registration Certificate/i }));

    expect(trigger).toHaveTextContent('GST Registration Certificate');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('smoothly collapses and expands each verification section', async () => {
    const user = userEvent.setup();
    const { container } = render(<DesignerVerification initialState={verifiedState} />);
    const trigger = screen.getByRole('button', { name: /personal identity/i });

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('[data-slot="animated-collapsible-content"]')).toHaveClass(
      'grid-rows-[0fr]',
      'opacity-0',
    );
  });

  it('allows a failed initial load to be retried', async () => {
    const user = userEvent.setup();
    mock.fetchState.mockResolvedValue(verifiedState);
    render(
      <DesignerVerification initialState={null} initialLoadError="Could not load verification." />,
    );

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Anika Sharma · Account owner')).toBeInTheDocument();
  });
});
