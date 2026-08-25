# Temporary connectivity check — proves Terraform can authenticate to AWS.
#
# `aws_caller_identity` is a DATA source (read-only): it creates nothing, it just
# asks AWS "who am I?" using whatever credentials the provider resolved (your
# `aws login` session on the default profile). If `terraform apply` prints your
# account id and the terraform user's ARN, the auth chain works end to end.
#
# Delete this file once the real resources land — it's scaffolding, not infra.

data "aws_caller_identity" "current" {}

output "account_id" {
  description = "The AWS account Terraform is authenticated against."
  value       = data.aws_caller_identity.current.account_id
}

output "caller_arn" {
  description = "The IAM principal (should be the terraform user) Terraform is acting as."
  value       = data.aws_caller_identity.current.arn
}
