# Project engagement

Projects have public view totals and private per-user saves. Images share their
parent project's engagement; there is no independent image engagement model.
[ADR 0007](../adr/0007-project-views-replace-likes.md) records the removal of likes.

`POST /api/interactions/views` requires authentication. A public project visit
inserts an `interaction_event` unless the actor belongs to the project's
organization. Event keys deduplicate transport replay and the existing partial
unique index permits one actor/project event per UTC day. The image page and
canonical project page use the shared `ProjectViewTracker`. A hidden page waits
until visible; server rendering and metadata fetches never record visits.

The `interaction_event_project_view_total` database trigger increments
`project_engagement.view_count` only after an inserted project event. Insert and
increment commit or roll back together. Lifetime totals survive raw-event
retention. Designer analytics still use the dated events, including their
existing Asia/Kolkata report grouping and branch scope.

`GET /api/interactions/projects?projectIds=...` returns up to 48 visible projects
with `projectId`, `viewCount` and `saveCount`. Public eligibility requires a
published project and active designer profile. Frozen branch membership is not
a public-visibility filter. Counts return `Cache-Control: no-store` and disclose
no viewer/saver identity. Saves are counted from current `saved_project` rows;
removal decreases saves but never views.

`ProjectViewCount` renders a passive eye and formatted count in project actions,
image details and portfolio/recommendation cards. Loading uses an ellipsis;
failure or unavailable projects use an em dash with an accessible explanation.
It batches reads and guards stale responses after navigation or count refresh.
The former Like button and sign-in-to-like prompt no longer exist. Save and
Share retain their existing behavior.

See the [implementation checklist](../guides/project-engagement-checklist.md)
and [migration guide](../guides/database-and-migrations.md) for release status.
