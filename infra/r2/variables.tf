variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  description = "Cloudflare API token with R2 permissions"
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID"
}

variable "r2_bucket_name" {
  type        = string
  default     = "tickif-media"
  description = "R2 bucket name"
}

variable "r2_location" {
  type        = string
  default     = "nam"
  description = "R2 bucket location (nam, eur, apac, or empty for auto)"
}

variable "cors_allowed_origins" {
  type        = list(string)
  default     = ["https://tickif.co", "https://www.tickif.co", "http://localhost:3000"]
  description = "Allowed origins for CORS (browser direct uploads)"
}

variable "lifecycle_expiry_days" {
  type        = number
  default     = 7
  description = "Days before orphaned originals are auto-expired"
}
