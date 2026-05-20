resource "aws_route53_zone" "this" {
  name = var.domain_name
  tags = var.tags
}

resource "aws_route53_record" "app" {
  zone_id = aws_route53_zone.this.zone_id
  name    = var.subdomain == "" ? var.domain_name : "${var.subdomain}.${var.domain_name}"
  type    = "A"
  ttl     = var.ttl
  records = [var.target_ip]
}
