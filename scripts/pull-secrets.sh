#!/bin/bash
# Pull secrets from AWS Secrets Manager and write .env
# Usage: ~/pull-secrets.sh (or from repo: scripts/pull-secrets.sh)
set -euo pipefail

APP_DIR=/home/ec2-user/dhibob
SECRET_ARN="dhibob/app-secrets"
AWS_REGION="us-east-1"
SITE_DOMAIN="dpeople.develeap.com"
S3_BUCKET="dhibob-prod-uploads"

SECRETS_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ARN" \
  --region "$AWS_REGION" \
  --query SecretString --output text)

PG_PASS=$(echo "$SECRETS_JSON" | jq -r '.POSTGRES_PASSWORD')
NA_SECRET=$(echo "$SECRETS_JSON" | jq -r '.NEXTAUTH_SECRET')
S3_KEY=$(echo "$SECRETS_JSON" | jq -r '.S3_ACCESS_KEY_ID')
S3_SEC=$(echo "$SECRETS_JSON" | jq -r '.S3_SECRET_ACCESS_KEY')
RESEND=$(echo "$SECRETS_JSON" | jq -r '.RESEND_API_KEY // empty')
SLACK=$(echo "$SECRETS_JSON" | jq -r '.SLACK_BOT_TOKEN // empty')
GOOGLE_ID=$(echo "$SECRETS_JSON" | jq -r '.GOOGLE_CLIENT_ID // empty')
GOOGLE_SEC=$(echo "$SECRETS_JSON" | jq -r '.GOOGLE_CLIENT_SECRET // empty')
ENCRYPTION_KEY=$(echo "$SECRETS_JSON" | jq -r '.FIELD_ENCRYPTION_KEY // empty')
GCAL_SA_KEY=$(echo "$SECRETS_JSON" | jq -r '.GOOGLE_SERVICE_ACCOUNT_KEY // empty')
GCAL_CALENDAR_ID=$(echo "$SECRETS_JSON" | jq -r '.GOOGLE_CALENDAR_ID // empty')

cat > "$APP_DIR/.env" <<ENVEOF
POSTGRES_DB=dhibob
POSTGRES_USER=dhibob
POSTGRES_PASSWORD=$PG_PASS

DATABASE_URL=postgresql://dhibob:$PG_PASS@postgres:5432/dhibob
REDIS_URL=redis://redis:6379

NEXTAUTH_SECRET=$NA_SECRET
NEXTAUTH_URL=https://$SITE_DOMAIN
NEXT_PUBLIC_APP_URL=https://$SITE_DOMAIN
SITE_DOMAIN=$SITE_DOMAIN

STORAGE_DRIVER=s3
S3_BUCKET=$S3_BUCKET
AWS_REGION=$AWS_REGION
S3_ACCESS_KEY_ID=$S3_KEY
S3_SECRET_ACCESS_KEY=$S3_SEC

RESEND_API_KEY=$RESEND
NOTIFICATION_FROM_EMAIL=Dpeople <notifications@develeap.com>
SLACK_BOT_TOKEN=$SLACK

GOOGLE_CLIENT_ID=$GOOGLE_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_SEC

FIELD_ENCRYPTION_KEY=$ENCRYPTION_KEY

GOOGLE_SERVICE_ACCOUNT_KEY=$GCAL_SA_KEY
GOOGLE_CALENDAR_ID=$GCAL_CALENDAR_ID

NODE_ENV=production
ENVEOF

chmod 600 "$APP_DIR/.env"
echo "Secrets pulled from Secrets Manager."
