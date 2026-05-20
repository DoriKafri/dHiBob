output "public_ip" {
  description = "Elastic IP of the EC2 — point DNS here."
  value       = aws_eip.app.public_ip
}

output "site_domain" {
  description = "The hostname the app will serve on."
  value       = local.site_domain
}

output "bucket_name" {
  description = "S3 bucket holding uploads and backups."
  value       = module.s3.bucket_name
}

output "s3_access_key_id" {
  description = "IAM user access key for the app (already baked into EC2 user_data)."
  value       = module.iam_app.access_key_id
  sensitive   = true
}

output "s3_secret_access_key" {
  description = "IAM user secret (already baked into EC2 user_data). Keep out of logs."
  value       = module.iam_app.secret_access_key
  sensitive   = true
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC (no secrets needed in GitHub)."
  value       = aws_iam_role.github_actions.arn
}

output "ecr_repo_url" {
  description = "ECR repository URL for Docker images."
  value       = aws_ecr_repository.app.repository_url
}

output "security_group_id" {
  description = "EC2 security group ID (needed for GitHub Actions CD secret EC2_SG_ID)."
  value       = module.ec2_app.security_group_id
}

output "nameservers" {
  description = "When use_route53=true: NS records for the hosted zone. Point your registrar at these."
  value       = var.use_route53 ? module.dns[0].nameservers : []
}
