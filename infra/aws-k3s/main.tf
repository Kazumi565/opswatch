locals {
  enabled = var.create_infrastructure
  common_tags = {
    Project   = "opswatch"
    ManagedBy = "terraform"
    Mode      = "optional-aws-k3s"
  }
}

data "aws_ami" "amazon_linux_2023" {
  count       = local.enabled && var.ami_id == null ? 1 : 0
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_vpc" "default" {
  count   = local.enabled ? 1 : 0
  default = true
}

data "aws_subnets" "default" {
  count = local.enabled ? 1 : 0

  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default[0].id]
  }
}

resource "aws_security_group" "opswatch" {
  count       = local.enabled ? 1 : 0
  name_prefix = "opswatch-k3s-"
  description = "OpsWatch optional single-node k3s host"
  vpc_id      = data.aws_vpc.default[0].id

  ingress {
    description = "SSH from operator IP only"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  ingress {
    description = "HTTP ingress"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS ingress"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Outbound package and image pulls"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_instance" "k3s" {
  count                       = local.enabled ? 1 : 0
  ami                         = var.ami_id != null ? var.ami_id : data.aws_ami.amazon_linux_2023[0].id
  instance_type               = var.instance_type
  key_name                    = var.key_name != "" ? var.key_name : null
  subnet_id                   = data.aws_subnets.default[0].ids[0]
  vpc_security_group_ids      = [aws_security_group.opswatch[0].id]
  associate_public_ip_address = true
  user_data                   = file("${path.module}/user-data.sh")

  root_block_device {
    volume_size = var.root_volume_size_gb
    volume_type = "gp3"
    encrypted   = true
  }

  tags = merge(local.common_tags, {
    Name   = "opswatch-k3s"
    Domain = var.opswatch_domain
  })
}
