# OpsWatch AWS k3s Terraform

This directory is AWS-ready but defaults to **zero resources**.

The portfolio story is: validate infrastructure as code for a single-node k3s AWS path, then run the real acceptance path locally for $0. Do not use this as a long-running environment unless you have checked current AWS billing rules for your account.

## Hard $0 validation

```bash
terraform -chdir=infra/aws-k3s init -backend=false
terraform -chdir=infra/aws-k3s fmt -check -recursive
terraform -chdir=infra/aws-k3s validate
terraform -chdir=infra/aws-k3s plan
```

With the default `create_infrastructure = false`, the plan should show no AWS resources to create.

## Optional short-lived AWS demo

Only use this path after setting AWS Budgets/Billing alerts and confirming Free Tier status for your account.

```bash
cp infra/aws-k3s/terraform.tfvars.example infra/aws-k3s/terraform.tfvars
```

Edit:

- `create_infrastructure = true`
- `key_name`
- `allowed_ssh_cidr`
- `opswatch_domain`
- `instance_type` and `root_volume_size_gb` after checking current AWS billing limits

Then:

```bash
terraform -chdir=infra/aws-k3s plan
terraform -chdir=infra/aws-k3s apply
```

Destroy immediately after the demo:

```bash
terraform -chdir=infra/aws-k3s destroy
```

## Cost guardrails

- This module does not create EKS, RDS, ElastiCache, ALB, or NAT Gateway.
- It uses one optional EC2 host in the default VPC.
- Public IPv4 and EBS can still be billable depending on account eligibility and usage.
- The checked-in default is intentionally `create_infrastructure = false`.
