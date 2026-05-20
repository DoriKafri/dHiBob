# Implementation Plan: Switch SQLite → PostgreSQL + Add Redis Session Cache

## Context

DHiBob is a Next.js 14 / tRPC / Prisma HR platform. It currently uses SQLite (via Prisma)
and stores JWT sessions in-memory (via NextAuth `strategy: 'jwt'`). This plan switches the
database to PostgreSQL and adds Redis as a JWT token blocklist / session cache, with no
changes to the JWT-based auth flow.

Key decisions locked in before this plan:
- **Auth strategy**: Keep JWT; add Redis only as a token blocklist/cache (not DB sessions)
- **Test database**: Router integration test uses `TEST_DATABASE_URL` env var pointing to Postgres
- **Schema management**: Keep `prisma db push` (not migrate)
- **Postgres search**: Add `mode: 'insensitive'` to `contains` filters in `employee.ts`

All 163 existing tests must pass after the change. `docker compose up --build` must bring
all three services (postgres, redis, app) up cleanly. End-to-end flow: login → see employees
→ Redis has session key.

---

## Files to Change

### 1. `prisma/schema.prisma`

**What**: Change the datasource provider from `sqlite` to `postgresql`.  
**Why**: Postgres is the target database. The schema models themselves are already compatible —
all enum-like fields are stored as `String`, CUID IDs, no SQLite-only syntax used.

**Change**:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Remove the comment `// ENUMS (using String type since SQLite doesn't support native enums)` since
Postgres supports native enums, though we are keeping String fields to avoid a migration risk.
The comment is misleading; drop it.

**No model changes needed** — every model already uses `String` for enum fields, `Float` for
decimals (fine on Postgres), and `DateTime` (fine). `@default("{}")` string JSON blobs are
fine in Postgres `TEXT` columns that Prisma maps them to.

---

### 2. `src/server/routers/employee.ts`

**What**: Add `mode: 'insensitive'` to the three `contains` clauses in the `list` query.  
**Why**: PostgreSQL's `LIKE` is case-sensitive by default; Prisma requires the explicit mode.
SQLite's default LIKE was case-insensitive for ASCII. Without this change, the router test's
"search is case-insensitive" assertion will fail on Postgres.

**Change** (inside the `if (search)` block):
```typescript
where.OR = [
  { firstName: { contains: search, mode: 'insensitive' } },
  { lastName:  { contains: search, mode: 'insensitive' } },
  { email:     { contains: search, mode: 'insensitive' } },
];
```

---

### 3. `docker-compose.yml`

**What**: Replace the SQLite volume mount with Postgres + Redis services; wire `app` to
depend on both; use healthchecks so the app waits for them to be ready.  
**Why**: `docker compose up --build` must start three healthy services.

**Full replacement**:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: dhibob
      POSTGRES_USER: dhibob
      POSTGRES_PASSWORD: dhibob_secret
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dhibob -d dhibob"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  app:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      DATABASE_URL: "postgresql://dhibob:dhibob_secret@postgres:5432/dhibob"
      REDIS_URL: "redis://redis:6379"
      NEXTAUTH_SECRET: "docker-dev-secret-change-in-production"
      NEXTAUTH_URL: "http://localhost:3000"
      NODE_ENV: "production"

volumes:
  pg-data:
  redis-data:
