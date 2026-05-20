output "access_key_id" {
  description = "IAM user access key ID."
  value       = aws_iam_access_key.this.id
  sensitive   = true
}

output "secret_access_key" {
  description = "IAM user secret access key."
  value       = aws_iam_access_key.this.secret
  sensitive   = true
}
