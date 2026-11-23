# Terraform owns metadata only. Operators populate JSON through Secrets Manager.
resource "aws_secretsmanager_secret" "runtime" {
  for_each                = toset(["app", "database", "backups"])
  name                    = "tickif/production/${each.key}"
  recovery_window_in_days = 30
  lifecycle {
    prevent_destroy = true
  }
}

# Supply the same token as app.REDIS_PASSWORD through a secure local environment.
# Ephemeral input plus write-only output keeps it out of plans and state.
variable "redis_auth_token" {
  type      = string
  sensitive = true
  ephemeral = true
  validation {
    condition     = can(regex("^[A-Za-z0-9]{32,128}$", var.redis_auth_token))
    error_message = "Use a randomly generated 32-128 character alphanumeric token."
  }
}
