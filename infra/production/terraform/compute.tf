data "aws_iam_policy_document" "instance_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name_prefix        = "${local.name}-"
  assume_role_policy = data.aws_iam_policy_document.instance_assume.json
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "runtime" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [for secret in aws_secretsmanager_secret.runtime : secret.arn]
  }
}

resource "aws_iam_role_policy" "runtime" {
  name   = "read-production-runtime-secrets"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.runtime.json
}

resource "aws_iam_instance_profile" "app" {
  name_prefix = "${local.name}-"
  role        = aws_iam_role.app.name
}

resource "aws_instance" "app" {
  ami                         = var.ami_id
  instance_type               = "t3a.large"
  subnet_id                   = aws_subnet.app.id
  vpc_security_group_ids      = [aws_security_group.app.id]
  iam_instance_profile        = aws_iam_instance_profile.app.name
  associate_public_ip_address = false
  disable_api_termination     = true
  monitoring                  = false
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "disabled"
  }
  credit_specification {
    cpu_credits = "standard"
  }
  root_block_device {
    volume_type           = "gp3"
    volume_size           = 50
    encrypted             = true
    delete_on_termination = false
  }
  tags = { Name = local.name }
  lifecycle {
    prevent_destroy = true
    # AWS reports true once the separately managed Elastic IP is attached.
    # Preserve the launch-time false value without replacing a healthy host.
    ignore_changes = [associate_public_ip_address]
  }
}

resource "aws_eip" "app" {
  domain = "vpc"
  tags   = { Name = local.name }
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_eip_association" "app" {
  instance_id   = aws_instance.app.id
  allocation_id = aws_eip.app.id
  depends_on    = [aws_route_table_association.app, aws_internet_gateway.production]
}
