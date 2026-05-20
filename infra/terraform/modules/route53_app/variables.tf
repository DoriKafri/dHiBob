variable "domain_name" {
  description = "Apex domain name for the hosted zone."
  type        = string
}

variable "subdomain" {
  description = "Subdomain label (e.g. \"app\"). Use \"\" to point the apex record at target_ip."
  type        = string
  default     = "app"
}

variable "target_ip" {
  description = "IPv4 address the A record resolves to."
  type        = string
}

variable "ttl" {
  description = "TTL for the A record."
  type        = number
  default     = 300
}

variable "tags" {
  description = "Tags applied to the hosted zone."
  type        = map(string)
  default     = {}
}
