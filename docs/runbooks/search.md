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

## Discovery configuration and fallback diagnosis

Discovery enables Typesense when `TYPESENSE_HOST` and `TYPESENSE_SEARCH_API_KEY`
are explicitly supplied. The search key may come from its environment variable,
`TYPESENSE_SEARCH_API_KEY_FILE`, or `CONFIG_SECRETS_FILE`. `@repo/config` resolves
and validates these once at startup, then computes `TYPESENSE_SEARCH_CONFIGURED`
before applying local defaults. This flag is derived, not an environment switch.
Restart the API after changing mounted credentials.

Without explicit search configuration, local development deliberately returns
the Postgres feed with `source: "db"` and logs `discovery.fallback` with reason
`unconfigured`. In staging, `infra/staging/stack.yml` supplies the host and mounted
search key, so a healthy query should return `source: "search"`. A search failure
can still return a successful Postgres response; inspect the fallback log reason
alongside the response's `source` field. An HTTP 200 alone does not verify search.

The E-294 staging report showed false `unconfigured` events because discovery
read raw process environment variables after mounted secrets had been resolved
only into typed configuration. The fix uses that resolved configuration. The
reported fallback requests took 4 to 51 ms on the server, so those samples did not
demonstrate a slow feed. Compare server request duration and fallback frequency
after deployment under representative traffic; client timing also includes
network and connection setup and should not be treated as database latency.

## Availability follow-ups

E-207 owns the production fallback behavior. Before production traffic it must
add:

- bounded background bootstrap retries with backoff;
- a degraded search state on health diagnostics without failing liveness;
- a fallback-activation counter that distinguishes unavailable from slow search.

## Rating and paid discovery ranking

Text searches order by Typesense text relevance, then designer average rating,
then unexpired paid subscription coverage. For equally relevant matches, a free
5-star designer precedes a paid 4-star designer; a paid 5-star designer precedes
a free 5-star designer. The explicit designer rating sort puts rating first,
then paid coverage, then relevance. Empty home feeds keep their existing recent
or featured order, and other explicit sort selections remain available.

Both collections now project `paidUntil`. Paid means a non-Hobby subscription
that is neither locked nor downgraded, with a future `currentPeriodEnd`.
Scheduled cancellation keeps priority until that boundary. The query evaluates
expiry against the current time, so delayed lifecycle jobs cannot extend it.
Subscription changes enqueue a designer projection, which refreshes its projects.
KYC remains a filter and badge, but no longer determines default result order.

Designer `portfolioTerms` contains published project titles, descriptions and
room names/types. Draft and archived projects do not contribute. Publish and
unpublish transitions refresh the designer projection. Suggestions continue to
search profile fields only.

The known query `bad` gets one retry as `bed` when it has zero literal matches,
with token dropping disabled. Existing matches, filters and pagination are
preserved. Other short queries keep ordinary Typesense rules. This narrow map
avoids treating unrelated three-letter words as arbitrary one-edit typos.

Deploy the worker and API, then apply schema updates and rebuild both collections
using the commands above. A missing new schema field falls back to the previous
query until bootstrap completes. Existing documents gain paid and portfolio
signals only after reindexing. No Postgres migration is required. The Postgres
home-feed fallback orders matching rows by rating and paid coverage, but still
uses its existing substring matching without Typesense typo/portfolio semantics.

Verify `bedroom`, `bed`, `bad`, `bedrom`, `bed room`, `kitchen` and an unmatched
term on `/api/discovery/feed`, `/api/search` and `/api/search/designers`. Check
`source: "search"` on discovery, a second page, and both rated paid/free fixtures.
Typesense permits three explicit sort keys; equal relevance, rating and paid
status use its final insertion-order tie-break, which can change after a rebuild.

The staging audit on 2026-09-08 found 11 bedroom projects but only two matching
designer profiles, and four kitchen projects but no matching profiles. `bad`
returned zero results. All sampled ratings were zero, so staging alone could not
prove the paid/rating ordering. The regression suite uses real Typesense and
Postgres fixtures with unequal ratings and paid coverage to verify that order.
