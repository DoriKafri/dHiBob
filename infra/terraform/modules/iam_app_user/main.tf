resource "aws_iam_user" "this" {
  name = var.user_name
  tags = var.tags
}

data "aws_iam_policy_document" "s3_rw" {
  statement {
    sid = "BucketList"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
      "s3:PutBucketCors",
      "s3:GetBucketCors",
    ]
    resources = [var.bucket_arn]
  }

  statement {
    sid = "ObjectRW"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["${var.bucket_arn}/*"]
  }
}

resource "aws_iam_user_policy" "s3_rw" {
  name   = "${var.user_name}-s3"
  user   = aws_iam_user.this.name
  policy = data.aws_iam_policy_document.s3_rw.json
}

resource "aws_iam_access_key" "this" {
  user = aws_iam_user.this.name
}
