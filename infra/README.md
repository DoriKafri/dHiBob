# DHiBob AWS deploy — sandbox playbook

Deploy DHiBob to the Develeap sandbox account `695296766764` (us-east-1, admin access, ~$15 budget, nip.io for DNS). The Terraform module is portable — when you move to a real Develeap AWS account, only the credentials + a few tfvars change.

---

## One-time prep

### 1. Authenticate

Grab short-lived keys from the sandbox portal (easiest path):

1. Sign in at <https://develeap.awsapps.com/start> with `andi.shobash@develeap.com`.
2. Click the `andi_sandbox` (695296766764) tile.
3. Next to **AdministratorAccess**, click **Access keys** / **Command line or programmatic access**.
4. Copy the **"Option 1: Set AWS environment variables"** block.

Paste into your shell:

```bash
export AWS_ACCESS_KEY_ID="ASIA..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_SESSION_TOKEN="..."
export AWS_REGION=us-east-1
```

Verify:

```bash
aws sts get-caller-identity
```

Should print `"Account": "695296766764"`. These keys last ~1 hour; when they expire, repeat steps 1–4.

### 2. Create an EC2 key pair (SSH access)

```bash
aws ec2 create-key-pair \
  --key-name dhibob-deploy \
  --query KeyMaterial \
  --output text > ~/.ssh/dhibob-deploy.pem
chmod 400 ~/.ssh/dhibob-deploy.pem
```

### 3. Find your current public IP

```bash
curl -s https://checkip.amazonaws.com
```

This goes into `admin_cidr` as `<ip>/32`.

### 4. Image build

No pre-built image needed — the EC2 clones the repo on first boot and builds via `docker compose up -d --build`. First boot takes ~5–8 min for `npm ci` + `next build`; subsequent boots reuse the cached image.

Cloud-init adds a 2 GB swapfile to the EC2 so `next build` has breathing room on a 1 GB t3.micro.

---

## Deploy

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars: admin_cidr, key_pair_name
terraform init
terraform plan
```

If the plan looks right, apply:

```bash
terraform apply
```

### What happens during apply (nip.io path)

1. Terraform allocates the Elastic IP first (e.g. `52.200.1.23`).
2. It computes the nip.io hostname: `52-200-1-23.nip.io`.
3. It bakes that hostname into cloud-init and creates the EC2.
4. The instance boots. Cloud-init polls IMDS until the EIP is actually attached (up to ~2 min), then starts the Docker Compose stack.
5. Caddy requests a Let's Encrypt cert for `52-200-1-23.nip.io` — LE's DNS lookup returns the EIP, hits our Caddy on :80, challenge passes.
6. HTTPS is live.

No second apply, no SSH-and-edit. Just:

```bash
terraform output site_domain    # e.g. "52-200-1-23.nip.io"
curl https://$(terraform output -raw site_domain)/api/health
```

### Real-domain path

If Route 53 registration worked in the sandbox:

```hcl
use_route53 = true
domain_name = "your-domain.com"
subdomain   = "app"
```

Terraform creates the zone and A record in one shot, `terraform output nameservers` tells you what to set at your registrar.

---

## After deploy

### Seed the database (one-off)

```bash
ssh -i ~/.ssh/dhibob-deploy.pem ec2-user@<eip>
cd dhibob
RUN_SEED=true docker compose -f docker-compose.prod.yml run --rm app npx tsx prisma/seed.ts
```

Default login: `admin@develeap.com / password123`.

### Tail logs

```bash
cd dhibob
docker compose -f docker-compose.prod.yml logs -f app
# or caddy, postgres, redis
```

### Smoke test

```bash
curl https://<site-domain>/api/health
# {"status":"ok","db":"up"}
```

### Take down / tear down

```bash
# Stop containers (data preserved in volumes):
ssh ec2-user@<eip> 'cd dhibob && docker compose -f docker-compose.prod.yml down'

# Destroy all AWS resources:
terraform destroy
```

---

## Troubleshooting

### `ExpiredToken: The provided token has expired`

Your sandbox credentials lapsed. Repeat **One-time prep → 1** (grab fresh env vars from the portal).

### IAM user creation fails (`AccessDenied` on `iam:CreateUser`)

Unlikely on AdministratorAccess, but if it happens, the alternative is to grant the EC2 instance an IAM role with S3 access. The sandbox may or may not let you create roles either. Flag this and we'll add a role-based module variant.

### Route 53 `CheckDomainAvailability` denied

Expected in most sandboxes. Keep `use_route53 = false` and stay on nip.io.

### Caddy can't get a TLS cert

Let's Encrypt rate-limits nip.io. If you hit the weekly cap (5 certs per domain), your hostname briefly falls back to a self-signed cert. Pick a different nip.io hostname (e.g. include a suffix `-v2`) or wait a week.

### Can't SSH — `Permission denied (publickey)`

- Check `admin_cidr` matches your current public IP (`curl -s https://checkip.amazonaws.com`).
- Your IP rotates on many home/mobile networks. Re-run `terraform apply` after updating `admin_cidr`.
- Make sure you're using `ec2-user`, not `root`/`admin`.

### `terraform plan` errors with `NoCredentialProviders`

You didn't export the AWS env vars in this shell. Re-paste the block from the sandbox portal.

---

## Clean-up checklist

When you're done with the sandbox (or it's about to expire May 4, 2026):

1. `terraform destroy` from `infra/terraform/`.
2. Delete the key pair: `aws ec2 delete-key-pair --key-name dhibob-deploy`.
3. Remove the S3 bucket if destroy didn't (versioning → bucket needs empty): `aws s3 rm s3://dhibob-prod-uploads --recursive && aws s3api delete-bucket --bucket dhibob-prod-uploads`.
4. Confirm billing is $0 in the AWS Console.
