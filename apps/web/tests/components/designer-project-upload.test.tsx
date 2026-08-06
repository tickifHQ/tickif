import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DesignerProjectUpload } from '../../src/components/designer-project-upload';

const mock = vi.hoisted(() => ({
  router: {
    push: vi.fn(),
    replace: vi.fn(),
  },
  taxonomyGet: vi.fn(),
  projectGet: vi.fn(),
  listImagesGet: vi.fn(),
  deleteImage: vi.fn(),
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
          images: {
            $get: mock.listImagesGet,
            ':imageId': {
              $delete: mock.deleteImage,
            },
          },
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
          title: '2 BHK in Adyar',
          slug: '2-bhk-in-adyar',
          description: null,
          status: 'draft',
          rejectionReasonCode: null,
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
  });

  function selectWithOption(container: HTMLElement, optionLabel: string) {
    const select = Array.from(container.querySelectorAll('select')).find((candidate) =>
      Array.from(candidate.options).some((option) => option.textContent === optionLabel),
    );

    if (!select) throw new Error(`Could not find select containing option "${optionLabel}"`);
    return select;
  }

  it('keeps a deleted image removed when the follow-up refresh fails', async () => {
    const user = userEvent.setup();

    render(<DesignerProjectUpload initialProjectId="11111111-1111-4111-8111-111111111111" />);

    await screen.findByText('Living Room');
    await user.click(screen.getByRole('button', { name: /remove image 1/i }));

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

  it('shows changes-needed feedback above the visibility tips for requested changes', async () => {
    const response = await mock.projectGet();
    const project = (await response.json()) as Record<string, unknown>;
    mock.projectGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...project,
          status: 'changes_requested',
          moderationNote: 'Upload higher-resolution images.\nAdd clearer room labels.',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    render(<DesignerProjectUpload initialProjectId="11111111-1111-4111-8111-111111111111" />);

    const changesHeading = await screen.findByText('CHANGES NEEDED ON');
    expect(screen.getByText('Upload higher-resolution images.')).toBeInTheDocument();
    expect(screen.getByText('Add clearer room labels.')).toBeInTheDocument();
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
