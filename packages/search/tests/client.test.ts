import { config } from '@repo/config';
import { describe, expect, it } from 'vitest';
import {
  assertSearchConfig,
  searchBootstrapClient,
  searchClient,
} from '../src/client.js';

describe('search clients', () => {
  it('uses the search-only key and fails over quickly for public queries', () => {
    const client = searchClient();

    expect(client.configuration.apiKey).toBe(config.TYPESENSE_SEARCH_API_KEY);
    expect(client.configuration.connectionTimeoutSeconds).toBe(1);
    expect(client.configuration.numRetries).toBe(1);
  });

  it('confines the admin key to the bootstrap client', () => {
    expect(searchBootstrapClient().configuration.apiKey).toBe(config.TYPESENSE_API_KEY);
  });

  it('rejects local or shared credentials in production', () => {
    expect(() =>
      assertSearchConfig(
        {
          TYPESENSE_API_KEY: 'tickif-local-typesense-key',
          TYPESENSE_SEARCH_API_KEY: 'production-search-key',
        },
        true,
      ),
    ).toThrow('TYPESENSE_API_KEY must be replaced in production');

    expect(() =>
      assertSearchConfig(
        {
          TYPESENSE_API_KEY: 'production-admin-key',
          TYPESENSE_SEARCH_API_KEY: 'tickif-local-typesense-key',
        },
        true,
      ),
    ).toThrow('TYPESENSE_SEARCH_API_KEY must be replaced in production');

    expect(() =>
      assertSearchConfig(
        {
          TYPESENSE_API_KEY: 'production-admin-key',
          TYPESENSE_SEARCH_API_KEY: 'production-admin-key',
        },
        true,
      ),
    ).toThrow('TYPESENSE_SEARCH_API_KEY must be a separate search-only key');
  });
});
