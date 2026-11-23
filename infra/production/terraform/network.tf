resource "aws_vpc" "production" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.name }
}

resource "aws_internet_gateway" "production" {
  vpc_id = aws_vpc.production.id
}

resource "aws_subnet" "app" {
  vpc_id            = aws_vpc.production.id
  cidr_block        = "10.42.1.0/24"
  availability_zone = "ap-south-1a"
  tags              = { Name = "${local.name}-app" }
}

resource "aws_subnet" "data" {
  for_each          = { "ap-south-1a" = "10.42.10.0/24", "ap-south-1b" = "10.42.11.0/24" }
  vpc_id            = aws_vpc.production.id
  cidr_block        = each.value
  availability_zone = each.key
  tags              = { Name = "${local.name}-data-${each.key}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.production.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.production.id
  }
}

resource "aws_route_table_association" "app" {
  subnet_id      = aws_subnet.app.id
  route_table_id = aws_route_table.public.id
}

# Explicitly isolated: no Internet route, NAT gateway or paid VPC endpoints.
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.production.id
  route  = []
}

resource "aws_route_table_association" "data" {
  for_each       = aws_subnet.data
  subnet_id      = each.value.id
  route_table_id = aws_route_table.private.id
}

resource "aws_security_group" "app" {
  name_prefix = "${local.name}-app-"
  description = "Application host; ingress added only for verified production origin setup"
  vpc_id      = aws_vpc.production.id
}

# Egress supports OS updates, GHCR, R2, email, payments and SSM. No inbound SSH.
resource "aws_vpc_security_group_egress_rule" "app" {
  security_group_id = aws_security_group.app.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "postgres" {
  name_prefix = "${local.name}-postgres-"
  description = "PostgreSQL from the application host only"
  vpc_id      = aws_vpc.production.id
}

resource "aws_vpc_security_group_ingress_rule" "postgres" {
  security_group_id            = aws_security_group.postgres.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_security_group" "redis" {
  name_prefix = "${local.name}-redis-"
  description = "Redis TLS from the application host only"
  vpc_id      = aws_vpc.production.id
}

resource "aws_vpc_security_group_ingress_rule" "redis" {
  security_group_id            = aws_security_group.redis.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
}
