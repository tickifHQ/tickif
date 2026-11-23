# AWS production infrastructure

This Terraform root defines the AWS resources in [ADR 0022](../../../docs/adr/0022-production-hosting-and-release-branches.md).
Inspect the authenticated remote state for current provisioning status. It does not install Docker, deploy the application,
open web ingress, configure Cloudflare/R2, or change DNS. Those are release and
cutover steps after infrastructure validation.

## Scope and cost controls

- Account `401909805160`, Mumbai, dedicated VPC; one public application subnet
  and two isolated data subnets. No NAT gateway, load balancer or VPC endpoints.
- EC2 `t3a.large`, encrypted 50 GiB gp3, Elastic IP, IMDSv2, no inbound SSH.
  CPU credits use **standard** mode to avoid surplus-credit charges; sustained
  load can throttle and must be tested. SSM provides operator access.
  EC2 ignores drift in the launch-time `associate_public_ip_address` field because
  AWS reports it as true after the separately managed Elastic IP is attached.
  The Elastic IP association remains explicitly managed; replacement protection
  stays enabled.
- RDS PostgreSQL 16 `db.t4g.micro`, encrypted 20 GiB gp3, Single-AZ,
  seven-day backups, TLS required, deletion protection. No storage autoscaling.
- Redis OSS 7.1 `cache.t4g.micro`, one node, TLS/AUTH, noeviction,
  seven-day snapshots. It has no automatic failover.
- Three runtime JSON secret containers plus the separate RDS-managed admin
  secret. Budget for **four billable secrets**, not three, with this configuration.
- The EC2 role reads only the runtime secret containers, not the RDS admin secret.
  Every container must receive only the fields it requires during deployment.
- Persistent resources have `prevent_destroy`. Do not remove this guard or use
  replacement flags during ordinary deployment. The retained root volume costs
  money until an operator deliberately disposes of it after recovery review.

## Local validation (does not need AWS credentials)

Use Terraform >=1.14 and commit `.terraform.lock.hcl`. Never commit state, saved
plans, populated backend settings, credentials or `.tfvars`.

```sh
terraform init -backend=false
terraform fmt -check
terraform validate
terraform test
```

## Remote state and authenticated planning

Use an MFA-authenticated AWS CLI session for the named account. Do not copy browser
session cookies or persistent access keys into this repository. Create the S3
state bucket named in `backend.hcl.example` once through the authorized AWS
operator, with public access blocked, SSE-S3 encryption, versioning enabled and
a bucket policy denying non-TLS access. Scope the operator's bucket permissions
to the production state key and its `.tflock` object. S3 lockfiles avoid a paid
Terraform service or separate DynamoDB lock table. S3 storage/requests remain
billable; Terraform CLI adds no hosted-service subscription.

```sh
cp backend.hcl.example backend.hcl
terraform init -reconfigure -backend-config=backend.hcl
aws sts get-caller-identity
```

Before assigning `ami_id`, resolve and review the Amazon Linux 2023 x86_64 image:

```sh
aws ssm get-parameter --region ap-south-1 \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query Parameter.Value --output text
aws rds describe-orderable-db-instance-options --region ap-south-1 \
  --engine postgres --db-instance-class db.t4g.micro \
  --query 'OrderableDBInstanceOptions[].EngineVersion' --output text
```

Set the verified AMI and a supported PostgreSQL 16 minor version in an ignored
`terraform.tfvars`. Pin the AMI so an unrelated plan cannot replace the host.

## Initial secret bootstrap

For the reviewed initial deployment, [provision-reviewed.py](../provision-reviewed.py)
can run in MFA-authenticated AWS CloudShell with boto3 and a checksum-verified
Terraform binary. It verifies the AWS account, creates or checks the protected
S3 state bucket, initializes the S3 backend, creates the three secret containers,
and generates the initial Redis credential directly into Secrets Manager.
It then plans and applies only creation/no-op actions. Updates, deletions and
replacements require a separately reviewed normal Terraform procedure. It does
not populate application integrations, database application credentials or R2 keys.

```sh
python3 provision-reviewed.py --directory /path/to/reviewed/config \
  --terraform /path/to/verified/terraform --apply-reviewed
```

The following is the alternative manual operator procedure.

Terraform manages secret metadata, not JSON values. On the first deployment only,
plan/apply the three empty secret containers using the targeted bootstrap below.
Review this plan before applying; targeting is an exceptional bootstrap step,
not the normal update procedure.

Provide `TF_VAR_redis_auth_token` through a secure local secret-injection process
for both plan and apply. Do not put it in `.tfvars`, a command argument, shell
history, or a plan artifact. Keep the same value throughout initial provisioning.

```sh
terraform plan -target=aws_secretsmanager_secret.runtime -out=secrets.tfplan
terraform apply secrets.tfplan
```

Populate the app JSON in Secrets Manager with a strong, randomly generated
`REDIS_PASSWORD` of 32 or more alphanumeric characters, plus the production app
fields when available. Never paste secrets into chat or a shell command line.
Populate database and backup JSON through the same secure operator process.
The database JSON must eventually contain the least-privileged application
connection, **not** the RDS administrator password.

Supply exactly the same token as the app JSON's `REDIS_PASSWORD`. Terraform accepts
it as an **ephemeral**, sensitive input and passes Redis AUTH through
`auth_token_wo`. The value is not persisted in the plan or state. Do not replace
this with an ordinary secret-value
data source, `auth_token`, or `secret_string`. A coordinated token rotation must
update Secrets Manager, increment `redis_auth_version`, apply, and restart
clients; `SET` invalidates the previous token, so plan a maintenance window.

```sh
terraform plan -out=production.tfplan
terraform apply production.tfplan
```

Inspect the actual plan for replacements, resource sizes, account and region.
Applying creates IAM permissions and network access: obtain action-time approval
when performing this through browser automation. Initial provisioning is not
proof of a working production deployment.

## Before going live

Bootstrap the restricted application database role using the RDS-managed admin
secret from an authorized operator session; the EC2 runtime role cannot read it.
Install and verify the host runtime using SSM. Configure proper RDS CA verification
and Redis `rediss://`, and keep Typesense on the private container network.
Finish the production migration/deploy entry point and test restore, health,
uploads, jobs, auth and payments before traffic.

Web ingress intentionally starts closed. Add HTTPS access from current Cloudflare
origin ranges only after TLS and origin authentication are configured; do not
open database, cache, Typesense, Docker or Traefik administration ports publicly.
Add resource/billing alarms, configure production R2 and SigNoz, and validate the
50 GiB disk budget with retained releases before DNS cutover.

References: [AWS provider write-only Redis AUTH](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/elasticache_replication_group),
[ephemeral variables](https://developer.hashicorp.com/terraform/language/manage-sensitive-data),
[S3 backend locking](https://developer.hashicorp.com/terraform/language/backend/s3).
