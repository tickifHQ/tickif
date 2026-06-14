terraform {
  required_version = ">= 1.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# R2 bucket for media uploads, processing, and derivatives.
resource "cloudflare_r2_bucket" "media" {
  account_id = var.cloudflare_account_id
  bucket_name = var.r2_bucket_name
  location   = var.r2_location
}

# CORS policy: allow browser direct uploads and presigned-URL validation.
resource "cloudflare_r2_bucket_cors_configuration" "media" {
  account_id = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.media.bucket_name

  cors_rule {
    allowed_methods = ["GET", "HEAD", "PUT"]
    allowed_origins = var.cors_allowed_origins
    allowed_headers = ["*"]
    max_age_seconds = 3600
    expose_headers  = ["ETag", "x-amz-version-id"]
  }
}

# Lifecycle rule: expire orphaned originals (stalled uploads, crash-deleted objects).
# Covers objects in originals/* prefix that were never promoted to permanent location.
resource "cloudflare_r2_bucket_lifecycle_configuration" "media" {
  account_id = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.media.bucket_name

  rule {
    id     = "expire-orphaned-originals"
    status = "Enabled"

    filter {
      prefix = "originals/"
    }

    expiration {
      days = var.lifecycle_expiry_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.lifecycle_expiry_days
    }
  }
}

# Outputs for environment setup.
output "r2_bucket_name" {
  value       = cloudflare_r2_bucket.media.bucket_name
  description = "R2 bucket name (use as R2_BUCKET)"
}

output "r2_account_id" {
  value       = var.cloudflare_account_id
  description = "Cloudflare account ID (use as R2_ACCOUNT_ID)"
}

output "r2_endpoint" {
  value       = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
  description = "R2 endpoint (use as R2_ENDPOINT for production)"
}
