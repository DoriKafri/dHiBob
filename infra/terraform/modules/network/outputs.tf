output "vpc_id" {
  description = "VPC ID."
  value       = aws_vpc.this.id
}

output "public_subnet_id" {
  description = "Public subnet ID (for the EC2)."
  value       = aws_subnet.public.id
}

output "internet_gateway_id" {
  description = "Internet gateway ID."
  value       = aws_internet_gateway.this.id
}
