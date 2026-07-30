/**
 * Unit tests for GET /api/search/suggest endpoint.
 *
 * Tests the blended suggest (autocomplete) functionality that returns
 * both projects and designers in a single response. Uses mocked repository
 * layer to avoid requiring live Typesense.
 *
 * @validates Requirements 3.1-3.8
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../../../src/app.js';

// Mock the search repository to avoid requiring a live Typesense instance
vi.mock('../../../src/modules/search/repository.js', () => ({
  multiSearch: vi.fn(),
  searchProjects: vi.fn(),
  searchDesigners: vi.fn(),
  recentProjectsInCity: vi.fn(),
}));

// Mock storage presign to return predictable URLs
vi.mock('@repo/storage', () => ({
  presignDownload: vi.fn(async ({ key }: { key: string }) => `https://cdn.example.com/${key}?signed=1`),
}));

import * as repository from '../../../src/modules/search/repository.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function json<T = unknown>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

async function get(path: string): Promise<Response> {
  return app.request(path, { method: 'GET' });
}

function createMockProjectDocument(overrides: Partial<{
  id: string;
  slug: string;
  title: string;
  designerName: string;
  citySlug: string | null;
  coverImageKey: string | null;
}> = {}) {
  return {
    id: overrides.id !== undefined ? overrides.id : 'project-1',
    slug: overrides.slug !== undefined ? overrides.slug : 'modern-apartment',
    title: overrides.title !== undefined ? overrides.title : 'Modern Apartment Design',
    designerName: overrides.designerName !== undefined ? overrides.designerName : 'Test Designer',
    citySlug: 'citySlug' in overrides ? overrides.citySlug : 'mumbai',
    coverImageKey: 'coverImageKey' in overrides ? overrides.coverImageKey : 'projects/cover-1.jpg',
  };
}

function createMockDesignerDocument(overrides: Partial<{
  id: string;
  slug: string | null;
  displayName: string;
  citySlugs: string[];
  logoImageKey: string | null;
  projectCount: number;
}> = {}) {
  return {
    id: overrides.id !== undefined ? overrides.id : 'designer-1',
    slug: 'slug' in overrides ? overrides.slug : 'test-designer',
    displayName: overrides.displayName !== undefined ? overrides.displayName : 'Test Designer Studio',
    citySlugs: overrides.citySlugs !== undefined ? overrides.citySlugs : ['mumbai', 'pune'],
    logoImageKey: 'logoImageKey' in overrides ? overrides.logoImageKey : 'designers/logo-1.png',
    projectCount: overrides.projectCount !== undefined ? overrides.projectCount : 15,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/search/suggest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Basic suggest search with q parameter (Requirement 3.1)
  // ─────────────────────────────────────────────────────────────────────────────

  it('returns blended results with both projects and designers arrays', async () => {
    const mockProjects = [
      createMockProjectDocument({ id: 'p1', title: 'Modern Living Room' }),
      createMockProjectDocument({ id: 'p2', title: 'Modern Kitchen' }),
    ];
    const mockDesigners = [
      createMockDesignerDocument({ id: 'd1', displayName: 'Modern Interiors' }),
    ];

    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: mockProjects as unknown as repository.MultiSearchResult['projects'],
      designers: mockDesigners as unknown as repository.MultiSearchResult['designers'],
      processingTimeMs: 12,
    });

    const res = await get('/api/search/suggest?q=modern');

    expect(res.status).toBe(200);
    const body = await json<{
      projects: unknown[];
      designers: unknown[];
      processingTimeMs: number;
    }>(res);

    expect(body).toHaveProperty('projects');
    expect(body).toHaveProperty('designers');
    expect(body).toHaveProperty('processingTimeMs');
    expect(Array.isArray(body.projects)).toBe(true);
    expect(Array.isArray(body.designers)).toBe(true);
    expect(body.projects).toHaveLength(2);
    expect(body.designers).toHaveLength(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Result limits (Requirements 3.2, 3.3)
  // ─────────────────────────────────────────────────────────────────────────────

  it('returns maximum 5 projects in suggest response', async () => {
    // Simulate repository returning exactly 5 projects (the limit)
    const mockProjects = Array.from({ length: 5 }, (_, i) =>
      createMockProjectDocument({ id: `p${i + 1}`, title: `Project ${i + 1}` })
    );

    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: mockProjects as unknown as repository.MultiSearchResult['projects'],
      designers: [],
      processingTimeMs: 8,
    });

    const res = await get('/api/search/suggest?q=design');

    expect(res.status).toBe(200);
    const body = await json<{ projects: unknown[] }>(res);
    expect(body.projects).toHaveLength(5);
  });

  it('returns maximum 3 designers in suggest response', async () => {
    // Simulate repository returning exactly 3 designers (the limit)
    const mockDesigners = Array.from({ length: 3 }, (_, i) =>
      createMockDesignerDocument({ id: `d${i + 1}`, displayName: `Designer ${i + 1}` })
    );

    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [],
      designers: mockDesigners as unknown as repository.MultiSearchResult['designers'],
      processingTimeMs: 5,
    });

    const res = await get('/api/search/suggest?q=designer');

    expect(res.status).toBe(200);
    const body = await json<{ designers: unknown[] }>(res);
    expect(body.designers).toHaveLength(3);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Minimal field selection (Requirements 3.6, 3.7)
  // ─────────────────────────────────────────────────────────────────────────────

  it('returns only minimal fields for projects: id, slug, title, designerName, citySlug, coverImageUrl', async () => {
    const mockProject = createMockProjectDocument({
      id: 'project-123',
      slug: 'test-project',
      title: 'Test Project Title',
      designerName: 'Test Designer',
      citySlug: 'mumbai',
      coverImageKey: 'projects/cover.jpg',
    });

    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [mockProject] as unknown as repository.MultiSearchResult['projects'],
      designers: [],
      processingTimeMs: 3,
    });

    const res = await get('/api/search/suggest?q=test');

    expect(res.status).toBe(200);
    const body = await json<{
      projects: Array<{
        id: string;
        slug: string;
        title: string;
        designerName: string;
        citySlug: string | null;
        coverImageUrl: string | null;
      }>;
    }>(res);

    expect(body.projects).toHaveLength(1);
    const project = body.projects[0]!;

    // Verify only expected fields are present
    expect(project).toHaveProperty('id', 'project-123');
    expect(project).toHaveProperty('slug', 'test-project');
    expect(project).toHaveProperty('title', 'Test Project Title');
    expect(project).toHaveProperty('designerName', 'Test Designer');
    expect(project).toHaveProperty('citySlug', 'mumbai');
    expect(project).toHaveProperty('coverImageUrl');

    // Ensure no extra fields are present
    const allowedKeys = ['id', 'slug', 'title', 'designerName', 'citySlug', 'coverImageUrl'];
    expect(Object.keys(project).sort()).toEqual(allowedKeys.sort());
  });

  it('returns only minimal fields for designers: id, slug, displayName, citySlugs, logoUrl, projectCount', async () => {
    const mockDesigner = createMockDesignerDocument({
      id: 'designer-456',
      slug: 'test-studio',
      displayName: 'Test Studio Design',
      citySlugs: ['mumbai', 'delhi'],
      logoImageKey: 'designers/logo.png',
      projectCount: 25,
    });

    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [],
      designers: [mockDesigner] as unknown as repository.MultiSearchResult['designers'],
      processingTimeMs: 4,
    });

    const res = await get('/api/search/suggest?q=studio');

    expect(res.status).toBe(200);
    const body = await json<{
      designers: Array<{
        id: string;
        slug: string | null;
        displayName: string;
        citySlugs: string[];
        logoUrl: string | null;
        projectCount: number;
      }>;
    }>(res);

    expect(body.designers).toHaveLength(1);
    const designer = body.designers[0]!;

    // Verify only expected fields are present
    expect(designer).toHaveProperty('id', 'designer-456');
    expect(designer).toHaveProperty('slug', 'test-studio');
    expect(designer).toHaveProperty('displayName', 'Test Studio Design');
    expect(designer).toHaveProperty('citySlugs');
    expect(designer.citySlugs).toEqual(['mumbai', 'delhi']);
    expect(designer).toHaveProperty('logoUrl');
    expect(designer).toHaveProperty('projectCount', 25);

    // Ensure no extra fields are present
    const allowedKeys = ['id', 'slug', 'displayName', 'citySlugs', 'logoUrl', 'projectCount'];
    expect(Object.keys(designer).sort()).toEqual(allowedKeys.sort());
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // processingTimeMs presence (Requirement 3.1)
  // ─────────────────────────────────────────────────────────────────────────────

  it('includes processingTimeMs in response', async () => {
    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [],
      designers: [],
      processingTimeMs: 42,
    });

    const res = await get('/api/search/suggest?q=anything');

    expect(res.status).toBe(200);
    const body = await json<{ processingTimeMs: number }>(res);
    expect(body.processingTimeMs).toBe(42);
    expect(typeof body.processingTimeMs).toBe('number');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Cache-Control header (Requirement 3.8)
  // ─────────────────────────────────────────────────────────────────────────────

  it('returns Cache-Control header with correct value', async () => {
    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [],
      designers: [],
      processingTimeMs: 5,
    });

    const res = await get('/api/search/suggest?q=test');

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=30, stale-while-revalidate=120'
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Validation errors (Requirements 3.4, 3.5)
  // ─────────────────────────────────────────────────────────────────────────────

  it('returns 422 when q parameter is empty', async () => {
    const res = await get('/api/search/suggest?q=');

    expect(res.status).toBe(422);
    const body = await json<{ error: { code: string } }>(res);
    expect(body.error.code).toBe('validation_error');
  });

  it('returns 422 when q parameter is missing', async () => {
    const res = await get('/api/search/suggest');

    expect(res.status).toBe(422);
    const body = await json<{ error: { code: string } }>(res);
    expect(body.error.code).toBe('validation_error');
  });

  it('returns 422 when q parameter exceeds 200 characters', async () => {
    const longQuery = 'a'.repeat(201);
    const res = await get(`/api/search/suggest?q=${longQuery}`);

    expect(res.status).toBe(422);
    const body = await json<{ error: { code: string } }>(res);
    expect(body.error.code).toBe('validation_error');
  });

  it('accepts q parameter at exactly 200 characters', async () => {
    const maxQuery = 'a'.repeat(200);
    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [],
      designers: [],
      processingTimeMs: 10,
    });

    const res = await get(`/api/search/suggest?q=${maxQuery}`);

    expect(res.status).toBe(200);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Presigned URLs (Requirements 8.1, 8.2, 8.3)
  // ─────────────────────────────────────────────────────────────────────────────

  it('returns presigned URLs for non-null image keys in projects', async () => {
    const mockProject = createMockProjectDocument({
      coverImageKey: 'projects/cover-image.jpg',
    });

    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [mockProject] as unknown as repository.MultiSearchResult['projects'],
      designers: [],
      processingTimeMs: 5,
    });

    const res = await get('/api/search/suggest?q=modern');

    expect(res.status).toBe(200);
    const body = await json<{
      projects: Array<{ coverImageUrl: string | null }>;
    }>(res);

    expect(body.projects[0]!.coverImageUrl).toBe(
      'https://cdn.example.com/projects/cover-image.jpg?signed=1'
    );
  });

  it('returns presigned URLs for non-null logo keys in designers', async () => {
    const mockDesigner = createMockDesignerDocument({
      logoImageKey: 'designers/logo-image.png',
    });

    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [],
      designers: [mockDesigner] as unknown as repository.MultiSearchResult['designers'],
      processingTimeMs: 5,
    });

    const res = await get('/api/search/suggest?q=studio');

    expect(res.status).toBe(200);
    const body = await json<{
      designers: Array<{ logoUrl: string | null }>;
    }>(res);

    expect(body.designers[0]!.logoUrl).toBe(
      'https://cdn.example.com/designers/logo-image.png?signed=1'
    );
  });

  it('returns null coverImageUrl when image key is null', async () => {
    const mockProject = createMockProjectDocument({
      coverImageKey: null,
    });

    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [mockProject] as unknown as repository.MultiSearchResult['projects'],
      designers: [],
      processingTimeMs: 5,
    });

    const res = await get('/api/search/suggest?q=test');

    expect(res.status).toBe(200);
    const body = await json<{
      projects: Array<{ coverImageUrl: string | null }>;
    }>(res);

    expect(body.projects[0]!.coverImageUrl).toBeNull();
  });

  it('returns null logoUrl when logo key is null', async () => {
    const mockDesigner = createMockDesignerDocument({
      logoImageKey: null,
    });

    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [],
      designers: [mockDesigner] as unknown as repository.MultiSearchResult['designers'],
      processingTimeMs: 5,
    });

    const res = await get('/api/search/suggest?q=test');

    expect(res.status).toBe(200);
    const body = await json<{
      designers: Array<{ logoUrl: string | null }>;
    }>(res);

    expect(body.designers[0]!.logoUrl).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge cases
  // ─────────────────────────────────────────────────────────────────────────────

  it('returns empty arrays when no results are found', async () => {
    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [],
      designers: [],
      processingTimeMs: 2,
    });

    const res = await get('/api/search/suggest?q=xyznonexistent');

    expect(res.status).toBe(200);
    const body = await json<{
      projects: unknown[];
      designers: unknown[];
      processingTimeMs: number;
    }>(res);

    expect(body.projects).toEqual([]);
    expect(body.designers).toEqual([]);
    expect(body.processingTimeMs).toBe(2);
  });

  it('handles single character q parameter', async () => {
    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [createMockProjectDocument()] as unknown as repository.MultiSearchResult['projects'],
      designers: [],
      processingTimeMs: 5,
    });

    const res = await get('/api/search/suggest?q=m');

    expect(res.status).toBe(200);
    const body = await json<{ projects: unknown[] }>(res);
    expect(body.projects).toHaveLength(1);
  });

  it('handles special characters in q parameter', async () => {
    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [],
      designers: [],
      processingTimeMs: 5,
    });

    // URL encode special characters
    const specialQuery = encodeURIComponent('modern & minimal');
    const res = await get(`/api/search/suggest?q=${specialQuery}`);

    expect(res.status).toBe(200);
    expect(vi.mocked(repository.multiSearch)).toHaveBeenCalledWith('modern & minimal');
  });

  it('passes the q parameter correctly to the repository', async () => {
    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [],
      designers: [],
      processingTimeMs: 5,
    });

    await get('/api/search/suggest?q=luxury%20apartment');

    expect(vi.mocked(repository.multiSearch)).toHaveBeenCalledWith('luxury apartment');
  });

  it('handles designer with null slug', async () => {
    const mockDesigner = createMockDesignerDocument({
      slug: null,
    });

    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [],
      designers: [mockDesigner] as unknown as repository.MultiSearchResult['designers'],
      processingTimeMs: 5,
    });

    const res = await get('/api/search/suggest?q=new');

    expect(res.status).toBe(200);
    const body = await json<{
      designers: Array<{ slug: string | null }>;
    }>(res);

    expect(body.designers[0]!.slug).toBeNull();
  });

  it('handles project with null citySlug', async () => {
    const mockProject = createMockProjectDocument({
      citySlug: null,
    });

    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [mockProject] as unknown as repository.MultiSearchResult['projects'],
      designers: [],
      processingTimeMs: 5,
    });

    const res = await get('/api/search/suggest?q=project');

    expect(res.status).toBe(200);
    const body = await json<{
      projects: Array<{ citySlug: string | null }>;
    }>(res);

    expect(body.projects[0]!.citySlug).toBeNull();
  });

  it('handles designers with empty citySlugs array', async () => {
    const mockDesigner = createMockDesignerDocument({
      citySlugs: [],
    });

    vi.mocked(repository.multiSearch).mockResolvedValue({
      projects: [],
      designers: [mockDesigner] as unknown as repository.MultiSearchResult['designers'],
      processingTimeMs: 5,
    });

    const res = await get('/api/search/suggest?q=freelance');

    expect(res.status).toBe(200);
    const body = await json<{
      designers: Array<{ citySlugs: string[] }>;
    }>(res);

    expect(body.designers[0]!.citySlugs).toEqual([]);
  });
});
