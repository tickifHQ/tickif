# Architecture

Read [the overview](./overview.md) before changing the system. It explains the
monorepo, API dependency direction, worker boundary and deployment model. Then
read the documents and [ADRs](../adr/README.md) relevant to the domain.

| Document                                       | Read when working on…                                            |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| [Overview](./overview.md)                      | System boundaries, packages, HTTP flow and deployment            |
| [Authentication and authorization](./auth.md)  | Sessions, OTP, login and RBAC                                    |
| [Branch data model](./branches.md)             | Corporate branches, active context and freeze/restore            |
| [Database](./database.md)                      | Schema organization, casing, connections and unified migrations  |
| [Media pipeline](./media-pipeline.md)          | Uploads, derivatives, public quality and embedded identifiers    |
| [Email workflows](./email-workflows.md)        | Transactional delivery, branding and preview boundaries          |
| [Moderation reasons](./moderation-reasons.md)  | Submission and moderation data                                   |
| [Project versions](./project-versions.md)      | Pending changes to published projects                            |
| [Public sharing metadata](./social-sharing.md) | Canonical URLs, social cards and visibility                      |
| [Observability](./observability.md)            | Structured logs, telemetry, privacy and deferred coverage        |
| [UI refresh](./ui-refresh/README.md)           | Figma provenance, tokens, artwork and shared component decisions |

See [Public landing page](./landing-page.md) for homepage design, API sources and content boundaries.

Use [coding guidelines](../coding-guidelines/README.md) for enforced conventions,
[guides](../guides/README.md) for development procedures and
[runbooks](../runbooks/README.md) for operator commands. Package API details stay in
their local READMEs, including [UI](../../packages/ui/README.md),
[logger](../../packages/logger/README.md) and
[telemetry](../../packages/telemetry/README.md).
