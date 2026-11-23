terraform {
  required_version = ">= 1.14.0, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  backend "s3" {}
}

provider "aws" {
  region              = "ap-south-1"
  allowed_account_ids = ["401909805160"]
  default_tags {
    tags = {
      Project     = "tickif"
      Environment = "production"
      ManagedBy   = "terraform"
    }
  }
}

variable "ami_id" {
  description = "Reviewed Amazon Linux 2023 x86_64 AMI in Mumbai; pin to avoid implicit host replacement."
  type        = string
  validation {
    condition     = can(regex("^ami-[0-9a-f]+$", var.ami_id))
    error_message = "Supply a reviewed Mumbai AMI ID."
  }
}

variable "postgres_version" {
  description = "Exact supported PostgreSQL 16 minor version verified in Mumbai before planning."
  type        = string
  validation {
    condition     = can(regex("^16\\.[0-9]+$", var.postgres_version))
    error_message = "Use a supported PostgreSQL 16 minor version."
  }
}

variable "redis_auth_version" {
  description = "Increment only after a coordinated Redis token rotation in the app secret."
  type        = number
  default     = 1
}

locals {
  name = "tickif-production"
}
