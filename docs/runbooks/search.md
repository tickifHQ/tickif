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

### New fields need a backfill, not just a bootstrap

`--apply-updates` adds a new **field** to the collection schema; it does not
populate that field on documents already indexed. Until the owning documents are
rewritten, a newly added field reads as absent, and a field whose _meaning_
changed still holds the old value. Bootstrap cannot detect either case — the
schema looks correct.

So any release that adds or redefines a projected field is a two-step deploy:

```bash
pnpm --filter @repo/search bootstrap -- --apply-updates   # schema
pnpm --filter @repo/worker search:reindex                 # documents
```

Until the rebuild finishes, readers must tolerate the old projection. The public
discovery card is the current example: `coverImageId`, `coverImageWidth` and
`coverImageHeight` are new, and `coverImageKey` moved from the `thumb` derivative
to `small`. Stale documents therefore yield a card with a smaller cover and null
dimensions — degraded but not broken, which is the bar a projected field should
clear before it ships.

## Projection pipeline

Search writes are asynchronous. PostgreSQL remains the source of truth:

1. Project, profile, portfolio, logo, and terminal media-failure transactions
   append a row to `search_projection_outbox`.
2. The worker dispatcher publishes undispatched rows to the `search-index`
   BullMQ queue using the outbox sequence as the job identity.
3. The indexer reloads the current PostgreSQL state before every write. A stale
   index or delete job therefore converges to the latest state instead of
   resurrecting or removing a document incorrectly. Same-entity jobs are
   serialized across worker replicas, and the row is marked dispatched only
   after Typesense accepts the projection.

Jobs use deterministic IDs and exponential retries. If Redis is unavailable,
the outbox row remains undispatched and a later dispatcher sweep retries it.
Typesense downtime fails the BullMQ job without affecting the API write that
created the outbox row. Exhausted jobs remain in BullMQ for seven days and their
outbox rows remain undispatched; retry the failed job after recovery or run a
full rebuild.

The worker readiness endpoint includes Typesense:

- `/livez` confirms that the process is alive.
- `/readyz` returns `503` while draining or when Typesense is unavailable.

## Full rebuild

Request a rebuild through the same queue used by incremental indexing:

```bash
pnpm --filter @repo/worker search:reindex
```

Only one rebuild can be queued or active at a time. The worker:

1. captures an outbox sequence watermark behind the shared projection lock;
2. creates timestamped candidate project and designer collections;
3. bulk-imports a PostgreSQL snapshot into the candidates;
4. captures a committed replay watermark and applies that backlog without
   blocking domain writes;
5. reacquires the projection lock only for the small final delta and both alias
   swaps.

The final lock prevents a domain transaction from committing between replay and
alias swap. If the designer alias swap fails after the project alias moved, the
worker restores the project alias. Failed candidate collections are deleted.
Previous live physical collections are retained for operator rollback.

To inspect queue and projection progress:

```sql
SELECT count(*) AS undispatched
FROM search_projection_outbox
WHERE dispatched_at IS NULL;

SELECT sequence, entity_kind, entity_id, operation, created_at
FROM search_projection_outbox
ORDER BY sequence DESC
LIMIT 20;
```

Verify the aliases and document counts after a rebuild:

```bash
curl --fail-with-body \
  "$TYPESENSE_HOST/aliases/tickif_projects" \
  -H "X-TYPESENSE-API-KEY: $TYPESENSE_API_KEY"

curl --fail-with-body \
  "$TYPESENSE_HOST/aliases/tickif_designers" \
  -H "X-TYPESENSE-API-KEY: $TYPESENSE_API_KEY"

curl --fail-with-body \
  "$TYPESENSE_HOST/collections/tickif_projects/documents/search?q=*&query_by=title&per_page=0" \
  -H "X-TYPESENSE-API-KEY: $TYPESENSE_SEARCH_API_KEY"
```

## Availability follow-ups

E-207 owns the production fallback behavior. Before production traffic it must
add:

- bounded background bootstrap retries with backoff;
- a degraded search state on health diagnostics without failing liveness;
- a fallback-activation counter that distinguishes unavailable from slow search.
