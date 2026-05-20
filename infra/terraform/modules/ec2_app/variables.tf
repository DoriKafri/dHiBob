variable "name" {
  description = "Prefix for resource names (e.g. \"dhibob-app\")."
  type        = string
}

variable "vpc_id" {
  description = "VPC the instance lives in."
  type        = string
}

variable "subnet_id" {
  description = "Public subnet for the instance."
  type        = string
}

variable "admin_cidr" {
  description = "CIDR allowed inbound SSH."
  type        = string
}

variable "key_pair_name" {
  description = "Existing EC2 key pair name."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type."
  type        = string
  default     = "t3.micro"
}

variable "ebs_size_gb" {
  description = "Root volume size in GB."
  type        = number
  default     = 20
}

variable "user_data" {
  description = "Rendered cloud-init script."
  type        = string
}

variable "eip_allocation_id" {
  description = "Allocation ID of a pre-allocated Elastic IP. The module associates it with the instance."
  type        = string
}

variable "iam_instance_profile" {
  description = "IAM instance profile name to attach to the EC2."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags applied to the SG and instance."
  type        = map(string)
  default     = {}
}
