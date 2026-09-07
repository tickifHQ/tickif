import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  listImagesGet: vi.fn(),
  deleteRoom: vi.fn(),
  deleteImage: vi.fn(),
  submitPost: vi.fn(),
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
          submit: { $post: mock.submitPost },
          images: {
            $get: mock.listImagesGet,
            ':imageId': {
              $delete: mock.deleteImage,
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
        ':imageId': { metadata: { $patch: mock.imageMetadataPatch } },
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

  it.each(['draft', 'submitted', 'in_review', 'changes_requested'] as const)(
    'shows the published version remains live when pending changes are %s',
    async (status) => {
      const response = await mock.projectGet();
      const project = (await response.json()) as Record<string, unknown>;
      mock.projectGet.mockResolvedValue(
        new Response(
          JSON.stringify({
            ...project,
            status,
            liveStatus: 'published',
            pendingChanges: true,
            pendingStatus: status,
          }),
        ),
      );

      render(<DesignerProjectUpload initialProjectId="11111111-1111-4111-8111-111111111111" />);

      expect(await screen.findByText('Live · Pending changes')).toBeInTheDocument();
      expect(
        screen.getByText(/Your approved project remains live at its existing URL/),
      ).toBeInTheDocument();
      const submit = screen.getByRole('button', {
        name:
          status === 'changes_requested'
            ? 'Resubmit changes for review'
            : 'Submit changes for review',
      });
      if (status === 'submitted' || status === 'in_review') {
        expect(submit).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
      } else {
        expect(submit).toBeEnabled();
      }
    },
  );

  it('saves minor edits to the live project without submitting a review', async () => {
    const response = await mock.projectGet();
    const draft = (await response.json()) as Record<string, unknown>;
    const liveProject = {
      ...draft,
      status: 'published',
      liveStatus: 'published',
      pendingChanges: false,
    };
    mock.projectGet.mockImplementation(async () => Response.json(liveProject));
    mock.projectPatch.mockImplementation(async () => Response.json(liveProject));
    mock.roomPatch.mockImplementation(async () => Response.json({}));
    const imagesResponse = await mock.listImagesGet();
    const images = (await imagesResponse.json()) as { items: unknown[] };
    mock.listImagesGet.mockReset().mockImplementation(async () => Response.json(images));
    mock.imageMetadataPatch.mockImplementation(async () => Response.json(images.items[0]));
    const user = userEvent.setup();
    render(<DesignerProjectUpload initialProjectId="11111111-1111-4111-8111-111111111111" />);

    await screen.findByText('Live project');
    await user.click(screen.getByRole('button', { name: 'Submit changes for review' }));

    expect(
      await screen.findByText('Changes saved to your live project. No review is needed.'),
    ).toBeInTheDocument();
    expect(mock.projectPatch).toHaveBeenCalledOnce();
    expect(mock.submitPost).not.toHaveBeenCalled();
  });

  it('refreshes pending status when graph edits create a version after the scalar save', async () => {
    const response = await mock.projectGet();
    const draft = (await response.json()) as Record<string, unknown>;
    const liveProject = {
      ...draft,
      status: 'published',
      liveStatus: 'published',
      pendingChanges: false,
    };
    const pendingProject = {
      ...liveProject,
      status: 'draft',
      pendingChanges: true,
      pendingStatus: 'draft',
    };
    mock.projectGet
      .mockReset()
      .mockImplementationOnce(async () => Response.json(liveProject))
      .mockImplementation(async () => Response.json(pendingProject));
    mock.projectPatch.mockImplementation(async () => Response.json(liveProject));
    mock.roomPatch.mockImplementation(async () => Response.json({}));
    const imagesResponse = await mock.listImagesGet();
    const images = (await imagesResponse.json()) as { items: unknown[] };
    mock.listImagesGet.mockReset().mockImplementation(async () => Response.json(images));
    mock.imageMetadataPatch.mockImplementation(async () => Response.json(images.items[0]));
    mock.completenessGet.mockImplementation(async () =>
      Response.json({
        complete: true,
        score: 100,
        missing: [],
        requirements: [],
      }),
    );
    const user = userEvent.setup();
    render(<DesignerProjectUpload initialProjectId="11111111-1111-4111-8111-111111111111" />);

    await screen.findByText('Live project');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Live · Pending changes')).toBeInTheDocument();
    expect(
      await screen.findByText('Changes saved for review. Your approved project remains live.'),
    ).toBeInTheDocument();
    expect(mock.submitPost).not.toHaveBeenCalled();
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
    mock.projectPatch.mockResolvedValue({ ok: true, json: async () => ({ ...draft, coverImageId: firstImage.id }) });
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
    mock.submitPost.mockResolvedValue({
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

    await waitFor(() => expect(mock.submitPost).toHaveBeenCalled());
    expect(mock.projectPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({ coverImageId: firstImage.id }),
      }),
    );
    expect(mock.projectPatch.mock.invocationCallOrder[0]).toBeLessThan(
      mock.completenessGet.mock.invocationCallOrder[0]!,
    );
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
