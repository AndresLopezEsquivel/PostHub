# IAM role for the EC2 instance — the WRITE path for uploads.
#
# The backend never holds AWS access keys. Instead the instance carries a role,
# the SDK picks up short-lived credentials from the instance metadata service
# automatically (which is why the S3 client omits explicit `credentials` when no
# static keys are set), and those credentials sign the presigned PUT URLs the
# browser then uploads to.
#
# Three resources, because IAM separates concerns that sound like one thing:
#   1. the role            — WHO can assume it (the trust policy)
#   2. the permission policy — WHAT it may do once assumed
#   3. the instance profile — the wrapper EC2 needs to attach a role to a box

# --- 1. Trust policy: who may assume this role ----------------------------
# This is NOT about S3 at all. It answers one question: which principal is
# allowed to become this role? Answer: the EC2 service, on behalf of an
# instance we launch with the profile attached.
data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "posthub-app-role"
  description        = "Role assumed by the PostHub EC2 instance"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json
}

# --- 2. Permission policy: what the role may do ---------------------------
# Deliberately minimal. The app only ever writes objects:
#   - reads go through CloudFront, not the SDK, so no s3:GetObject
#   - keys are minted server-side as opaque UUIDs, so no s3:ListBucket
#     (listing would also leak every user's object keys)
# Scoped to objects inside this one bucket — never "*", never another bucket.
data "aws_iam_policy_document" "uploads_write" {
  statement {
    sid       = "PutUploadObjects"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.uploads.arn}/*"]
  }
}

# An inline policy (embedded in the role) rather than a standalone managed one:
# this permission exists only to serve this role, so tying their lifecycles
# together is honest — delete the role and the policy goes with it.
resource "aws_iam_role_policy" "uploads_write" {
  name   = "posthub-uploads-write"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.uploads_write.json
}

# --- 3. Instance profile ---------------------------------------------------
# EC2 can't attach a role directly; it attaches an *instance profile*, which is
# a container holding exactly one role. A pure plumbing resource — but the
# instance references this, not the role, so it has to exist.
resource "aws_iam_instance_profile" "app" {
  name = "posthub-app-profile"
  role = aws_iam_role.app.name
}
