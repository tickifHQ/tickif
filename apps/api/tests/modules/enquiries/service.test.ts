import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/modules/enquiries/repository.js', () => ({
  enquiriesRepository: {
    findById: vi.fn(),
    findOpenByRequesterAndDesigner: vi.fn(),
    findDesignerEligibility: vi.fn(),
    list: vi.fn(),
    createWithLead: vi.fn(),
  },
}));

const { enquiriesService } = await import('../../../src/modules/enquiries/service.js');
const { enquiriesRepository } = await import('../../../src/modules/enquiries/repository.js');

const caller = {
  userId: 'visitor_1',
  name: 'Priya Shah',
  phoneNumber: '+919800000001',
  isBanned: false,
};

const designerProfileId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enquiriesRepository.findDesignerEligibility).mockResolvedValue({
    isOwnStudio: false,
  });
  vi.mocked(enquiriesRepository.findOpenByRequesterAndDesigner).mockResolvedValue(null);
});

describe('enquiriesService.check', () => {
  it("marks the caller's own studio as unavailable", async () => {
    vi.mocked(enquiriesRepository.findDesignerEligibility).mockResolvedValue({
      isOwnStudio: true,
    });

    const result = await enquiriesService.check({ designerProfileId }, caller);

    expect(result).toEqual({
      canEnquire: false,
      unavailableReason: 'own_studio',
      exists: false,
      enquiryId: null,
    });
    expect(enquiriesRepository.findOpenByRequesterAndDesigner).not.toHaveBeenCalled();
  });

  it('reports an existing open enquiry as unavailable', async () => {
    vi.mocked(enquiriesRepository.findOpenByRequesterAndDesigner).mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });

    const result = await enquiriesService.check({ designerProfileId }, caller);

    expect(result).toEqual({
      canEnquire: false,
      unavailableReason: 'existing_enquiry',
      exists: true,
      enquiryId: '11111111-1111-4111-8111-111111111111',
    });
  });
});

describe('enquiriesService.create', () => {
  it('rejects enquiries to a studio the caller belongs to before creating records', async () => {
    vi.mocked(enquiriesRepository.createWithLead).mockResolvedValue({ kind: 'own_studio' });

    await expect(
      enquiriesService.create(
        {
          designerProfileId,
          subject: 'Renovation enquiry',
          description: 'I would like to discuss a full-home renovation.',
          budget: 'premium',
        },
        caller,
      ),
    ).rejects.toMatchObject({
      status: 422,
      message: 'You cannot send an enquiry to your own studio',
    });
    expect(enquiriesRepository.createWithLead).toHaveBeenCalledOnce();
  });
});
