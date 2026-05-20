output "bucket_name" {
  description = "Bucket name."
  value       = aws_s3_bucket.this.bucket
}

output "bucket_arn" {
  description = "Bucket ARN — pass to iam_app_user for scoped policy."
  value       = aws_s3_bucket.this.arn
}
