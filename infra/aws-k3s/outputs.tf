output "create_infrastructure" {
  description = "Whether this configuration is allowed to create AWS resources."
  value       = var.create_infrastructure
}

output "k3s_public_ip" {
  description = "Public IP for the optional k3s host when enabled."
  value       = try(aws_instance.k3s[0].public_ip, null)
}

output "ssh_command" {
  description = "SSH command for the optional k3s host when enabled."
  value       = try("ssh ec2-user@${aws_instance.k3s[0].public_ip}", null)
}
