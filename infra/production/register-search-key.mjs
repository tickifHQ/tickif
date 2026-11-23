// One-shot operations job. Credential values and provider bodies never go to logs.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const collections = ['^tickif_production_(projects|designers)(_v[A-Za-z0-9_-]+)?$'];
export async function registerSearchKey(admin, search, baseUrl = 'http://typesense:8108') {
  const description = `tickif-production-search-${createHash('sha256').update(search).digest('hex').slice(0, 24)}`;
  async function request(path, key, options = {}) {
    return fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { 'X-TYPESENSE-API-KEY': key, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
  }
  if (search === admin || search.length < 32) throw new Error('Invalid key');
  const response = await request('/keys', admin);
  if (!response.ok) throw new Error('Key inventory failed');
  const { keys } = await response.json();
  const existing = keys.filter((key) => key.description === description);
  if (existing.length > 1) throw new Error('Duplicate key metadata');
  if (existing.length === 1) {
    if (
      JSON.stringify(existing[0].actions) !== JSON.stringify(['documents:search']) ||
      JSON.stringify(existing[0].collections) !== JSON.stringify(collections)
    ) {
      throw new Error('Existing search key has unexpected permissions');
    }
  } else {
    const created = await request('/keys', admin, {
      method: 'POST',
      body: JSON.stringify({
        description,
        actions: ['documents:search'],
        collections,
        value: search,
      }),
    });
    if (!created.ok) throw new Error('Key creation failed');
  }
  for (const collection of ['projects', 'designers']) {
    const query = await request(
      `/collections/tickif_production_${collection}/documents/search?q=*&per_page=1`,
      search,
    );
    if (!query.ok) throw new Error('Search-key verification failed');
  }
  const forbidden = await request('/keys', search);
  if (![401, 403].includes(forbidden.status)) throw new Error('Search key permits administration');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await registerSearchKey(
      readFileSync('/run/secrets/typesense_admin_key', 'utf8').trim(),
      readFileSync('/run/secrets/typesense_search_key', 'utf8').trim(),
    );
    console.log('PASS: production search-only key registered and verified');
  } catch {
    console.error('Search-key setup failed; provider response withheld to protect credentials');
    process.exitCode = 1;
  }
}
