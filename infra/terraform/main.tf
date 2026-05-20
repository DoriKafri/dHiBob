terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # Local state: sandbox accounts typically can't create an S3 state bucket
  # or a DynamoDB lock table. Move to remote state when promoting to a real
  # Develeap AWS account.
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project   = var.project
      Env       = "prod"
      ManagedBy = "terraform"
    }
  }
}

# ---------------------------------------------------------------------------
# VPC — we create our own instead of relying on the default VPC, which may
# be absent in a fresh sandbox. One /16 VPC + one /24 public subnet + IGW.
# ---------------------------------------------------------------------------

module "network" {
  source = "./modules/network"
  name   = var.project
}

# ---------------------------------------------------------------------------
# Elastic IP allocated here (not inside the ec2_app module) so we can bake
# its public_ip into the rendered cloud-init *before* the instance exists.
# Enables the one-shot nip.io flow: the hostname is known at plan time.
# ---------------------------------------------------------------------------

resource "aws_eip" "app" {
  domain = "vpc"
  tags = {
    Name = "${var.project}-app"
  }
}

# ---------------------------------------------------------------------------
# S3 bucket for uploads + nightly backups
# ---------------------------------------------------------------------------

module "s3" {
  source               = "./modules/s3_uploads"
  bucket_name          = "${var.project}-prod-uploads"
  cors_allowed_origins = var.cors_allowed_origins
}

# ---------------------------------------------------------------------------
# ECR — container registry for CI-built Docker images
# ---------------------------------------------------------------------------

resource "aws_ecr_repository" "app" {
  name                 = var.project
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}

# ---------------------------------------------------------------------------
# OIDC — GitHub Actions assumes an IAM role, no long-lived keys needed
# ---------------------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["ffffffffffffffffffffffffffffffffffffffff"]
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:*"]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name               = "${var.project}-github-actions"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
}

data "aws_iam_policy_document" "github_actions" {
  # ECR push/pull
  statement {
    sid       = "ECRAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid = "ECRPushPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.app.arn]
  }
  # Security group for CD SSH
  statement {
    sid = "SGIngress"
    actions = [
      "ec2:AuthorizeSecurityGroupIngress",
      "ec2:RevokeSecurityGroupIngress",
    ]
    resources = ["arn:aws:ec2:${var.aws_region}:*:security-group/${module.ec2_app.security_group_id}"]
  }
}

resource "aws_iam_role_policy" "github_actions" {
  name   = "${var.project}-github-actions"
  role   = aws_iam_role.github_actions.id
  policy = data.aws_iam_policy_document.github_actions.json
}

# ---------------------------------------------------------------------------
# IAM role for EC2 instance (ECR pull access)
# ---------------------------------------------------------------------------

resource "aws_iam_role" "ec2_app" {
  name = "${var.project}-ec2-app"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ec2_ecr_pull" {
  name = "${var.project}-ec2-ecr-pull"
  role = aws_iam_role.ec2_app.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ECRAuth"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "ECRPull"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
        ]
        Resource = [aws_ecr_repository.app.arn]
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2_app" {
  name = "${var.project}-ec2-app"
  role = aws_iam_role.ec2_app.name
}

# ---------------------------------------------------------------------------
# IAM user the app container uses for S3 (sandbox blocks instance profiles)
# ---------------------------------------------------------------------------

module "iam_app" {
  source     = "./modules/iam_app_user"
  user_name  = "${var.project}-app-s3"
  bucket_arn = module.s3.bucket_arn
}

# ---------------------------------------------------------------------------
# Secrets Manager — single secret holding all app-sensitive values.
# Cloud-init writes generated passwords here on first boot; the deploy
# script pulls fresh values before every restart.
# ---------------------------------------------------------------------------

resource "random_password" "postgres" {
  length  = 24
  special = false
}

resource "random_password" "nextauth_secret" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "app" {
  name                    = "${var.project}/app-secrets"
  description             = "Application secrets for ${var.project}"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret" "ec2_ssh_key" {
  name                    = "${var.project}/ec2-ssh-key"
  description             = "EC2 SSH private key for ${var.project} (backup)"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "ec2_ssh_key" {
  secret_id     = aws_secretsmanager_secret.ec2_ssh_key.id
  secret_string = var.ec2_ssh_private_key

  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    POSTGRES_PASSWORD    = random_password.postgres.result
    NEXTAUTH_SECRET      = random_password.nextauth_secret.result
    S3_ACCESS_KEY_ID     = module.iam_app.access_key_id
    S3_SECRET_ACCESS_KEY = module.iam_app.secret_access_key
    RESEND_API_KEY       = ""
    SLACK_BOT_TOKEN      = ""
    GOOGLE_CLIENT_ID     = ""
    GOOGLE_CLIENT_SECRET = ""
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# Grant EC2 read access to the secret
resource "aws_iam_role_policy" "ec2_secrets" {
  name = "${var.project}-ec2-secrets"
  role = aws_iam_role.ec2_app.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "SecretsRead"
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.app.arn]
    }]
  })
}

# ---------------------------------------------------------------------------
# Cloud-init script rendered with module outputs + EIP
# ---------------------------------------------------------------------------

locals {
  # Hostname precedence:
  #   1. If use_route53 is on, the DNS module picks <subdomain>.<domain_name>.
  #   2. If site_domain_override is set, use it verbatim.
  #   3. Otherwise auto-derive from the EIP: "<ip-with-dashes>.nip.io".
  eip_nip_io_host = "${replace(aws_eip.app.public_ip, ".", "-")}.nip.io"

  site_domain = var.use_route53 ? (
    var.subdomain == "" ? var.domain_name : "${var.subdomain}.${var.domain_name}"
    ) : (
    var.site_domain_override != "" ? var.site_domain_override : local.eip_nip_io_host
  )

  cloud_init = templatefile("${path.module}/../cloud-init/setup.sh.tftpl", {
    repo_url           = var.repo_url
    repo_branch        = var.repo_branch
    site_domain        = local.site_domain
    expected_public_ip = aws_eip.app.public_ip
    s3_bucket          = module.s3.bucket_name
    aws_region         = var.aws_region
    secret_arn         = aws_secretsmanager_secret.app.arn
  })
}

# ---------------------------------------------------------------------------
# EC2 + security group (EIP is associated inside the module)
# ---------------------------------------------------------------------------

module "ec2_app" {
  source            = "./modules/ec2_app"
  name              = "${var.project}-app"
  vpc_id            = module.network.vpc_id
  subnet_id         = module.network.public_subnet_id
  admin_cidr        = var.admin_cidr
  key_pair_name     = var.key_pair_name
  instance_type     = var.instance_type
  ebs_size_gb          = var.ebs_size_gb
  iam_instance_profile = aws_iam_instance_profile.ec2_app.name
  user_data            = local.cloud_init
  eip_allocation_id    = aws_eip.app.id
}

# ---------------------------------------------------------------------------
# Route 53 — only used when you have a real domain delegated to this account
# ---------------------------------------------------------------------------

module "dns" {
  source      = "./modules/route53_app"
  count       = var.use_route53 ? 1 : 0
  domain_name = var.domain_name
  subdomain   = var.subdomain
  target_ip   = aws_eip.app.public_ip
}
