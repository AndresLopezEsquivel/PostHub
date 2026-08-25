# CORS on the uploads bucket — the last piece of the WRITE path.
#
# Kept in its own file, apart from s3.tf, because of what it depends on: the
# browser uploads directly to S3 from the frontend, so the allowed origin is the
# app server's address. That makes this rule depend on the EC2 instance, and
# writing `aws_instance.app.public_ip` below is the only ordering we ever
# declare — Terraform creates the instance first and fills the real IP in.
#
# Why CORS is needed at all: the PUT goes to s3.amazonaws.com from a page served
# by the app server. That's a cross-origin request, so before sending it the
# browser issues an OPTIONS preflight and refuses the upload unless S3 answers
# with matching Access-Control-Allow-* headers. The presigned URL authorizes the
# request; CORS is what convinces the browser to make it.

resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    # PUT only. Reads never touch this origin — they go through CloudFront —
    # and the backend mints keys server-side, so the browser never lists,
    # deletes, or fetches anything here.
    allowed_methods = ["PUT"]

    # Nginx terminates TLS on 443, so the frontend origin is https, and a
    # bare IP has no port suffix. An origin match is exact: scheme, host, and
    # port all have to agree, which is why http:// or a :5173 dev origin
    # would not be covered by this entry.
    allowed_origins = ["https://${aws_instance.app.public_ip}"]

    # The signed PUT carries Content-Type (it's bound into the signature), and
    # the preflight asks whether that header is permitted. Listing "*" covers
    # it plus anything the SDK adds later.
    allowed_headers = ["*"]

    # How long the browser may cache the preflight answer, in seconds — so it
    # doesn't re-ask OPTIONS before every single upload.
    max_age_seconds = 3000
  }
}
