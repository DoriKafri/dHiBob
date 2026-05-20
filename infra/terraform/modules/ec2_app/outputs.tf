output "instance_id" {
  description = "EC2 instance ID."
  value       = aws_instance.this.id
}

output "security_group_id" {
  description = "Security group ID (for any follow-on rules)."
  value       = aws_security_group.this.id
}
