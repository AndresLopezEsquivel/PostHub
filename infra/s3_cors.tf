resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = ["https://${aws_instance.app.public_ip}"]
    allowed_headers = ["*"]
    max_age_seconds = 3000
  }
}
