# Production Plan — Dpeople on AWS

## Current Setup (~$9.50/month)

Everything runs on a single **t3.micro EC2** via Docker Compose:
- Next.js 14 app (tRPC, Prisma)
- PostgreSQL 16
- Redis 7 (JWT blocklist only)
- Caddy (reverse proxy + auto HTTPS)
- S3 for file storage (encryption, versioning, CORS)
- CI/CD via GitHub Actions + OIDC + ECR (fully working)
- AWS Secrets Manager for credentials (~$0.40/month)

## Target Scale

- Max 130 concurrent users (rare peak)
- Kubernetes/EKS is overkill
- ECS/Fargate, App Runner, Lambda — all add complexity or cost without real benefit at this scale

## Security (Implemented)

### Already Done
- **HTTPS** — Caddy auto-TLS via Let's Encrypt
- **EBS encryption at rest** — encrypted root volume
- **OIDC for CI/CD** — GitHub Actions authenticates via OIDC, no long-lived AWS keys
- **S3** — AES256 encryption, public access blocked, versioning enabled
- **SSH restricted** — security group limits access to admin CIDR only
- **JWT blocklist** — Redis-backed logout enforcement
- **AWS Secrets Manager** — all credentials (DB password, NextAuth secret, S3 keys, API keys) stored in Secrets Manager. EC2 pulls via `~/pull-secrets.sh` on boot and each deploy. No secrets in cloud-init user_data or plain text.
- **Rate limiting on login** — 5 attempts per minute per IP on credentials endpoint, returns 429
- **Backend role guards** — all analytics, reports, and compensation endpoints require HR/ADMIN/SUPER_ADMIN role via `hrProtectedProcedure`. Salary-specific endpoints additionally block OPERATOR via `salaryProtectedProcedure`.
- **OPERATOR role** — admin without salary visibility, enforced both UI and backend
- **Google OAuth** — login via Google with auto-provisioning for company domain (@develeap.com)
- **File upload validation** — 10MB limit, MIME type whitelist
- **Slack message escaping** — prevents mrkdwn injection

- **Field-level encryption** — AES-256-GCM for nationalId, passportNumber, bankAccount. Key in Secrets Manager (`FIELD_ENCRYPTION_KEY`)
- **Password policy** — min 8 chars + uppercase + number + special character, enforced frontend and backend
- **Security headers** — HSTS, X-Frame-Options DENY, nosniff, strict referrer, permissions policy
- **Error boundaries** — graceful fallback UI for unhandled React errors (error.tsx, global-error.tsx)
- **Env validation** — required env vars validated at startup via instrumentation hook, fails fast with clear message
- **Access control** — updatePersonalInfo/updateWorkInfo require self or admin, getById strips PII for non-admin/non-self, document.list restricted to own docs, survey results HR-only, expense approve/reject HR-only, onboarding mutations HR-only
- **CSRF hardening** — httpOnly, sameSite=lax, secure + __Secure- prefix in production

### Remaining (Nice-to-Have)
- **Audit logging** for sensitive actions (role changes, salary edits, data exports)
- **Account lockout** after repeated failed logins per account
- **Remove demo credentials** from login page before go-live
- **Remove `SLACK_TEST_EMAIL`** from production `.env`

## Roles & Permissions

| Role | Manage Employees | View Salaries | Reports/Analytics | IT Assets | Change Roles |
|------|:---:|:---:|:---:|:---:|:---:|
| SUPER_ADMIN | Yes | Yes | Yes | Yes | Yes |
| ADMIN | Yes | Yes | Yes | Yes | Yes |
| HR | Yes | Yes | Yes | No | No |
| OPERATOR | Yes | No | No | Yes | Yes |
| IT | No | No | No | Yes | No |
| EMPLOYEE | Own profile | Own only | No | No | No |

## Authentication

- **Credentials login** — email + password with bcrypt hashing
- **Google OAuth** — sign in with Google, restricted to `@develeap.com` domain
- **Auto-provisioning** — new Google users auto-created as EMPLOYEE if email domain matches company
- **Session** — JWT strategy, 30-day expiry, Redis blocklist for logout

## Notifications

