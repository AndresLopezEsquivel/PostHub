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
# OAC is the modern replacement for the legacy Origin Access Identity. It makes
# CloudFront sign every origin request with SigV4, so S3 can authenticate the
# distribution as a caller instead of the bucket being open to the world.
resource "aws_cloudfront_origin_access_control" "uploads" {
  name                              = "${var.uploads_bucket_name}-oac"
  description                       = "OAC for the PostHub uploads bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# AWS-managed cache policy. Looked up by name rather than hardcoding its UUID.
# CachingOptimized is right for immutable content: our keys are opaque UUIDs, so
# an object at a given key never changes — cache it hard and long.
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

# --- 2. The distribution ---------------------------------------------------
resource "aws_cloudfront_distribution" "uploads" {
  enabled = true
  comment = "PostHub uploads (post images + avatars)"

  # PriceClass_100 = North America + Europe edge locations only. The cheapest
  # tier; widen it if you ever serve users elsewhere.
  price_class = "PriceClass_100"

  origin {
    # NOT bucket_domain_name — the *regional* domain avoids a legacy global
    # redirect that breaks SigV4 signing for OAC.
    domain_name              = aws_s3_bucket.uploads.bucket_regional_domain_name
    origin_id                = "uploads-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.uploads.id
  }

  default_cache_behavior {
    target_origin_id = "uploads-s3"

    # Read-only. Uploads never go through CloudFront — they're presigned PUTs
    # straight to S3 — so the distribution needs no write methods at all.
    allowed_methods = ["GET", "HEAD"]
    cached_methods  = ["GET", "HEAD"]

    # Force HTTPS; an http:// image on an https:// page is blocked as mixed
    # content by the browser anyway.
    viewer_protocol_policy = "redirect-to-https"

    cache_policy_id = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  # Required block, even when we're not restricting anything.
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Use the free *.cloudfront.net certificate. A custom domain would need an
  # ACM cert in us-east-1 plus aliases — out of scope; we have no domain.
  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# --- 3. The bucket policy --------------------------------------------------
# Lives here rather than in s3.tf because it depends on the distribution: it
# grants read to the CloudFront *service principal*, but only when the request
# carries this specific distribution's ARN. Without that condition, any
# CloudFront distribution in any AWS account could read the bucket.
#
# This is NOT a "public" policy (the principal is a service, not "*"), so the
# public-access block in s3.tf accepts it.
data "aws_iam_policy_document" "uploads_cloudfront_read" {
  statement {
    sid     = "AllowCloudFrontRead"
    actions = ["s3:GetObject"]

    # Objects, not the bucket itself — hence the /* suffix.
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

  # The public-access block must be in place before the policy is attached, or
  # the two can race on a fresh apply. Terraform can't infer this from a
  # reference (the policy doesn't read anything off the block), so we say it.
  depends_on = [aws_s3_bucket_public_access_block.uploads]
}
