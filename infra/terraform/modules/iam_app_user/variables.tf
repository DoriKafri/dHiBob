variable "user_name" {
  description = "IAM user name."
  type        = string
}

variable "bucket_arn" {
  description = "S3 bucket ARN the user is allowed to read/write."
  type        = string
}

variable "tags" {
  description = "Tags to apply to the IAM user."
  type        = map(string)
  default     = {}
}