```

Note: the old `db-data` volume is dropped. The `POSTGRES_*` vars match the DSN in `DATABASE_URL`.

---

### 4. `Dockerfile`

**What**: Remove the SQLite-specific `RUN mkdir -p /app/data` line. Add `netcat-openbsd`
alongside `openssl` in the `apk add` line.  
**Why**: There is no longer a SQLite file to write. The `openssl` package is still required
by Prisma's query engine on Alpine. `netcat-openbsd` is required for the `nc -z` TCP
readiness check in `docker-entrypoint.sh` — BusyBox `nc` (the Alpine default) does NOT
support the `-z` flag and will exit non-zero under `set -e`, breaking the entrypoint before
Postgres is ever reached. `netcat-openbsd` supports `-z` reliably.

**Change**: Replace the `apk add` line and delete the SQLite mkdir:
```dockerfile
# Prisma requires OpenSSL on Alpine; netcat-openbsd provides nc -z for the entrypoint wait loop
RUN apk add --no-cache openssl netcat-openbsd
```

Delete:
```
# Create data directory for SQLite volume mount
RUN mkdir -p /app/data
```

The entrypoint `npx prisma db push --skip-generate` now talks to Postgres; no directory is
needed.

---

### 5. `docker-entrypoint.sh`

**What**: Add a `pg_isready` wait loop before `prisma db push`.  
**Why**: Even with Docker `depends_on: condition: service_healthy`, belt-and-suspenders is
prudent. The `pg_isready` binary is available in the `postgres:16-alpine` client tools, but
NOT in the `node:20-alpine` app image. Instead, use a pure-shell TCP readiness check or
install the `postgresql-client` package. The simplest zero-dependency approach is a shell
loop that tries `npx prisma db push` with retries.

**Strategy**: Parse `DATABASE_URL` to extract host/port and loop on `nc -z` (netcat) until the
port is open, then run `prisma db push`. **Requires `netcat-openbsd`** (installed in the
Dockerfile step above) — BusyBox `nc` on `node:20-alpine` does NOT support `-z`.

```sh
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

echo "Setting up database..."
npx prisma db push --skip-generate

echo "Seeding database..."
npx tsx prisma/seed.ts

echo "Starting server..."
exec npm run start
```

`nc -z` requires `netcat-openbsd`, which the Dockerfile installs via
`apk add --no-cache openssl netcat-openbsd`. Do NOT skip that Dockerfile change — BusyBox
`nc` (the Alpine default) does not support `-z` and will cause the entrypoint to fail under
`set -e`.

---

### 6. `src/lib/auth.ts`

**What**: Add a Redis client singleton and two helper functions:
- `addToBlocklist(jti: string, ttl: number)` — adds a revoked JWT ID to the blocklist
- `isBlocklisted(jti: string)` — checks if a JWT ID is revoked

Also wire the `jwt` callback to write a short-lived "active session" key to Redis on every
successful auth (login), so the end-to-end test can confirm Redis has a session key.

**Why**: JWT + Redis token blocklist is the agreed strategy. Redis is not required for
correctness of the happy-path login flow, but the acceptance criterion is "Redis has session
key after login."

**Design**:
- Use `ioredis` (see package.json change below).
- The Redis client is created once (singleton pattern identical to `prisma` in `db.ts`).
- On login (when `user` is present in the `jwt` callback), write a key
  `session:{userId}` with the session payload and a TTL equal to the JWT `maxAge`.
- Add a `jti` (JWT ID) to every token; on the `authorized` callback (or a middleware check),
  check the blocklist. For this plan, the blocklist check middleware is added as a comment
  placeholder — full enforcement is tracked separately. The Redis write on login IS
  implemented.
- Guard Redis calls with try/catch so a Redis outage does not break auth.

**New file content** (`src/lib/auth.ts`):
```typescript
import { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { prisma } from './db';
import { redisClient } from './redis';

const SESSION_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password)
          throw new Error('Invalid credentials');
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { employee: { include: { company: true } } },
        });
        if (!user) throw new Error('No user found');
        const isValid = await compare(credentials.password, user.passwordHash);
        if (!isValid) throw new Error('Invalid password');
        return {
          id: user.id,
          email: user.email,
          name: user.employee
            ? `${user.employee.firstName} ${user.employee.lastName}`
            : user.email,
          role: user.role,
          employeeId: user.employee?.id,
          companyId: user.employee?.companyId ?? '',
        };
      },
    }),
  ],
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.companyId = user.companyId;
        token.employeeId = user.employeeId;
        // Cache active session in Redis for blocklist/audit support
        try {
          const redis = await redisClient();
          await redis.set(
            `session:${user.id}`,
            JSON.stringify({ companyId: user.companyId, role: user.role }),
            'EX',
            SESSION_TTL,
          );
        } catch {
          // Redis unavailable — auth still proceeds (non-blocking)
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? '';
        session.user.role = token.role as string;
        session.user.companyId = token.companyId as string;
        session.user.employeeId = token.employeeId as string | undefined;
      }
      return session;
    },
  },
  session: { strategy: 'jwt', maxAge: SESSION_TTL },
  secret: process.env.NEXTAUTH_SECRET,
};
```

---

### 7. `src/lib/redis.ts` (new file)

**What**: Create a Redis client singleton using `ioredis`.  
**Why**: Mirrors the `db.ts` singleton pattern; avoids creating a new connection on every
hot-reload in development.

```typescript
import Redis from 'ioredis';

