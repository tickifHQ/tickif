output "instance_id" {
  value = aws_instance.app.id
}

output "elastic_ip" {
  value = aws_eip.app.public_ip
}

output "postgres_endpoint" {
  value = aws_db_instance.production.address
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.production.primary_endpoint_address
}

output "runtime_secret_arns" {
  value = { for name, secret in aws_secretsmanager_secret.runtime : name => secret.arn }
}

output "rds_admin_secret_arn" {
  description = "Bootstrap operator only. The application instance role cannot read this secret."
  value       = aws_db_instance.production.master_user_secret[0].secret_arn
}
