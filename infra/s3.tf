# S3 bucket for user uploads (post images + avatars).
#
# The bucket is PRIVATE. Nothing is served from it directly — reads go through
# CloudFront (a later step), and writes are browser → S3 direct PUTs authorized
# by a presigned URL the backend mints. So we lock down all public access here
# and grant only the two narrow paths the app needs, explicitly, later:
#
#   read  → a bucket policy allowing the CloudFront distribution (via OAC)
#   write → the EC2 instance role's s3:PutObject, used to sign upload URLs
#
# The CORS rule that lets the browser PUT here also comes later: its
# allowed_origins is the frontend origin, i.e. the EC2 instance's public IP,
# which doesn't exist yet.

# If the bucket name is taken, override it without editing the code:
# terraform apply -var 'uploads_bucket_name=posthub-uploads-yourname'

# Verify
# aws s3 ls | grep posthub-uploads
# aws s3api get-public-access-block --bucket posthub-uploads-prod

resource "aws_s3_bucket" "uploads" {
  bucket = var.uploads_bucket_name
}

# Belt-and-suspenders public-access lockdown. All four of these default to the
# safe value on new buckets now, but setting them explicitly makes the intent
# part of the config: this bucket is never public, and an accidental public ACL
# or policy later is refused rather than silently taking effect.
resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
