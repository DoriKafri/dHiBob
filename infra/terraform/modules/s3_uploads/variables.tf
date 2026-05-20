variable "bucket_name" {
  description = "Globally-unique S3 bucket name."
  type        = string
}

variable "backup_prefix" {
  description = "Object-key prefix whose contents age out under the lifecycle rule."
  type        = string
  default     = "backups/"
}

variable "backup_retention_days" {
  description = "Days after which objects under backup_prefix are expired."
  type        = number
  default     = 14
}

variable "cors_allowed_origins" {
  description = "Origins allowed to make cross-origin GET requests (e.g. for PDF viewing)."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to the bucket."
  type        = map(string)
  default     = {}
}
