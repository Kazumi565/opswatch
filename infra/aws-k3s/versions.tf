terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region                      = var.aws_region
  access_key                  = var.create_infrastructure ? null : "mock_access_key"
  secret_key                  = var.create_infrastructure ? null : "mock_secret_key"
  skip_credentials_validation = !var.create_infrastructure
  skip_metadata_api_check     = !var.create_infrastructure
  skip_requesting_account_id  = !var.create_infrastructure
}
