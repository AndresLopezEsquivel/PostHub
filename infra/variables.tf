# Input variables. Values a user of this config can set without editing the main
# files — the knobs that make the config reusable.

variable "aws_region" {
  description = "AWS region to deploy PostHub into."
  type        = string
  default     = "us-east-1"
}

variable "uploads_bucket_name" {
  description = <<-EOT
    Globally-unique name for the S3 bucket that stores post images and avatars.
    S3 bucket names share one namespace across ALL AWS accounts, so if this name
    is taken you'll get a BucketAlreadyExists error — pick another.
  EOT
  type        = string
  default     = "posthub-uploads-prod"
}
