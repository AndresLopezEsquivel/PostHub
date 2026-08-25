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

variable "instance_type" {
  description = "EC2 instance size for the app server."
  type        = string
  default     = "t3.micro"
}

variable "ssh_public_key_path" {
  description = <<-EOT
    Path to the PUBLIC half of the SSH key used to reach the app server. Only
    this half is uploaded to AWS; the private key never leaves your machine.
    Generate one if you have none:

      ssh-keygen -t ed25519 -C "posthub"
  EOT
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "ssh_allowed_cidr" {
  description = <<-EOT
    CIDR block allowed to SSH into the app server. The default opens port 22 to
    the whole internet, which is convenient on a dynamic home IP but means the
    box is continuously probed by bots. Narrow it to your own address with:

      terraform apply -var "ssh_allowed_cidr=$(curl -s ifconfig.me)/32"
  EOT
  type        = string
  default     = "0.0.0.0/0"
}
