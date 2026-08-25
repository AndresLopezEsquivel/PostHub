# Terraform + AWS provider setup for PostHub's infrastructure.
#
# `required_version` / `required_providers` pin the tooling so a fresh clone
# resolves the same Terraform + AWS provider we developed against — reproducibility
# is the whole point of this directory.
#
# The provider block intentionally sets NO credentials and NO profile. Terraform's
# AWS provider resolves auth the same way the AWS CLI does (env vars → shared
# ~/.aws config/credentials). We drive it with the AWS_PROFILE env var (the `tf`
# container alias passes it through and mounts ~/.aws), so nothing account-specific
# or secret is ever written into these committed files.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