- **In-app** — real-time via SSE
- **Email** — via Resend (free tier: 3k emails/month)
- **Slack** — DM via bot token
- **Per-user preferences** — opt-out model per event type per channel
- **Events**: time-off requests/approvals/rejections, document signed (notifies HR), survey published

## Step 1: Upgrade EC2 to t3.small (~$15.50/month)

t3.micro (1GB RAM) is too tight for Postgres + Redis + Next.js + Caddy all running together. t3.small (2GB) handles 130 users comfortably.

- Nightly `pg_dump` to S3 already configured (3:15 UTC)
- Everything else stays the same

## Step 2: Move Postgres to RDS (~$28.50/month total)

This is the single biggest reliability improvement. Right now if the EC2 dies, the database is lost. RDS gives:
- Automated daily backups + point-in-time recovery (up to 35 days, included free)
- No data loss if EC2 goes down
- Easy scaling if needed later
- `db.t4g.micro` — free tier eligible for 12 months, ~$13/month after

## What to Keep As-Is

- **Redis in Docker** — only used for JWT blocklist, not critical data. If EC2 restarts, worst case is users re-login
- **Caddy in Docker** — auto HTTPS via Let's Encrypt, reverse proxy, gzip compression. $0 cost. An ALB would cost ~$18/month for the same job
- **S3 for uploads** — already set up with encryption, versioning, CORS, lifecycle policies
- **Docker Compose deploy** — CI/CD pipeline works well (GitHub Actions → ECR → EC2 pull)
- **Single EC2** — no need for load balancers, auto-scaling groups, or multiple instances
- **Secrets Manager** — $0.40/month, secrets pulled on each deploy via `~/pull-secrets.sh`

## Optional Nice-to-Haves (not urgent)

- **CloudFront in front of S3** — faster PDF/document downloads for users
- **Automated EBS snapshots** — extra backup layer
- **CloudWatch alarms** — get notified if disk/CPU spikes
- **Reserved Instances** — 1-year commit on EC2 + RDS saves ~30-40%
- **Blue-green deploy script** — near-zero downtime for free (start new container, switch Caddy, stop old)

## What to Avoid

| Option | Why Not |
|--------|---------|
| ECS/Fargate | Task definitions, service discovery, ALB — complexity for no benefit at this scale |
| EKS | Overkill — designed for dozens of microservices |
| App Runner | Still needs RDS + ElastiCache separately, ends up costing more (~$33-40/month) |
| Lambda | Cold starts, connection pooling issues with Prisma, 6MB upload limit, no persistent connections |
| Aurora | Starts at ~$60/month, designed for high-throughput workloads |
| ALB | ~$18/month to do what Caddy does for free on a single instance |
| Multi-AZ / Auto Scaling | 130 users doesn't justify the cost or complexity |

## Estimated Monthly Cost

| Phase | Services | Cost |
|-------|----------|------|
| Current | EC2 t3.micro + S3 + ECR + Secrets Manager | ~$9.50/month |
| Step 1 | EC2 t3.small + S3 + ECR + Secrets Manager | ~$15.50/month |
| Step 2 | EC2 t3.small + RDS + S3 + ECR + Secrets Manager | ~$28.50/month |
| With Reserved Instances | Same as Step 2, 1-year commit | ~$18-20/month |

## Secrets Manager Setup

Secrets are stored in AWS Secrets Manager at `dhibob/app-secrets` as a JSON object:
```json
{
  "POSTGRES_PASSWORD": "...",
  "NEXTAUTH_SECRET": "...",
  "S3_ACCESS_KEY_ID": "...",
  "S3_SECRET_ACCESS_KEY": "...",
  "RESEND_API_KEY": "...",
  "SLACK_BOT_TOKEN": "...",
  "GOOGLE_CLIENT_ID": "...",
  "GOOGLE_CLIENT_SECRET": "..."
}
```

- Terraform creates the secret with initial random passwords
- After `terraform apply`, update the secret in AWS Console with your current values
- EC2 pulls secrets via `~/pull-secrets.sh` → writes `.env` file
- CD pipeline calls `~/pull-secrets.sh` before each restart
- To update a secret: edit in AWS Console → SSH to EC2 → run `~/pull-secrets.sh` → restart app
