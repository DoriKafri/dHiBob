#!/bin/bash
# Quick fix for when your public IP changes and SSH/Terraform stops working.
# Run from the infra/terraform/ directory:
#   bash ../fix-ip.sh
#   OR: bash ../../infra/fix-ip.sh
#   OR just copy it there and run: bash fix-ip.sh

set -euo pipefail

# Find terraform.tfvars — check current dir, then common relative paths
if [ -f terraform.tfvars ]; then
  DIR="."
elif [ -f infra/terraform/terraform.tfvars ]; then
  DIR="infra/terraform"
elif [ -f ../../infra/terraform/terraform.tfvars ]; then
  DIR="../../infra/terraform"
else
  echo "Error: can't find terraform.tfvars. Run this from the infra/terraform/ directory."
  exit 1
fi

NEW_IP=$(curl -s https://checkip.amazonaws.com)
SUBNET=$(echo "$NEW_IP" | cut -d. -f1-3).0/24

echo "Your current IP: $NEW_IP"
echo "Setting admin_cidr to: $SUBNET"

sed -i "s|^admin_cidr = .*|admin_cidr = \"$SUBNET\"|" "$DIR/terraform.tfvars"
cd "$DIR"
terraform apply -auto-approve

echo ""
echo "Done. SSH should work now:"
echo "  ssh -i ~/.ssh/dhibob-deploy.pem ec2-user@$(terraform output -raw public_ip)"