const globalForRedis = global as unknown as { redis: Redis | undefined };

export async function redisClient(): Promise<Redis> {
  if (globalForRedis.redis) return globalForRedis.redis;
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
  await client.connect();
  // Store singleton on global unconditionally — not just in dev — so production
  // does not create a new Redis connection on every JWT auth callback invocation.
  // This mirrors the db.ts singleton pattern exactly.
  globalForRedis.redis = client;
  return client;
}

// Blocklist helpers
export async function addToBlocklist(jti: string, ttlSeconds: number): Promise<void> {
  const redis = await redisClient();
  await redis.set(`blocklist:${jti}`, '1', 'EX', ttlSeconds);
}

export async function isBlocklisted(jti: string): Promise<boolean> {
  const redis = await redisClient();
  const val = await redis.get(`blocklist:${jti}`);
  return val !== null;
}
```

Note: `ioredis` connects lazily when `lazyConnect: true`; `await client.connect()`
establishes the connection immediately so the first request is not delayed. The singleton
is stored unconditionally so production never spawns multiple connections.

---

### 8. `package.json`

**What**: Add `ioredis` as a runtime dependency; add `@types/ioredis` is not needed
(ioredis ships its own types since v5).  
**Why**: Required for the Redis client in `src/lib/redis.ts`.

**Change**: Add to `dependencies`:
```json
"ioredis": "^5.3.2"
```

Exact version is `^5.3.2` (current stable ioredis 5.x). Run `npm install ioredis` in the
worktree after editing `package.json` to update `package-lock.json`.

---

### 9. `tests/unit/routers/employee.router.test.ts`

**What**: Replace the SQLite file-based test database setup with a PostgreSQL setup that
reads from the `TEST_DATABASE_URL` environment variable.  
**Why**: The router integration test currently creates a temp SQLite file, runs
`prisma db push`, and tears it down. With PostgreSQL as the provider, a local Postgres
instance is required. The `TEST_DATABASE_URL` env var (e.g.,
`postgresql://dhibob:dhibob_secret@localhost:5432/dhibob_test`) is used both for the
`execSync` schema push and the `PrismaClient` datasource override.

**Changes**:

1. Remove import: `fs` only. **Keep `path`** — it is still used for `cwd: path.resolve(...)` in `execSync`.
2. Remove `TEST_DB_PATH` constant and the temp-file cleanup in `afterAll`
3. Use `process.env.TEST_DATABASE_URL` for the DSN
4. Rename the test case description for case-insensitivity to reflect Postgres behavior
5. Keep all 9 test assertions; they all still hold on Postgres
6. Add `deleteMany` truncation at the top of `beforeAll` so the test database is clean on every run (Postgres unique constraints will fail on a second run without this)

**New `beforeAll` / `afterAll`**:
```typescript
const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://dhibob:dhibob_secret@localhost:5432/dhibob_test';

beforeAll(async () => {
  execSync(`DATABASE_URL="${TEST_DB_URL}" npx prisma db push --skip-generate`, {
    cwd: path.resolve(__dirname, '../../../'),
    stdio: 'pipe',
  });

  db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

  // Clean slate for idempotent re-runs (Postgres unique constraints will fail without this)
  await db.employee.deleteMany({});
  await db.department.deleteMany({});
  await db.company.deleteMany({});

  // ... rest of seed unchanged (company, otherCompany, dept, emp, etc.)
}, 60000);

afterAll(async () => {
  await db.$disconnect();
  // No temp file to clean up
});
```

