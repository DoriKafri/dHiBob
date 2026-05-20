output "site_domain" {
  description = "Final hostname (subdomain.domain or apex)."
  value       = aws_route53_record.app.name
}

output "zone_id" {
  description = "Hosted zone ID."
  value       = aws_route53_zone.this.zone_id
}

output "nameservers" {
  description = "NS records — point your registrar at these."
  value       = aws_route53_zone.this.name_servers
}
