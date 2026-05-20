variable "create_infrastructure" {
  description = "Safety switch. Keep false for Hard $0 validation; set true only for a short-lived AWS demo."
  type        = bool
  default     = false
}

variable "aws_region" {
  description = "AWS region for the optional single-EC2 k3s host."
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "Small EC2 instance type for the optional k3s host. Check Free Tier eligibility before use."
  type        = string
  default     = "t3.micro"
}

variable "key_name" {
  description = "Existing EC2 key pair name for SSH access when create_infrastructure is true."
  type        = string
  default     = ""
}

variable "allowed_ssh_cidr" {
  description = "CIDR allowed to SSH to the optional k3s host."
  type        = string
  default     = "127.0.0.1/32"
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size for the optional k3s host."
  type        = number
  default     = 20
}

variable "ami_id" {
  description = "Optional AMI override. When null, the latest Amazon Linux 2023 x86_64 AMI is used."
  type        = string
  default     = null
}

variable "opswatch_domain" {
  description = "DNS name that would point to the optional k3s host public IP."
  type        = string
  default     = "opswatch.example.com"
}
