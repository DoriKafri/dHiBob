variable "name" {
  description = "Prefix for VPC, subnet, IGW, route-table names."
  type        = string
}

variable "vpc_cidr" {
  description = "IPv4 CIDR for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "IPv4 CIDR for the single public subnet."
  type        = string
  default     = "10.0.1.0/24"
}

variable "tags" {
  description = "Tags applied to all resources."
  type        = map(string)
  default     = {}
}
