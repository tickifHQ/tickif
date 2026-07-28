import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDesignerProjects,
  fetchPublicPortfolio,
} from '../../src/lib/public-portfolio-api';
import { makeProject, makePublicPortfolio } from '../fixtures/public-portfolio';

const mock = vi.hoisted(() => ({
  portfolioGet: vi.fn(),
  projectsGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      portfolios: { ':slug': { $get: mock.portfolioGet } },
      profiles: { ':id': { projects: { $get: mock.projectsGet } } },
    },
  },
}));

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchPublicPortfolio', () => {
  it('returns the payload for a published portfolio', async () => {
    const portfolio = makePublicPortfolio();
    mock.portfolioGet.mockResolvedValue(jsonResponse(portfolio));

    await expect(fetchPublicPortfolio('anika-spaces')).resolves.toEqual(portfolio);
    expect(mock.portfolioGet).toHaveBeenCalledWith({ param: { slug: 'anika-spaces' } });
  });

  it('returns null on 404 so the page can render notFound rather than an error', async () => {
    mock.portfolioGet.mockResolvedValue(jsonResponse({ error: { message: 'nope' } }, 404));

    await expect(fetchPublicPortfolio('missing')).resolves.toBeNull();
  });

  it('throws on any other failure so a broken API is not shown as an empty page', async () => {
    mock.portfolioGet.mockResolvedValue(jsonResponse({ error: { message: 'boom' } }, 500));

    await expect(fetchPublicPortfolio('anika-spaces')).rejects.toThrow(/HTTP 500/);
  });
});

describe('fetchDesignerProjects', () => {
  it('requests the given page and returns the projects', async () => {
    const page = { projects: [makeProject()], page: 2, limit: 30, hasMore: false };
    mock.projectsGet.mockResolvedValue(jsonResponse(page));

    await expect(
      fetchDesignerProjects('22222222-2222-4222-8222-222222222222', { page: 2, limit: 30 }),
    ).resolves.toEqual(page);
    expect(mock.projectsGet).toHaveBeenCalledWith({
      param: { id: '22222222-2222-4222-8222-222222222222' },
      query: { page: '2', limit: '30' },
    });
  });

  it('throws when the page cannot be loaded', async () => {
    mock.projectsGet.mockResolvedValue(jsonResponse({ error: { message: 'boom' } }, 500));

    await expect(
      fetchDesignerProjects('22222222-2222-4222-8222-222222222222', { page: 2, limit: 30 }),
    ).rejects.toThrow('Could not load more projects.');
  });
});
