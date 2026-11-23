mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  ami_id           = "ami-0123456789abcdef0"
  postgres_version = "16.15"
  redis_auth_token = "testonly01234567890123456789012345"
}

run "production_boundaries" {
  command = plan

  assert {
    condition     = aws_instance.app.instance_type == "t3a.large" && one(aws_instance.app.root_block_device).volume_size == 50
    error_message = "The approved Typesense host needs 8 GiB RAM and 50 GiB disk."
  }

  assert {
    condition     = !aws_db_instance.production.publicly_accessible && !aws_db_instance.production.multi_az && aws_db_instance.production.storage_encrypted && aws_db_instance.production.deletion_protection && aws_db_instance.production.backup_retention_period >= 7
    error_message = "Database privacy, recovery and approved Single-AZ constraints must hold."
  }

  assert {
    condition     = aws_elasticache_replication_group.production.transit_encryption_enabled && aws_elasticache_replication_group.production.at_rest_encryption_enabled && aws_elasticache_replication_group.production.num_cache_clusters == 1
    error_message = "Redis must use encryption and the approved one-node configuration."
  }

  assert {
    condition     = one(aws_elasticache_parameter_group.production.parameter).value == "noeviction"
    error_message = "BullMQ jobs must not be evicted under memory pressure."
  }

  assert {
    condition     = length(aws_route_table.private.route) == 0
    error_message = "Data subnets must have no configured Internet route."
  }
}
