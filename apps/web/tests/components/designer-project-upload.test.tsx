import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ListProjectImagesResponse, ProjectDetailResponse } from '@repo/contracts';
import { DesignerProjectUpload } from '../../src/components/designer-project-upload';

const mock = vi.hoisted(() => ({
  router: {
    push: vi.fn(),
    replace: vi.fn(),
  },
  taxonomyGet: vi.fn(),
  projectGet: vi.fn(),
  projectPatch: vi.fn(),
  roomPatch: vi.fn(),
  imageMetadataPatch: vi.fn(),
  completenessGet: vi.fn(),
  submitProject: vi.fn(),
  listImagesGet: vi.fn(),
  deleteRoom: vi.fn(),
  deleteImage: vi.fn(),
  uploadUrlPost: vi.fn(),
  commitPost: vi.fn(),
  linkImagePatch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mock.router,
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      taxonomy: {
        terms: {
          $get: mock.taxonomyGet,
        },
      },
      projects: {
        ':id': {
          $get: mock.projectGet,
          $patch: mock.projectPatch,
          completeness: { $get: mock.completenessGet },
          submit: { $post: mock.submitProject },
          images: {
            $get: mock.listImagesGet,
            ':imageId': {
              $delete: mock.deleteImage,
              $patch: mock.linkImagePatch,
            },
          },
          rooms: {
            ':roomId': {
              $delete: mock.deleteRoom,
              $patch: mock.roomPatch,
            },
          },
        },
      },
      media: {
        'upload-url': { $post: mock.uploadUrlPost },
        ':imageId': {
          commit: { $post: mock.commitPost },
          metadata: { $patch: mock.imageMetadataPatch },
        },
      },
    },
  },
}));

