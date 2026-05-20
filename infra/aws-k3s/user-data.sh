#!/usr/bin/env bash
set -euxo pipefail

dnf update -y
dnf install -y git
curl -sfL https://get.k3s.io | sh -s - --write-kubeconfig-mode 0644

cat >/etc/profile.d/opswatch-k3s.sh <<'EOF'
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
EOF
