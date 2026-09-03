# Tickif Media R2 Infrastructure

Cloudflare R2 (S3-compatible) bucket configuration for media uploads, processing, and delivery.

## Resources

- **Bucket**: `tickif-media` — stores originals (private) and derived images (public)
- **Public Access Block**: Originals at `originals/*` are private; derivatives at `images/*` are public
- **CORS**: Enables browser-based direct uploads and HEAD checks for presigned URLs
- **Lifecycle**: No prefix-wide expiry; application jobs delete only unreferenced objects

## Setup

### Option A: Terraform (Recommended)

```bash
cd infra/r2
terraform init
terraform plan -var="r2_bucket_name=tickif-media" \
  -var="cors_allowed_origin=https://tickif.co"
terraform apply
```

Exports account ID and bucket details to `.terraform.tfvars` for your environment.

### Option B: AWS CLI / wrangler

1. Create bucket and apply CORS:

```bash
aws s3api create-bucket --bucket tickif-media \
  --region auto --create-bucket-configuration LocationConstraint=auto
aws s3api put-bucket-cors --bucket tickif-media \
  --cors-configuration file://cors.json
```

2. Apply the lifecycle configuration (currently empty by design):

```bash
aws s3api put-bucket-lifecycle-configuration --bucket tickif-media \
  --lifecycle-configuration file://lifecycle.json
```

3. Block public access to originals (optional, if ACLs are used):

```bash
aws s3api put-public-access-block --bucket tickif-media \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

## Object cleanup

Committed project originals and profile logos remain under `originals/`, so a
prefix-wide age rule would delete live and retained media. `lifecycle.json` is
therefore empty. The application deletes known failed uploads immediately and
the organization-retention worker deletes persisted manifest entries during an
explicit purge. Any future abandoned-upload sweep must first prove from the
database that an object is unreferenced.

## CORS Policy

The `cors.json` allows:
- **HEAD** from web origins (browser presigned-URL validation)
- **PUT** from web origins (browser direct-to-R2 uploads via presigned URLs)
- **GET** from any origin (public derivatives; originals remain private)

Update `ALLOWED_ORIGIN` environment variable to match your domain.

## Credentials

R2 API tokens (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) should be managed via:
- GitHub Secrets (for CI/CD)
- Environment variables (for local development)
- IAM policies (for application containers)

See `.env.example` for required variables.
