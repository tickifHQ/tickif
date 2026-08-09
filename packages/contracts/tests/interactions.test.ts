import { describe, expect, it } from 'vitest';
import { recordViewEventSchema } from '../src/interactions';

const eventKey = '11111111-1111-4111-8111-111111111111';
const anonymousId = '22222222-2222-4222-8222-222222222222';

describe('recordViewEventSchema', () => {
  it.each([
    {
      type: 'project_view',
      eventKey,
      anonymousId,
      projectId: '33333333-3333-4333-8333-333333333333',
    },
    {
      type: 'profile_view',
      eventKey,
      anonymousId,
      designerProfileId: '44444444-4444-4444-8444-444444444444',
    },
  ])('accepts the typed $type payload', (payload) => {
    expect(recordViewEventSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects mismatched targets and arbitrary tracking metadata', () => {
    expect(
      recordViewEventSchema.safeParse({
        type: 'project_view',
        eventKey,
        anonymousId,
        designerProfileId: '44444444-4444-4444-8444-444444444444',
      }).success,
    ).toBe(false);
    expect(
      recordViewEventSchema.safeParse({
        type: 'profile_view',
        eventKey,
        anonymousId,
        designerProfileId: '44444444-4444-4444-8444-444444444444',
        userAgent: 'not accepted',
      }).success,
    ).toBe(false);
  });
});