describe('DesignerProjectUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.router.push.mockReset();
    mock.router.replace.mockReset();

    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:project-image-preview');

    const taxonomyByKind = {
      city: [
        {
          id: '11111111-1111-4111-8111-111111111101',
          label: 'Chennai',
          slug: 'chennai',
          parentId: null,
        },
      ],
      property_type: [
        {
          id: '11111111-1111-4111-8111-111111111102',
          label: 'Residential',
          slug: 'residential',
          parentId: null,
        },
      ],
      property_subtype: [
        {
          id: '11111111-1111-4111-8111-111111111103',
          label: 'Apartment',
          slug: 'apartment',
          parentId: null,
        },
      ],
      bhk: [
        {
          id: '11111111-1111-4111-8111-111111111104',
          label: '2 BHK',
          slug: '2-bhk',
          parentId: null,
        },
      ],
      room: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          label: 'Living Room',
          slug: 'living-room',
          parentId: null,
        },
      ],
      scope: [
        {
          id: '11111111-1111-4111-8111-111111111105',
          label: 'Construction',
          slug: 'construction',
          parentId: null,
        },
      ],
      theme: [
        {
          id: '11111111-1111-4111-8111-111111111106',
          label: 'Modern',
          slug: 'modern',
          parentId: null,
        },
      ],
      finish: [
        {
          id: '11111111-1111-4111-8111-111111111107',
          label: 'Matte',
          slug: 'matte',
          parentId: null,
        },
      ],
      budget_band: [
        {
          id: '11111111-1111-4111-8111-111111111108',
          label: '20L-30L',
          slug: '20l-30l',
          parentId: null,
        },
      ],
      locality: [
        {
          id: '11111111-1111-4111-8111-111111111109',
          label: 'Adyar',
          slug: 'adyar',
          parentId: '11111111-1111-4111-8111-111111111101',
        },
      ],
    } as const;

    mock.taxonomyGet.mockImplementation(
      async ({ query }: { query: { kind: keyof typeof taxonomyByKind } }) => ({
        ok: true,
        json: async () => ({ terms: taxonomyByKind[query.kind] ?? [] }),
      }),
    );

    mock.projectGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          designerId: '22222222-2222-4222-8222-222222222222',
          responsibleMemberId: null,
          title: '2 BHK in Adyar',
          slug: '2-bhk-in-adyar',
          description: null,
          status: 'draft',
          archiveReason: null,
          rejectionReasonCode: null,
          rejectionReasonCodes: [],
          moderationNote: null,
          propertyTypeSlug: 'residential',
          propertySubtypeSlug: 'apartment',
          scopeSlug: 'construction',
          bhkSlug: '2-bhk',
          sizeSqft: 1400,
          citySlug: 'chennai',
          localitySlug: 'adyar',
          buildingName: 'Maitri Apartments',
          budgetBandSlug: '20l-30l',
          completedMonth: '2026-03',
          durationMonths: 4,
          coverImageId: '55555555-5555-4555-8555-555555555555',
          metadata: {
            uiProjectTypeSlug: 'apartment',
            projectSubtypeSlug: 'apartment',
            localityLabel: 'Adyar',
            scopeSlugs: ['construction'],
          },
          publishedAt: null,
          submittedAt: null,
          reviewComments: [],
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
          rooms: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              projectId: '11111111-1111-4111-8111-111111111111',
              roomTypeId: '44444444-4444-4444-8444-444444444444',
              name: 'Living Room',
              description: null,
              sortOrder: 0,
              metadata: {},
              createdAt: '2026-07-01T00:00:00.000Z',
              updatedAt: '2026-07-01T00:00:00.000Z',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    mock.listImagesGet
      .mockReset()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: '55555555-5555-4555-8555-555555555555',
                roomId: '33333333-3333-4333-8333-333333333333',
                status: 'ready',
                sortOrder: 0,
                themeSlugs: ['modern'],
                materialSlugs: [],
                finishSlugs: ['matte'],
                tagSlugs: [],
                width: 1600,
                height: 1200,
                derivatives: [],
                previewUrl: 'https://example.com/thumb.webp',
                viewerUrl: 'https://example.com/large.webp',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'refresh failed',
            },
          }),
          {
            status: 500,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );

    mock.deleteImage.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '55555555-5555-4555-8555-555555555555',
          deleted: true,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    mock.deleteRoom.mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );
  });

  function selectWithOption(container: HTMLElement, optionLabel: string) {
    const select = Array.from(container.querySelectorAll('select')).find((candidate) =>
      Array.from(candidate.options).some((option) => option.textContent === optionLabel),
    );

    if (!select) throw new Error(`Could not find select containing option "${optionLabel}"`);
    return select;
  }

  it('requires confirmation before deleting an image and keeps it removed when refresh fails', async () => {
    const user = userEvent.setup();

    render(<DesignerProjectUpload initialProjectId="11111111-1111-4111-8111-111111111111" />);

    await screen.findByText('Living Room');
    await user.click(screen.getByRole('button', { name: /remove image 1/i }));

    expect(mock.deleteImage).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Delete this image?' })).toBeInTheDocument();
    expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete image' }));

    await waitFor(() => {
      expect(mock.deleteImage).toHaveBeenCalledWith({
        param: {
          id: '11111111-1111-4111-8111-111111111111',
          imageId: '55555555-5555-4555-8555-555555555555',
        },
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /remove image 1/i })).not.toBeInTheDocument();
    });
    expect(
      screen.getByText(/image removed, but we could not refresh the latest processing status/i),
    ).toBeInTheDocument();
  });

  it('anchors the hidden file input inside the upload zone so focus cannot scroll the workspace away', async () => {
    render(<DesignerProjectUpload initialProjectId="11111111-1111-4111-8111-111111111111" />);

    const uploadCopy = await screen.findByText(/drag and drop files here or click to upload/i);
    const uploadZone = uploadCopy.closest('label');

    expect(uploadZone).toHaveClass('relative');
    expect(uploadZone?.querySelector('input[type="file"]')).toHaveClass('sr-only');
  });

  it('accepts image files dropped on the upload zone', async () => {
    render(<DesignerProjectUpload initialProjectId="11111111-1111-4111-8111-111111111111" />);

    const dropCopy = await screen.findByText(/drag and drop files here or click to upload/i);
    const dropZone = dropCopy.closest('label');
    if (!dropZone) throw new Error('Upload drop zone was not rendered');

    const file = new File(['image'], 'living-room.jpg', { type: 'image/jpeg' });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    });
  });

  it('requires confirmation before deleting a room', async () => {
    const response = await mock.projectGet();
    const project = (await response.json()) as Record<string, unknown> & {
      rooms: Array<Record<string, unknown>>;
    };
    const firstRoom = project.rooms[0]!;
    mock.projectGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...project,
          rooms: [
            firstRoom,
            ...['Kitchen', 'Master Bedroom', 'Bathroom'].map((name, index) => ({
              ...firstRoom,
              id: `33333333-3333-4333-8333-33333333333${index + 4}`,
              name,
              sortOrder: index + 1,
            })),
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const user = userEvent.setup();
    render(<DesignerProjectUpload initialProjectId="11111111-1111-4111-8111-111111111111" />);

    await user.click(await screen.findByRole('button', { name: 'Delete Living Room' }));

    expect(mock.deleteRoom).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Delete Living Room?' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete room' }));

    await waitFor(() => {
      expect(mock.deleteRoom).toHaveBeenCalledWith({
        param: {
          id: '11111111-1111-4111-8111-111111111111',
          roomId: '33333333-3333-4333-8333-333333333333',
        },
      });
    });
  });

  it('shows room deletion only for optional rooms', async () => {
    const user = userEvent.setup();
    render(<DesignerProjectUpload />);

    await user.click(await screen.findByRole('button', { name: /step 4 project images/i }));
    await user.click(await screen.findByRole('button', { name: /add new room type/i }));
    await user.type(screen.getByPlaceholderText('Search room types'), 'Balcony');
    await user.click(screen.getByRole('button', { name: 'Balcony' }));

    expect(screen.queryByRole('button', { name: 'Delete Kitchen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Master Bedroom' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Bathroom' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Balcony' })).toBeInTheDocument();
  });

  it('does not offer a custom room action that cannot succeed', async () => {
    const user = userEvent.setup();
    render(<DesignerProjectUpload initialProjectId="11111111-1111-4111-8111-111111111111" />);

    await user.click(await screen.findByRole('button', { name: /add new room type/i }));
    await user.type(screen.getByPlaceholderText('Search room types'), 'Observatory');

    expect(screen.getByText(/no matching taxonomy-backed room type found/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create new room type/i })).not.toBeInTheDocument();
  });

  it('opens ready images with the high-quality viewer URL', async () => {
    const user = userEvent.setup();
    render(<DesignerProjectUpload initialProjectId="11111111-1111-4111-8111-111111111111" />);

    await user.click(await screen.findByRole('button', { name: 'Open Image 1' }));

    const viewerImage = document.querySelector('img[alt="Image 1 (Ready)"]');
    expect(viewerImage).toHaveAttribute('src', 'https://example.com/large.webp');
    await user.click(screen.getByRole('button', { name: /close image preview/i }));
  });

  it('loads an existing draft without showing a success notice', async () => {
    render(<DesignerProjectUpload initialProjectId="11111111-1111-4111-8111-111111111111" />);

    expect(await screen.findByDisplayValue('2 BHK in Adyar')).toBeInTheDocument();
    expect(
      screen.queryByText('Draft loaded. You can continue editing from here.'),
    ).not.toBeInTheDocument();
  });

  it('saves the automatic cover before checking readiness and submitting a draft', async () => {
    const user = userEvent.setup();
    const project = (await (await mock.projectGet()).json()) as ProjectDetailResponse;
    const images = (await (await mock.listImagesGet()).json()) as ListProjectImagesResponse;
    const firstImage = images.items[0]!;
    const draft = { ...project, coverImageId: null };
    mock.projectGet.mockResolvedValue({ ok: true, json: async () => draft });
    mock.listImagesGet.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          firstImage,
          { ...firstImage, id: '66666666-6666-4666-8666-666666666666' },
          { ...firstImage, id: '77777777-7777-4777-8777-777777777777' },
        ],
      }),
    });
    mock.projectPatch.mockResolvedValue({ ok: true, json: async () => ({}) });
    mock.roomPatch.mockResolvedValue({ ok: true, json: async () => ({}) });
    mock.imageMetadataPatch.mockImplementation(
      async ({ param }: { param: { imageId: string } }) => ({
        ok: true,
        json: async () => ({ ...firstImage, id: param.imageId }),
      }),
    );
    mock.completenessGet.mockResolvedValue({
      ok: true,
      json: async () => ({
        complete: true,
        score: 100,
        missing: [],
        requirements: [{ key: 'cover-image', label: 'Cover image selected', complete: true }],
      }),
    });
    mock.submitProject.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...draft,
        status: 'submitted',
        submittedAt: '2026-09-07T00:00:00.000Z',
      }),
    });
    render(<DesignerProjectUpload initialProjectId={project.id} />);

    await screen.findByDisplayValue('2 BHK in Adyar');
    expect(screen.getByText('Cover image selected')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Preview & Submit Project' });
    expect(submit).toBeEnabled();
    await user.click(submit);

    // E-286: clicking "Preview & Submit" opens the confirmation step and must
    // NOT call the submit API yet — but the cover save + completeness check
    // (which precede opening the preview) have already run.
    const confirm = await screen.findByRole('button', { name: 'Confirm & submit' });
    expect(mock.submitProject).not.toHaveBeenCalled();
    expect(mock.projectPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({ coverImageId: firstImage.id }),
      }),
    );
    expect(mock.projectPatch.mock.invocationCallOrder[0]).toBeLessThan(
      mock.completenessGet.mock.invocationCallOrder[0]!,
    );

    // The submit API runs only after the explicit confirmation.
    await user.click(confirm);
    await waitFor(() => expect(mock.submitProject).toHaveBeenCalledTimes(1));
  });

  // --- E-286: preview / confirm / persistent submitted state --------------------
  describe('Preview & Submit confirmation flow (E-286)', () => {
    async function renderSubmittableDraft() {
      const project = (await (await mock.projectGet()).json()) as ProjectDetailResponse;
      const images = (await (await mock.listImagesGet()).json()) as ListProjectImagesResponse;
      const firstImage = images.items[0]!;
      const draft = { ...project, coverImageId: firstImage.id };
      mock.projectGet.mockResolvedValue({ ok: true, json: async () => draft });
      mock.listImagesGet.mockReset().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            firstImage,
            { ...firstImage, id: '66666666-6666-4666-8666-666666666666' },
            { ...firstImage, id: '77777777-7777-4777-8777-777777777777' },
          ],
        }),
      });
      mock.projectPatch.mockResolvedValue({ ok: true, json: async () => ({}) });
      mock.roomPatch.mockResolvedValue({ ok: true, json: async () => ({}) });
      mock.imageMetadataPatch.mockImplementation(
        async ({ param }: { param: { imageId: string } }) => ({
          ok: true,
          json: async () => ({ ...firstImage, id: param.imageId }),
        }),
      );
      mock.completenessGet.mockResolvedValue({
        ok: true,
        json: async () => ({
          complete: true,
          score: 100,
          missing: [],
          requirements: [{ key: 'cover-image', label: 'Cover image selected', complete: true }],
        }),
      });
      return { project, draft };
    }

    it('opens the preview and does not call the submit API on the first click', async () => {
      const user = userEvent.setup();
      const { project } = await renderSubmittableDraft();
      render(<DesignerProjectUpload initialProjectId={project.id} />);

      await screen.findByDisplayValue('2 BHK in Adyar');
      await user.click(screen.getByRole('button', { name: 'Preview & Submit Project' }));

      expect(await screen.findByRole('dialog')).toHaveTextContent('Review before submitting');
      expect(mock.submitProject).not.toHaveBeenCalled();
    });

    it('shows the actual project data and ready images in the preview', async () => {
      const user = userEvent.setup();
      const { project } = await renderSubmittableDraft();
      render(<DesignerProjectUpload initialProjectId={project.id} />);

      await screen.findByDisplayValue('2 BHK in Adyar');
      await user.click(screen.getByRole('button', { name: 'Preview & Submit Project' }));

      const dialog = await screen.findByRole('dialog');
      // The actual project title and photo counts are surfaced from live state.
      expect(dialog).toHaveTextContent('2 BHK in Adyar');
      expect(dialog).toHaveTextContent('3 total');
      expect(dialog).toHaveTextContent('3 ready');
      // Ready image thumbnails are rendered from the existing image data.
      expect(within(dialog).getAllByRole('img', { name: /\(Ready\)$/ }).length).toBeGreaterThan(0);
    });

    it('returns to the form without submitting when Back to edit is clicked', async () => {
      const user = userEvent.setup();
      const { project } = await renderSubmittableDraft();
      render(<DesignerProjectUpload initialProjectId={project.id} />);

      await screen.findByDisplayValue('2 BHK in Adyar');
      await user.click(screen.getByRole('button', { name: 'Preview & Submit Project' }));
      await screen.findByRole('dialog');

      await user.click(screen.getByRole('button', { name: 'Back to edit' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(mock.submitProject).not.toHaveBeenCalled();
    });

    it('calls the submit API exactly once when confirming', async () => {
      const user = userEvent.setup();
      const { project, draft } = await renderSubmittableDraft();
      mock.submitProject.mockResolvedValue({
        ok: true,
        json: async () => ({ ...draft, status: 'submitted', submittedAt: '2026-09-07T00:00:00.000Z' }),
      });
      render(<DesignerProjectUpload initialProjectId={project.id} />);

      await screen.findByDisplayValue('2 BHK in Adyar');
      await user.click(screen.getByRole('button', { name: 'Preview & Submit Project' }));
      await user.click(await screen.findByRole('button', { name: 'Confirm & submit' }));

      await waitFor(() => expect(mock.submitProject).toHaveBeenCalledTimes(1));
    });

    it('shows the success confirmation and routes to the project list after submitting', async () => {
      const user = userEvent.setup();
      const { project, draft } = await renderSubmittableDraft();
      mock.submitProject.mockResolvedValue({
        ok: true,
        json: async () => ({
          ...draft,
          status: 'submitted',
          submittedAt: '2026-09-07T00:00:00.000Z',
        }),
      });
      render(<DesignerProjectUpload initialProjectId={project.id} />);

      await screen.findByDisplayValue('2 BHK in Adyar');
      await user.click(screen.getByRole('button', { name: 'Preview & Submit Project' }));
      await user.click(await screen.findByRole('button', { name: 'Confirm & submit' }));

      // The success dialog with the tick confirmation appears once the API resolves.
      const success = await screen.findByText('Project submitted');
      expect(success).toBeInTheDocument();

      // Dismissing it sends the designer back to their projects list.
      await user.click(screen.getByRole('button', { name: 'Back to projects' }));
      await waitFor(() => expect(mock.router.push).toHaveBeenCalledWith('/designer/projects'));
    });

    it('announces a submission failure inside the open dialog for screen readers (E-286 review)', async () => {
      // Review P2: when the submit API rejects, the preview dialog stays open and
      // the page-level alert is hidden from the a11y tree. The failure must be
      // announced from inside the dialog via a live region (role="alert").
      const user = userEvent.setup();
      const { project } = await renderSubmittableDraft();
      mock.submitProject.mockResolvedValue({
        ok: false,
        json: async () => ({ error: { code: 'FORBIDDEN', message: 'Account suspended' } }),
      });
      render(<DesignerProjectUpload initialProjectId={project.id} />);

      await screen.findByDisplayValue('2 BHK in Adyar');
      await user.click(screen.getByRole('button', { name: 'Preview & Submit Project' }));
      await user.click(await screen.findByRole('button', { name: 'Confirm & submit' }));

      await waitFor(() => expect(mock.submitProject).toHaveBeenCalledTimes(1));

      // The dialog stays open, and the error is exposed as an assertive alert so
      // assistive tech announces it (not just a plain, silent paragraph).
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Account suspended');

      // No success dialog / navigation happened on the failure path.
      expect(screen.queryByText('Project submitted')).not.toBeInTheDocument();
      expect(mock.router.push).not.toHaveBeenCalledWith('/designer/projects');
    });

    it('shows persistent Submitted feedback that outlives the transient toast', async () => {
      // NOTE: the async interactions and queries below run under REAL timers.
      // Mixing vi.useFakeTimers() with userEvent + findBy/waitFor (which poll on
      // real time) deadlocks, so we only switch to fake timers for the final
      // "advance past the 3s toast auto-clear" step, where no polling happens.
      const user = userEvent.setup();
      const { project, draft } = await renderSubmittableDraft();
      mock.submitProject.mockResolvedValue({
        ok: true,
        json: async () => ({
          ...draft,
          status: 'submitted',
          submittedAt: '2026-09-07T00:00:00.000Z',
        }),
      });
      render(<DesignerProjectUpload initialProjectId={project.id} />);

      await screen.findByDisplayValue('2 BHK in Adyar');
      await user.click(screen.getByRole('button', { name: 'Preview & Submit Project' }));
      await user.click(await screen.findByRole('button', { name: 'Confirm & submit' }));

      await waitFor(() => expect(mock.submitProject).toHaveBeenCalled());

      // The success dialog is shown first. While it is open Radix marks the rest
      // of the page aria-hidden, so query the underlying banner/toast by text.
      await screen.findByText('Project submitted');
      expect(screen.getByText('Submitted for review')).toBeInTheDocument();
      expect(screen.getByText('Project submitted for review.')).toBeInTheDocument();

      // Dismissing the dialog restores the page (navigation is mocked here), and
      // the persistent status banner is exposed to assistive tech again.
      await user.click(screen.getByRole('button', { name: 'Back to projects' }));
      const status = await screen.findByRole('status', { name: 'Submission status' });
      expect(status).toHaveTextContent('Submitted for review');

      // The transient toast still auto-dismisses after the component's 3s timeout.
      await waitFor(
        () => expect(screen.queryByText('Project submitted for review.')).not.toBeInTheDocument(),
        { timeout: 5000 },
      );
      expect(
        screen.getByRole('status', { name: 'Submission status' }),
      ).toHaveTextContent('Submitted for review');
    });

    it('represents the backend in_review status when the project is already in review', async () => {
      const project = (await (await mock.projectGet()).json()) as ProjectDetailResponse;
      mock.projectGet.mockResolvedValue({
        ok: true,
        json: async () => ({ ...project, status: 'in_review' }),
      });
      render(<DesignerProjectUpload initialProjectId={project.id} />);

      await screen.findByDisplayValue('2 BHK in Adyar');
      const status = await screen.findByRole('status', { name: 'Submission status' });
      expect(status).toHaveTextContent('In review');
    });

    it('does not open the preview when the project is incomplete', async () => {
      const user = userEvent.setup();
      const { project } = await renderSubmittableDraft();
      mock.completenessGet.mockResolvedValue({
        ok: true,
        json: async () => ({
          complete: false,
          score: 50,
          missing: ['cover-image'],
          requirements: [{ key: 'cover-image', label: 'Cover image selected', complete: false }],
        }),
      });
      render(<DesignerProjectUpload initialProjectId={project.id} />);

      await screen.findByDisplayValue('2 BHK in Adyar');
      await user.click(screen.getByRole('button', { name: 'Preview & Submit Project' }));

      await waitFor(() =>
        expect(screen.getByText(/not ready to submit yet/i)).toBeInTheDocument(),
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mock.submitProject).not.toHaveBeenCalled();
    });

    it('prevents duplicate submissions while a confirmation is in progress', async () => {
      const user = userEvent.setup();
      const { project, draft } = await renderSubmittableDraft();
      const submitControls: { resolve: (() => void) | null } = { resolve: null };
      mock.submitProject.mockImplementation(
        () =>
          new Promise((resolve) => {
            submitControls.resolve = () =>
              resolve({
                ok: true,
                json: async () => ({
                  ...draft,
                  status: 'submitted',
                  submittedAt: '2026-09-07T00:00:00.000Z',
                }),
              });
          }),
      );
      render(<DesignerProjectUpload initialProjectId={project.id} />);

      await screen.findByDisplayValue('2 BHK in Adyar');
      await user.click(screen.getByRole('button', { name: 'Preview & Submit Project' }));
      const confirm = await screen.findByRole('button', { name: 'Confirm & submit' });

      await user.click(confirm);
      // Button switches to the in-flight state and is disabled; a second click is a no-op.
      const submitting = await screen.findByRole('button', { name: /submitting/i });
      expect(submitting).toBeDisabled();
      await user.click(submitting);

      submitControls.resolve?.();
      await waitFor(() => expect(mock.submitProject).toHaveBeenCalledTimes(1));
    });
  });

  it('shows changes-needed feedback above the visibility tips for requested changes', async () => {
    const response = await mock.projectGet();
    const project = (await response.json()) as Record<string, unknown>;
    mock.projectGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...project,
          status: 'changes_requested',
          moderationNote: 'Upload higher-resolution images.\nAdd clearer room labels.',
          rejectionReasonCodes: ['image-quality', 'room-tagging'],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    render(<DesignerProjectUpload initialProjectId="11111111-1111-4111-8111-111111111111" />);

    const changesHeading = await screen.findByText('CHANGES NEEDED ON');
    expect(screen.getByText('Upload higher-resolution images.')).toBeInTheDocument();
    expect(screen.getByText('Add clearer room labels.')).toBeInTheDocument();
    expect(screen.getByText('Image quality')).toBeInTheDocument();
    expect(screen.getByText('Room tagging')).toBeInTheDocument();
    const tipsHeading = screen.getByText('TIPS FOR BETTER VISIBILITY');
    expect(changesHeading.compareDocumentPosition(tipsHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('keeps the autogenerated project name synced with BHK and location selections', async () => {
    const user = userEvent.setup();
    const { container } = render(<DesignerProjectUpload />);

    await screen.findByText('Upload project');
    await screen.findByText('2 BHK');

    await user.selectOptions(selectWithOption(container, '2 BHK'), '2-bhk');
    await user.selectOptions(selectWithOption(container, 'Chennai'), 'chennai');
    await screen.findByText('Adyar');
    await user.selectOptions(selectWithOption(container, 'Adyar'), 'adyar');
    await user.click(screen.getByRole('button', { name: /step 3 project metadata/i }));

    expect(screen.getByDisplayValue('2 BHK in Adyar')).toBeInTheDocument();
  });

  it('does not restore the autogenerated project name while the user clears it', async () => {
    const user = userEvent.setup();
    const { container } = render(<DesignerProjectUpload />);

    await screen.findByText('Upload project');
    await screen.findByText('2 BHK');

    await user.selectOptions(selectWithOption(container, '2 BHK'), '2-bhk');
    await user.selectOptions(selectWithOption(container, 'Chennai'), 'chennai');
    await screen.findByText('Adyar');
    await user.selectOptions(selectWithOption(container, 'Adyar'), 'adyar');
    await user.click(screen.getByRole('button', { name: /step 3 project metadata/i }));

    const input = screen.getByDisplayValue('2 BHK in Adyar');
    await user.clear(input);

    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });

  it('does not force the upload layout to fill the desktop shell when content is short', async () => {
    const { container } = render(
      <DesignerProjectUpload initialProjectId="11111111-1111-4111-8111-111111111111" />,
    );

    await screen.findByText('Upload project');

    const root = container.firstElementChild;
    expect(root).not.toHaveClass('xl:h-full');

    const desktopGrid = Array.from(root?.querySelectorAll('div') ?? []).find((element) =>
      element.className.includes('xl:grid-cols-[minmax(0,50.3125rem)_19.8125rem]'),
    );
    expect(desktopGrid).not.toHaveClass('xl:flex-1');

    const formColumn = desktopGrid?.firstElementChild;
    expect(formColumn).not.toHaveClass('xl:overflow-y-auto');
  });

  it('renders Tip callouts with a separate primary bar and standard spacing', async () => {
    const user = userEvent.setup();
    const { container } = render(<DesignerProjectUpload />);

    await screen.findByText('Upload project');
    await user.click(screen.getByRole('button', { name: /step 2 timeline & cost/i }));
    await screen.findByText(/project with a cost range get 3x more enquiries/i);

    const callouts = container.querySelectorAll('[data-slot="tip-callout"]');
    expect(callouts.length).toBeGreaterThan(0);

    for (const callout of callouts) {
      expect(callout).toHaveClass('flex', 'gap-1');
      expect(callout.firstElementChild).toHaveClass(
        'w-1',
        'self-stretch',
        'rounded-full',
        'bg-primary',
      );
      expect(callout.lastElementChild).toHaveClass('border', 'border-border', 'bg-primary/5');
      expect(callout.querySelector('svg')).toHaveClass('text-primary');
    }
  });

  it('unmounts room content when Project images is collapsed', async () => {
    const user = userEvent.setup();

    render(<DesignerProjectUpload initialProjectId="11111111-1111-4111-8111-111111111111" />);

    await screen.findByText(/add new room type/i);

    await user.click(screen.getByRole('button', { name: /step 4 project images/i }));
    await waitFor(() => {
      expect(screen.queryByText(/add new room type/i)).not.toBeInTheDocument();
    });
  });
});

describe('DesignerProjectUpload batch recovery', () => {
  beforeEach(() => {
    // Reset accumulated calls from earlier blocks (implementations persist).
    vi.clearAllMocks();
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:project-image-preview');
    // Fresh single-use Response objects per test: the shared mocks from the
    // block above are already consumed by earlier renders.
    mock.taxonomyGet.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ terms: [] }),
    }));
    mock.projectGet.mockImplementation(async () => projectDraftResponse());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function projectDraftResponse() {
    return new Response(
      JSON.stringify({
        id: '11111111-1111-4111-8111-111111111111',
        designerId: '22222222-2222-4222-8222-222222222222',
        responsibleMemberId: null,
        title: '2 BHK in Adyar',
        slug: '2-bhk-in-adyar',
        description: null,
        status: 'draft',
        archiveReason: null,
        rejectionReasonCode: null,
        rejectionReasonCodes: [],
        moderationNote: null,
        propertyTypeSlug: 'residential',
        propertySubtypeSlug: 'apartment',
        scopeSlug: 'construction',
        bhkSlug: '2-bhk',
        sizeSqft: 1400,
        citySlug: 'chennai',
        localitySlug: 'adyar',
        buildingName: 'Maitri Apartments',
        budgetBandSlug: '20l-30l',
        completedMonth: '2026-03',
        durationMonths: 4,
        coverImageId: null,
        metadata: {},
        publishedAt: null,
        submittedAt: null,
        reviewComments: [],
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
        rooms: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            projectId: '11111111-1111-4111-8111-111111111111',
            roomTypeId: '44444444-4444-4444-8444-444444444444',
            name: 'Living Room',
            description: null,
            sortOrder: 0,
            metadata: {},
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }

  const projectId = '11111111-1111-4111-8111-111111111111';
  const roomId = '33333333-3333-4333-8333-333333333333';
  const readyImageId = '55555555-5555-4555-8555-555555555555';

  const readyItem = {
    id: readyImageId,
    roomId,
    status: 'ready',
    sortOrder: 0,
    themeSlugs: ['modern'],
    materialSlugs: [],
    finishSlugs: ['matte'],
    tagSlugs: [],
    width: 1600,
    height: 1200,
    derivatives: [],
    previewUrl: 'https://example.com/thumb.webp',
    viewerUrl: 'https://example.com/large.webp',
  };

  function mockImageList(items: unknown[]) {
    mock.listImagesGet.mockReset().mockImplementation(async () => imageListResponse(items));
  }

  function imageListResponse(items: unknown[]) {
    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  function mockSuccessfulLookups() {
    mock.roomPatch.mockImplementation(
      async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    mock.completenessGet.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            complete: false,
            score: 40,
            missing: [],
            requirements: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    mockImageList([readyItem]);
  }

  function mockTransferPipeline(putResults: boolean[]) {
    let urlCount = 0;
    const imageIds = [
      'a1111111-1111-4111-8111-111111111111',
      'a2222222-2222-4222-8222-222222222222',
      'a3333333-3333-4333-8333-333333333333',
    ];
    mock.uploadUrlPost.mockImplementation(async () => {
      const imageId = imageIds[urlCount % imageIds.length]!;
      urlCount += 1;
      return {
        ok: true,
        json: async () => ({
          imageId,
          uploadUrl: `https://example.com/upload-${urlCount}`,
          key: `originals/${projectId}/${imageId}`,
        }),
      };
    });
    const putQueue = [...putResults];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: putQueue.length > 0 ? putQueue.shift()! : true })),
    );
    mock.commitPost.mockResolvedValue({ ok: true, json: async () => ({}) });
    mock.linkImagePatch.mockImplementation(async ({ param }: { param: { imageId: string } }) => ({
      ok: true,
      json: async () => ({
        id: param.imageId,
        projectId,
        roomId,
        status: 'processing',
        sortOrder: 1,
      }),
    }));
    mock.imageMetadataPatch.mockImplementation(
      async ({ param }: { param: { imageId: string } }) => ({
        ok: true,
        json: async () => ({
          id: param.imageId,
          roomId,
          status: 'processing',
          sortOrder: 1,
          themeSlugs: [],
          materialSlugs: [],
          finishSlugs: [],
          tagSlugs: [],
          width: null,
          height: null,
          failureReason: null,
          derivatives: [],
          previewUrl: null,
          viewerUrl: null,
        }),
      }),
    );
  }

  async function dropFiles(names: Array<{ name: string; type?: string }>) {
    const dropCopy = await screen.findByText(/drag and drop files here or click to upload/i);
    const dropZone = dropCopy.closest('label');
    if (!dropZone) throw new Error('Upload drop zone was not rendered');
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: names.map(
          (entry) => new File(['image'], entry.name, { type: entry.type ?? 'image/jpeg' }),
        ),
      },
    } as unknown as EventInit);
  }

  it('settles every batch item when the first transfer fails instead of stalling the rest', async () => {
    mockSuccessfulLookups();
    mockTransferPipeline([false, true]);
    render(<DesignerProjectUpload initialProjectId={projectId} />);

    await dropFiles([{ name: 'first.jpg' }, { name: 'second.jpg' }]);

    await waitFor(() => expect(mock.uploadUrlPost).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText(/1 of 2 photos failed/i)).toBeInTheDocument());

    // The failed tile names the transfer error and offers a retry.
    expect(screen.getByText('Could not upload first.jpg.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry upload/i })).toBeInTheDocument();
    // The half-transferred server row is cleaned up best-effort.
    await waitFor(() =>
      expect(mock.deleteImage).toHaveBeenCalledWith({
        param: { id: projectId, imageId: 'a1111111-1111-4111-8111-111111111111' },
      }),
    );
    // The second file transferred fully instead of stalling at Processing.
    await waitFor(() => expect(mock.linkImagePatch).toHaveBeenCalled());
    expect(screen.queryByText('second.jpg · Processing')).not.toBeInTheDocument();
  });

  it('retries a failed tile with its original file', async () => {
    mockSuccessfulLookups();
    mockTransferPipeline([false]);
    render(<DesignerProjectUpload initialProjectId={projectId} />);

    await dropFiles([{ name: 'first.jpg' }]);
    await screen.findByRole('button', { name: /retry upload/i });

    mockTransferPipeline([true]);
    await userEvent.setup().click(screen.getByRole('button', { name: /retry upload/i }));

    await waitFor(() => expect(mock.uploadUrlPost).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /retry upload/i })).not.toBeInTheDocument(),
    );
  });

  it('settles the batch without waiting for orphan cleanup', async () => {
    mockSuccessfulLookups();
    mockTransferPipeline([false, true]);
    mock.deleteImage.mockImplementationOnce(() => new Promise<Response>(() => {}));
    render(<DesignerProjectUpload initialProjectId={projectId} />);

    await dropFiles([{ name: 'first.jpg' }, { name: 'second.jpg' }]);

    await waitFor(() => expect(mock.uploadUrlPost).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Could not upload first.jpg.')).toBeInTheDocument();
    await screen.findByRole('button', { name: /retry upload/i });
    expect(mock.linkImagePatch).toHaveBeenCalled();
  });

  it('restores server image state after a failed reorder', async () => {
    mockSuccessfulLookups();
    const processingItem = {
      ...readyItem,
      id: 'c1111111-1111-4111-8111-111111111111',
      status: 'processing',
      sortOrder: 1,
    };
    mockImageList([readyItem, processingItem]);
    mock.linkImagePatch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Reorder failed' } }),
    });
    render(<DesignerProjectUpload initialProjectId={projectId} />);
    await screen.findByText('Processing');

    // The worker finishes while the failed reorder triggers an image-only refresh.
    mockImageList([readyItem, { ...processingItem, status: 'ready' }]);
    await userEvent.setup().click(screen.getByRole('button', { name: /move image 2 earlier/i }));

    await waitFor(() => expect(screen.queryByText('Processing')).not.toBeInTheDocument());
    expect(screen.getAllByText('Ready')).toHaveLength(2);
  });

  it('shows the persisted processing reason on failed tiles with a recovery path', async () => {
    mockSuccessfulLookups();
    mockImageList([
      readyItem,
      {
        id: 'b1111111-1111-4111-8111-111111111111',
        roomId,
        status: 'failed',
        sortOrder: 1,
        themeSlugs: [],
        materialSlugs: [],
        finishSlugs: [],
        tagSlugs: [],
        width: null,
        height: null,
        failureReason: 'duplicate',
        derivatives: [],
        previewUrl: null,
        viewerUrl: null,
      },
    ]);
    render(<DesignerProjectUpload initialProjectId={projectId} />);

    await screen.findByText(/looks like a duplicate of another photo/i);
    expect(
      screen.getByText(/remove this photo and upload it again to recover/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry upload/i })).not.toBeInTheDocument();
    // The room header counts usable photos only, matching the photo checklist.
    expect(screen.getByText('1 photo added')).toBeInTheDocument();
  });

  it('refreshes completeness automatically while images are processing', async () => {
    mockSuccessfulLookups();
    mockImageList([
      readyItem,
      {
        ...readyItem,
        id: 'c1111111-1111-4111-8111-111111111111',
        status: 'processing',
      },
    ]);
    render(<DesignerProjectUpload initialProjectId={projectId} />);

    await screen.findByText('Living Room');
    const initialCompletenessCalls = mock.completenessGet.mock.calls.length;

    await waitFor(() => expect(mock.listImagesGet.mock.calls.length).toBeGreaterThan(1), {
      timeout: 9000,
    });
    expect(mock.completenessGet.mock.calls.length).toBeGreaterThan(initialCompletenessCalls);
  }, 15000);
});
