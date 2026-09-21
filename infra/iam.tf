# --- 1. Trust policy: who may assume this role ----------------------------
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
data "aws_iam_policy_document" "uploads_write" {
  statement {
    sid       = "PutUploadObjects"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.uploads.arn}/*"]
  }
}

resource "aws_iam_role_policy" "uploads_write" {
  name   = "posthub-uploads-write"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.uploads_write.json
}

# --- 3. Instance profile ---------------------------------------------------
resource "aws_iam_instance_profile" "app" {
  name = "posthub-app-profile"
  role = aws_iam_role.app.name
}
