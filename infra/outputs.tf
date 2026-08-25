# Outputs — the values you need to configure the deployed app.
#
# Print them any time with `terraform output`, or one with
# `terraform output -raw cloudfront_domain`.

output "uploads_bucket" {
  description = "S3 bucket holding uploads. Set as S3_BUCKET in the backend env."
  value       = aws_s3_bucket.uploads.id
}

output "app_public_ip" {
  description = "Public IP of the app server. The frontend origin is https://<this value>."
  value       = aws_instance.app.public_ip
}

output "app_ssh" {
  description = "Ready-made SSH command for the app server."
  value       = "ssh ubuntu@${aws_instance.app.public_ip}"
}

output "db_endpoint" {
  description = <<-EOT
    Host:port of the database. Build the backend's DATABASE_URL from it:
    postgres://<user>:<password>@<this value>/<db_name>?sslmode=require
    The password is left out on purpose so this output stays safe to print.
  EOT
  value       = aws_db_instance.postgres.endpoint
}

output "cloudfront_domain" {
  description = <<-EOT
    Public hostname serving the uploads bucket. The backend resolves stored
    object keys against this — set S3_PUBLIC_BASE_URL to https://<this value>.
  EOT
  value       = aws_cloudfront_distribution.uploads.domain_name
}
