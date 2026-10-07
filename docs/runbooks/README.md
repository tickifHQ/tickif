# Operational runbooks

Use the applicable runbook for provisioning, deployment, diagnosis or recovery.
Read [architecture](../architecture/README.md), relevant [ADRs](../adr/README.md)
and the [security guidelines](../coding-guidelines/security.md) before operating
on an environment. Keep credentials in the secret store.

| Runbook                                             | Purpose                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Admin access](./admin-access.md)                   | Bootstrap and recover privileged access                                        |
| [Staging deployment](./staging-deployment.md)       | Docker Swarm, Traefik, release, backup and restore                             |
| [Search](./search.md)                               | Typesense credentials, collection bootstrap, reindexing and fallback diagnosis |
| [Media pipeline](./media-pipeline.md)               | Retry failures, regenerate derivatives and verify image quality                |
| [Worker fonts](./worker-fonts.md)                   | Font configuration and validation in deployed workers                          |
| [Observability](./observability.md)                 | Collectors, SigNoz secrets, deployment, alerts and rollback                    |
| [Billing staging smoke](./billing-staging-smoke.md) | Provider validation checklist and recorded Test Mode evidence                  |

Deployment and provisioning files remain under `infra/`, with focused READMEs:
[R2](../../infra/r2/README.md),
[local observability](../../infra/local/observability/README.md),
[staging observability](../../infra/staging/observability/README.md) and
[SigNoz definitions](../../infra/observability/signoz/README.md).

Record the environment, deployed commit and date for validation evidence.
Historical evidence is not certification of a later deployment. Keep referenced
images colocated under `assets/`; generated reports, videos and traces belong in
ignored output directories and CI artifacts.
