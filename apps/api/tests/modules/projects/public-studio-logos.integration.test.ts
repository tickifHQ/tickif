import { describe, expect, it } from 'vitest';
import { makeDesigner, makeProject } from '@repo/db/testing';
import { projectsRepository } from '../../../src/modules/projects/repository.js';
import { withPublicStudioLogos } from '../../../src/modules/projects/public-studio-logos.js';

describe('public studio logo visibility', () => {
  it('resolves only published projects belonging to active studios', async () => {
    const active = await makeDesigner({ status: 'active', logoImageId: 'logos/active.png' });
    const suspended = await makeDesigner({ status: 'suspended', logoImageId: 'logos/private.png' });
    const published = await makeProject({ designerId: active.id, status: 'published' });
    const draft = await makeProject({ designerId: active.id, status: 'draft' });
    const hidden = await makeProject({ designerId: suspended.id, status: 'published' });
    const keys = await projectsRepository.findPublicStudioLogoKeys([
      published.id,
      draft.id,
      hidden.id,
    ]);
    expect(keys).toEqual(new Map([[published.id, 'logos/active.png']]));
    const cards = await withPublicStudioLogos([published, draft, hidden]);
    expect(cards[0]?.studioLogoUrl).toContain('logos/active.png');
    expect(cards[1]?.studioLogoUrl).toBeNull();
    expect(cards[2]?.studioLogoUrl).toBeNull();
  });
});
