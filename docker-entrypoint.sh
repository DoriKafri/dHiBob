#!/bin/sh
set -e

# Wait for Postgres to accept TCP connections
if [ -n "$DATABASE_URL" ]; then
  # Extract host and port from postgres DSN
  # postgresql://user:pass@host:port/db
  DB_HOST=$(echo "$DATABASE_URL" | sed 's|.*@\(.*\):\([0-9]*\)/.*|\1|')
  DB_PORT=$(echo "$DATABASE_URL" | sed 's|.*@.*:\([0-9]*\)/.*|\1|')
  echo "Waiting for Postgres at $DB_HOST:$DB_PORT..."
  until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
    sleep 1
  done
  echo "Postgres is up."
fi

echo "Applying migrations..."
npx prisma migrate deploy

if [ "$RUN_SEED" = "true" ]; then
  echo "RUN_SEED=true — seeding database (DESTRUCTIVE, wipes all tables)"
  npx tsx prisma/seed.ts
fi

# If the caller passed a command (docker compose run ... app <cmd>), run that
# instead of the server. Lets one-off jobs like migration scripts share the
# same Postgres-wait + migrate-deploy bootstrap.
if [ "$#" -gt 0 ]; then
  echo "Running custom command: $@"
  exec "$@"
fi

echo "Starting server..."
exec npm run start
