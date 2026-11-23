resource "aws_db_subnet_group" "production" {
  name       = local.name
  subnet_ids = [for subnet in aws_subnet.data : subnet.id]
}

resource "aws_db_parameter_group" "production" {
  name_prefix = "${local.name}-"
  family      = "postgres16"
  parameter {
    apply_method = "pending-reboot"
    name         = "rds.force_ssl"
    value        = "1"
  }
}

resource "aws_db_instance" "production" {
  identifier                   = local.name
  engine                       = "postgres"
  engine_version               = var.postgres_version
  engine_lifecycle_support     = "open-source-rds-extended-support-disabled"
  instance_class               = "db.t4g.micro"
  allocated_storage            = 20
  storage_type                 = "gp3"
  storage_encrypted            = true
  db_name                      = "tickif"
  username                     = "tickif_admin"
  manage_master_user_password  = true
  db_subnet_group_name         = aws_db_subnet_group.production.name
  parameter_group_name         = aws_db_parameter_group.production.name
  vpc_security_group_ids       = [aws_security_group.postgres.id]
  availability_zone            = "ap-south-1a"
  multi_az                     = false
  publicly_accessible          = false
  backup_retention_period      = 7
  backup_window                = "19:00-20:00"
  maintenance_window           = "sun:20:30-sun:21:30"
  auto_minor_version_upgrade   = true
  allow_major_version_upgrade  = false
  deletion_protection          = true
  skip_final_snapshot          = false
  final_snapshot_identifier    = "${local.name}-final"
  copy_tags_to_snapshot        = true
  performance_insights_enabled = false
  monitoring_interval          = 0
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_elasticache_subnet_group" "production" {
  name       = local.name
  subnet_ids = [for subnet in aws_subnet.data : subnet.id]
}

resource "aws_elasticache_parameter_group" "production" {
  name   = local.name
  family = "redis7"
  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
}

resource "aws_elasticache_replication_group" "production" {
  replication_group_id        = local.name
  description                 = "Tickif production BullMQ and cache"
  engine                      = "redis"
  engine_version              = "7.1"
  node_type                   = "cache.t4g.micro"
  num_cache_clusters          = 1
  automatic_failover_enabled  = false
  multi_az_enabled            = false
  port                        = 6379
  subnet_group_name           = aws_elasticache_subnet_group.production.name
  security_group_ids          = [aws_security_group.redis.id]
  parameter_group_name        = aws_elasticache_parameter_group.production.name
  preferred_cache_cluster_azs = ["ap-south-1a"]
  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  transit_encryption_mode     = "required"
  auth_token_wo               = var.redis_auth_token
  auth_token_wo_version       = var.redis_auth_version
  auth_token_update_strategy  = "SET"
  snapshot_retention_limit    = 7
  snapshot_window             = "18:00-19:00"
  maintenance_window          = "sun:21:30-sun:22:30"
  auto_minor_version_upgrade  = true
  lifecycle {
    prevent_destroy = true
  }
}
