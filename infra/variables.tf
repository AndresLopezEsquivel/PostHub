# Input variables. Values a user of this config can set without editing the main
# files — the knobs that make the config reusable. For now just the region; more
# arrive as we add real resources.

variable "aws_region" {
  description = "AWS region to deploy PostHub into."
  type        = string
  default     = "us-east-1"
}