**Updated imports** (remove `fs`; keep `path` for `cwd` resolution):
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { employeeRouter } from '@/server/routers/employee'
import { execSync } from 'child_process'
import path from 'path'
```

**Updated test description** for case-insensitivity (line 124):
```
'search is case-insensitive (mode: insensitive on Postgres)'
```

---

### 10. `.env.example`

**What**: Update the example environment file to show PostgreSQL and Redis DSNs.  
**Why**: Developers cloning the repo need to know the required variables.

**New content**:
```
DATABASE_URL="postgresql://dhibob:dhibob_secret@localhost:5432/dhibob"
TEST_DATABASE_URL="postgresql://dhibob:dhibob_secret@localhost:5432/dhibob_test"
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000
REDIS_URL="redis://localhost:6379"
```

---

## Execution Order

The implementation agent MUST follow this order to avoid circular issues:

1. **`package.json`** — add `ioredis`; then run `npm install` to update `package-lock.json`
2. **`prisma/schema.prisma`** — change provider to `postgresql`
3. **`src/lib/redis.ts`** — create new file
4. **`src/lib/auth.ts`** — add Redis import and session write
5. **`src/server/routers/employee.ts`** — add `mode: 'insensitive'`
6. **`docker-compose.yml`** — replace with Postgres + Redis + app
7. **`Dockerfile`** — remove SQLite mkdir
8. **`docker-entrypoint.sh`** — add wait loop
9. **`tests/unit/routers/employee.router.test.ts`** — switch to `TEST_DATABASE_URL`
10. **`.env.example`** — update
11. **Run `npx prisma generate`** to regenerate the Prisma client for PostgreSQL

---

## Test Strategy (Already Approved)

- **JWT stays**: No changes to NextAuth session strategy
- **Redis**: Token blocklist via Redis; `session:{userId}` key written on login
- **Router integration test**: Uses `TEST_DATABASE_URL` env var pointing to a Postgres instance
- **Schema push**: `prisma db push` (not migrate)
- **Search**: `mode: 'insensitive'` in Postgres `contains` filters

---

## Acceptance Criteria

1. `npm test` (163 tests) all pass — no test deleted or weakened
2. `docker compose up --build` starts three healthy services: `postgres`, `redis`, `app`
3. After login, `redis-cli keys 'session:*'` returns at least one key
4. Employee search with mixed case returns correct results in Postgres
5. `npx prisma db push` succeeds against a running Postgres instance using `DATABASE_URL`

---

## Risk Notes

- **`nc` availability**: BusyBox `nc` is the default on `node:20-alpine` but does NOT support
  the `-z` flag used in the entrypoint wait loop. The Dockerfile explicitly installs
  `netcat-openbsd` (which does support `-z`) via `apk add --no-cache openssl netcat-openbsd`.
  This is already accounted for in the Dockerfile change (Step 4).
- **Seed idempotency**: `prisma/seed.ts` may fail if re-run against a populated DB (duplicate
  unique keys). The entrypoint always seeds on startup; consider adding
  `upsert`/`createOrSkip` guards. This is out of scope but worth noting.
- **ioredis `lazyConnect`**: With `lazyConnect: true`, calling `connect()` explicitly is
  required before the first command. The implementation in `redis.ts` above does this.
  Alternatively, omit `lazyConnect` (default is eager connect); both work.
- **Test isolation**: The router test does NOT drop/recreate the Postgres test database
  between runs. If tests share state across runs (e.g., duplicate email), add `TRUNCATE`
  calls at the start of `beforeAll` or use a unique suffix per run.

---

*Plan authored: 2026-04-01. Worktree: `postgres-redis-switch`.*
