# Search Operations

Postgres is the source of truth. Typesense is a disposable projection, so an
unavailable search node must degrade search rather than stop the API.

## Production credentials

The API uses two Typesense credentials:

- `TYPESENSE_API_KEY`: admin key used only for schema bootstrap.
- `TYPESENSE_SEARCH_API_KEY`: search-only key used by public query traffic.

Create the search-only key with the admin key. Replace `tickif` when
`TYPESENSE_COLLECTION_PREFIX` differs:

```bash
curl --fail-with-body \
  -X POST "$TYPESENSE_HOST/keys" \
  -H "X-TYPESENSE-API-KEY: $TYPESENSE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Tickif public search",
    "actions": ["documents:search"],
    "collections": ["tickif_.*"]
  }'
```

Store the returned `value` as `TYPESENSE_SEARCH_API_KEY`. Typesense only returns
the full value when the key is created. The production admin and search keys
must be different.

After deploying, verify the search key can query but cannot write:

```bash
curl --fail-with-body \
  "$TYPESENSE_HOST/collections/tickif_projects/documents/search?q=*&query_by=title" \
  -H "X-TYPESENSE-API-KEY: $TYPESENSE_SEARCH_API_KEY"

curl -o /dev/null -sS -w '%{http_code}\n' \
  -X POST "$TYPESENSE_HOST/collections/tickif_projects/documents" \
  -H "X-TYPESENSE-API-KEY: $TYPESENSE_SEARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"scope-probe","title":"must-not-write"}'
```

The second command must return `401`.

## Bootstrap and drift

Bootstrap creates versioned physical collections behind stable aliases:

```bash
pnpm --filter @repo/search bootstrap
pnpm --filter @repo/search bootstrap -- --check
```

Mutable field and synonym-set drift can be repaired explicitly:

```bash
pnpm --filter @repo/search bootstrap -- --apply-updates
```

Changes to immutable collection settings require a new versioned collection,
reindexing, and an alias swap. Bootstrap reports this as a rebuild requirement
instead of sending an unsupported collection update.

## Availability follow-ups

E-207 owns the production fallback behavior. Before production traffic it must
add:

- bounded background bootstrap retries with backoff;
- a degraded search state on health diagnostics without failing liveness;
- a fallback-activation counter that distinguishes unavailable from slow search.

