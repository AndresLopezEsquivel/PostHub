# CloudFront distribution — the READ path for uploads.
#
# The bucket is private, so the browser can never fetch an object from S3
# directly. Instead CloudFront sits in front of it and is the only reader:
#
#   browser → CloudFront (public HTTPS) → [OAC-signed] → S3 (private)
#
# The backend stores only an opaque object key (`imageKey` / `avatar_key`) and
# resolves it against this distribution's domain via S3_PUBLIC_BASE_URL — see
# keyToPublicUrl() in posts.service.ts. That env var is the `cloudfront_domain`
# output below.
#
# Three pieces, in dependency order:
#   1. the OAC        — CloudFront's identity when it calls S3
#   2. the distribution — uses the OAC, points at the bucket
#   3. the bucket policy — trusts THIS distribution (needs its ARN, so it's last)

# --- 1. Origin Access Control ---------------------------------------------
resource "aws_cloudfront_origin_access_control" "uploads" {
  name                              = "${var.uploads_bucket_name}-oac"
  description                       = "OAC for the PostHub uploads bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

# --- 2. The distribution ---------------------------------------------------
resource "aws_cloudfront_distribution" "uploads" {
  enabled = true
  comment = "PostHub uploads (post images + avatars)"
  price_class = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.uploads.bucket_regional_domain_name
    origin_id                = "uploads-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.uploads.id
  }

  default_cache_behavior {
    target_origin_id = "uploads-s3"
    allowed_methods = ["GET", "HEAD"]
    cached_methods  = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    cache_policy_id = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# --- 3. The bucket policy --------------------------------------------------
data "aws_iam_policy_document" "uploads_cloudfront_read" {
  statement {
    sid     = "AllowCloudFrontRead"
    actions = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.uploads.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.uploads.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  policy = data.aws_iam_policy_document.uploads_cloudfront_read.json
  depends_on = [aws_s3_bucket_public_access_block.uploads]
}
