# CI/CD Infrastructure Plan

## Context

DHiBob is a Next.js 14 / tRPC / Prisma HR platform deployed on a single EC2 instance via
Docker Compose (Postgres, Redis, app, Caddy). Today, deployment is fully manual: SSH into
the EC2, `git pull`, rebuild containers. There is no CI pipeline, no automated deployment,
no release versioning, and `npm run lint` prompts interactively because no `.eslintrc.json`
exists. Two test suites also fail on every run, which would block any CI gate.

This plan adds three GitHub Actions workflows (CI, CD, Release), a repo-level `deploy.sh`
that the CD workflow SSHs in to execute, an `.eslintrc.json` so lint runs non-interactively,
and fixes for the pre-existing test/build failures so the pipeline starts green.

---

## Current State (as of 2026-05-06)

| Area | Status |
|---|---|
| **Lint** | `npm run lint` (`next lint`) has no `.eslintrc.json` -- prompts interactively, unusable in CI |
| **Type check** | `npx tsc --noEmit` passes cleanly |
| **Build** | `next build` fails: `src/app/(dashboard)/org-chart-old/page.tsx` imports deleted modules (`@/lib/org-chart-utils`, `@/components/org-chart/employee-node`) |
| **Tests** | 2 of 60 test files fail (12 of 537 tests): `reports-page.test.tsx` (missing `getCustomReportData` + `getExpenseReport` mocks), `employee.router.test.ts` (needs live Postgres at localhost:5432, always fails in bare CI) |
| **Deploy** | Manual SSH + ad-hoc commands on EC2 |
| **Releases** | No tags, no changelog, no versioning |

---

## Deliverables

### 1. `.eslintrc.json` -- Make lint non-interactive

**File**: `.eslintrc.json` (new)

**What**: Create a static ESLint config so `next lint` never prompts. Extend `next/core-web-vitals`
(the "Strict" preset Next.js offers interactively) and set `ignoreDuringBuilds: false` in
`next.config.js` so lint errors surface during `next build` as well.

**Config**:
```json
{
  "extends": "next/core-web-vitals"
}
```

**Why**: Without this file, `next lint` enters an interactive wizard asking how to configure
ESLint, which hangs forever in CI. The config must exist before the CI workflow can gate on lint.

**Validation**: Run `npx next lint` locally -- it should complete with exit code 0 (or list
concrete lint errors to fix), not prompt.

---

### 2. Fix pre-existing failures so CI starts green

#### 2a. Build failure: `org-chart-old` imports missing modules

**File**: `src/app/(dashboard)/org-chart-old/page.tsx`

**Problem**: This page imports `@/lib/org-chart-utils` and `@/components/org-chart/employee-node`,
which no longer exist. The page itself is an old copy (the current org-chart lives at
`src/app/(dashboard)/org-chart/page.tsx`). It is already in the tsconfig `exclude` list, but
`next build` still picks it up via its own file discovery.

**Fix**: Delete the entire `src/app/(dashboard)/org-chart-old/` directory. It is dead code --
the active route is `/org-chart`, not `/org-chart-old`. Alternatively, add it to `.nextignore`
or rename it so Next.js does not treat it as a route (e.g., prefix with `_`). Deleting is
cleanest.

**Validation**: `npm run build` completes without the "Module not found" error.

#### 2b. Test failure: `reports-page.test.tsx` -- incomplete tRPC mock

**File**: `tests/unit/components/reports-page.test.tsx`

**Problem**: The test mocks 4 tRPC report hooks (`getTerminationReport`, `getActiveReport`,
`getSalaryReport`, `getTotalCostReport`), but the actual `ReportsPage` component calls 5
hooks. Two additional hooks were added to the component after the test was written:
- `trpc.reports.getCustomReportData.useQuery()`
- `trpc.reports.getExpenseReport.useQuery()`

When the component renders, it calls `useQuery` on these unmocked paths, which resolves to
`undefined`, causing `TypeError: Cannot read properties of undefined (reading 'useQuery')`.

**Fix**: Add the two missing hooks to the `vi.mock('@/lib/trpc', ...)` factory:
```typescript
vi.mock('@/lib/trpc', () => ({
  trpc: {
    reports: {
      getTerminationReport: { useQuery: vi.fn() },
      getActiveReport: { useQuery: vi.fn() },
      getSalaryReport: { useQuery: vi.fn() },
      getTotalCostReport: { useQuery: vi.fn() },
      getCustomReportData: { useQuery: vi.fn() },   // <-- add
      getExpenseReport: { useQuery: vi.fn() },       // <-- add
    },
  },
}));
```

Each mock `useQuery` should return `{ data: undefined, isLoading: false }` or a suitable
default (check what the existing mocks return in `beforeEach` and replicate). The exact
shape of the returned data should match what the component destructures.

**Validation**: `npx vitest run tests/unit/components/reports-page.test.tsx` -- all 10
tests pass.

#### 2c. Test failure: `employee.router.test.ts` -- requires live Postgres

**File**: `tests/unit/routers/employee.router.test.ts`

**Problem**: This integration test tries to `prisma db push` against
`postgresql://...@localhost:5432/dhibob_test` in `beforeAll`. In CI (and in any environment
without a local Postgres), this fails with `P1001: Can't reach database server`.

**Fix options** (choose one during implementation):

1. **Skip in CI without Postgres** -- Add a guard at the top of the test:
   ```typescript
   const canReachDb = (() => {
     try { execSync(`...`); return true; } catch { return false; }
   })();
   const describeOrSkip = canReachDb ? describe : describe.skip;
   ```
   This keeps the test useful locally while not blocking CI. Downside: reduced coverage in CI.

2. **Add a Postgres service container to CI** -- The CI workflow can spin up Postgres via
   `services:` and set `TEST_DATABASE_URL`. This is the recommended approach since the test
   already works if Postgres is available. It adds ~5s to CI startup.

**Recommendation**: Option 2. The CI workflow (Deliverable 3) should include a Postgres
service container. The test already respects `TEST_DATABASE_URL`, so no test code changes
are needed -- just wire the env var in the workflow.

**Validation**: `npx vitest run tests/unit/routers/employee.router.test.ts` passes when
Postgres is available at the configured URL.

---

### 3. GitHub Actions CI Workflow

**File**: `.github/workflows/ci.yml` (new)

**Triggers**: Every push to any branch, every pull request targeting `main`.

**Jobs**:

```
ci:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_DB: dhibob_test
        POSTGRES_USER: dhibob
        POSTGRES_PASSWORD: dhibob_secret
      ports:
        - 5432:5432
      options: >-
        --health-cmd "pg_isready -U dhibob"
        --health-interval 5s
        --health-timeout 5s
        --health-retries 10

  env:
    DATABASE_URL: postgresql://dhibob:dhibob_secret@localhost:5432/dhibob_test
    TEST_DATABASE_URL: postgresql://dhibob:dhibob_secret@localhost:5432/dhibob_test

  steps:
    - Checkout
    - Setup Node 20, cache node_modules (actions/setup-node with cache: npm)
    - npm ci
    - npx prisma generate
    - npm run lint               # gate 1: ESLint
    - npx tsc --noEmit           # gate 2: TypeScript
    - npm run test                # gate 3: Vitest (all 60 suites)
    - npm run build               # gate 4: Next.js production build
```

**Key decisions**:
- Postgres service container so `employee.router.test.ts` can run against a real DB.
- `prisma generate` is needed before lint/typecheck because the generated client types are
  imported everywhere.
- Build runs last (slowest step, ~30s); fail-fast on lint/types/tests first.
- Node 20 to match `Dockerfile` and `engines` (if added to package.json).

---

### 4. GitHub Actions CD Workflow -- Auto-deploy on merge to main

**File**: `.github/workflows/cd.yml` (new)

**Triggers**: Push to `main` branch only (fires after a PR merge).

**Condition**: Only runs after the CI workflow passes (use `needs: ci` if in the same file,
or use `workflow_run` to trigger after the CI workflow completes successfully). The simpler
approach: put CI and CD in separate files; CD uses a manual SSH step and runs only on
`push` to `main`.

**Steps**:
```
deploy:
  runs-on: ubuntu-latest
  if: github.ref == 'refs/heads/main'
  steps:
    - SSH into EC2 and run deploy.sh
      uses: appleboy/ssh-action@v1
      with:
        host: ${{ secrets.EC2_HOST }}
        username: ec2-user
        key: ${{ secrets.EC2_SSH_KEY }}
        script: |
          cd ~/dhibob
          bash deploy.sh
```

**Required GitHub Secrets**:
| Secret | Value |
|---|---|
| `EC2_HOST` | Elastic IP of the EC2 (e.g., `3.221.137.207`) |
| `EC2_SSH_KEY` | Contents of `~/.ssh/dhibob-deploy.pem` (the private key) |

**Why `appleboy/ssh-action`**: It is the most widely used GitHub Action for SSH deployment
(40k+ stars). It handles SSH key setup, known_hosts, and timeout. The alternative is raw
`ssh` commands with manual key file management, which is more error-prone.

**Security notes**:
- The SSH key should be scoped to `ec2-user` on the single EC2.
- Never store secrets in the workflow file itself -- only in GitHub Settings > Secrets.
- Consider adding `DEPLOY_LOCK` logic if concurrent deploys are a concern (unlikely on a
  single-instance setup).

---

### 5. `deploy.sh` -- EC2 Deployment Script

**File**: `deploy.sh` (new, at repo root)

**What the script does** (executed on the EC2 by the CD workflow):

```bash
#!/bin/bash
set -euo pipefail

APP_DIR="$HOME/dhibob"
COMPOSE_FILE="docker-compose.prod.yml"

echo "=== DHiBob Deploy ==="
date

# 1. Pull latest code
cd "$APP_DIR"
git pull --ff-only origin main

# 2. Rebuild containers (only rebuilds layers that changed)
docker builder prune -f --filter "until=72h"
docker compose -f "$COMPOSE_FILE" build --no-cache app

# 3. Apply database migrations
docker compose -f "$COMPOSE_FILE" run --rm app npx prisma migrate deploy

# 4. Restart with new image
docker compose -f "$COMPOSE_FILE" up -d app

# 5. Health check -- wait up to 60s for the app to respond
echo "Waiting for health check..."
for i in $(seq 1 12); do
  if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "Health check passed after $((i * 5))s"
    exit 0
  fi
  sleep 5
done

echo "ERROR: Health check failed after 60s"
docker compose -f "$COMPOSE_FILE" logs --tail=50 app
exit 1
```

**Key decisions**:
- `git pull --ff-only` -- refuses to merge if the local branch diverged (safety net).
- `docker builder prune -f --filter "until=72h"` -- cleans old build cache to prevent disk
  exhaustion on the t3.micro's 20 GB EBS. Keeps cache from last 72h for faster rebuilds.
- `--no-cache app` -- forces a full rebuild of the app image to pick up code changes. Without
  this, Docker might serve stale layers if only source files changed (COPY cache hit). This
  can be relaxed to just `build app` once the team trusts the cache invalidation.
- `prisma migrate deploy` -- applies any new migration files. This is safe to run even when
  no new migrations exist (it is a no-op).
- Health check polls `/api/health` (already exists at `src/app/api/health/route.ts`), which
  pings the database. If the app does not respond within 60s, the script fails and dumps
  recent container logs for debugging.
- Caddy is not restarted (it proxies to `app:3000` which Docker Compose restarts in-place).

**Rollback strategy** (manual, for now): If the deploy breaks, SSH in and run:
```bash
git checkout <previous-sha>
bash deploy.sh
```

---

### 6. GitHub Actions Release Workflow

**File**: `.github/workflows/release.yml` (new)

**Triggers**:
- **Tag push**: When a tag matching `v*` is pushed (e.g., `git tag v1.2.0 && git push --tags`).
- **Manual dispatch** (`workflow_dispatch`): Deploy without creating a version tag. Provides
  a "Deploy Now" button in the GitHub Actions UI with an optional `environment` input.

**Semantic versioning flow** (tag push path):
```
release:
  runs-on: ubuntu-latest
  permissions:
    contents: write
  steps:
    - Checkout with fetch-depth: 0 (need full history for changelog)
    - Generate changelog from commits since last tag
      (use git log --oneline $(git describe --tags --abbrev=0 HEAD~1 2>/dev/null || echo "")..HEAD)
    - Create GitHub Release with tag, changelog body, and mark as latest
      uses: softprops/action-gh-release@v2
      with:
        tag_name: ${{ github.ref_name }}
        body: <generated changelog>
        generate_release_notes: true
    - Deploy (same SSH step as CD workflow)
```

**Manual dispatch path** (deploy without tag):
```
on:
  workflow_dispatch:
    inputs:
      deploy_only:
        description: 'Deploy current main without tagging a release'
        type: boolean
        default: true

jobs:
  deploy:
    if: inputs.deploy_only
    # Same SSH deploy step as CD workflow
```

**Changelog generation**: Use `softprops/action-gh-release` with `generate_release_notes: true`,
which uses GitHub's auto-generated release notes based on PR titles and labels. This is
zero-config and produces good-enough changelogs for an internal tool. If richer changelogs
are needed later, switch to `conventional-changelog` or `release-please`.

**Versioning convention**: Follow semver manually via tag names. The team creates tags:
- `v1.0.0` -- initial tagged release
- `v1.1.0` -- new features (modules wired, new pages)
- `v1.1.1` -- bug fixes
- `v2.0.0` -- breaking changes (schema migrations that require data migration)

Future improvement: Automate version bumping with `release-please-action` based on
conventional commit prefixes (`feat:`, `fix:`, `feat!:`).

---

## Files Changed Summary

| File | Action | Purpose |
|---|---|---|
| `.eslintrc.json` | Create | Static ESLint config for non-interactive lint |
| `.github/workflows/ci.yml` | Create | CI pipeline: lint, typecheck, test, build |
| `.github/workflows/cd.yml` | Create | Auto-deploy to EC2 on push to main |
| `.github/workflows/release.yml` | Create | Semantic versioning + tagged releases + manual deploy |
| `deploy.sh` | Create | EC2 deployment script (pull, build, migrate, health check) |
| `src/app/(dashboard)/org-chart-old/` | Delete | Remove dead route that breaks `next build` |
| `tests/unit/components/reports-page.test.tsx` | Edit | Add missing tRPC mock hooks |

---

## Implementation Order

1. **Fix blockers first** -- Delete `org-chart-old`, fix `reports-page.test.tsx` mock, create
   `.eslintrc.json`. Validate locally: `npm run lint && npx tsc --noEmit && npm run test && npm run build`
   all pass.

2. **Create CI workflow** -- Push to a feature branch. Verify the workflow runs and goes green
   on the PR.

3. **Create `deploy.sh`** -- Test manually on the EC2 via SSH before wiring it to automation.

4. **Create CD workflow** -- Configure GitHub Secrets (`EC2_HOST`, `EC2_SSH_KEY`). Merge a
   test PR to main and verify auto-deployment fires.

5. **Create Release workflow** -- Push a `v1.0.0` tag and verify the GitHub Release is created
   with a changelog. Test the manual dispatch button.

---

## GitHub Secrets Required

These must be set in the GitHub repository settings (Settings > Secrets and variables > Actions)
before the CD and Release workflows will function:

| Secret | Description | How to obtain |
|---|---|---|
| `EC2_HOST` | Elastic IP address of the EC2 instance | `terraform output -raw public_ip` or check AWS Console |
| `EC2_SSH_KEY` | Private SSH key for `ec2-user` on the EC2 | Contents of `~/.ssh/dhibob-deploy.pem` |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| SSH key rotation | CD/Release workflows break | Document key rotation procedure; use short-lived keys or AWS SSM Session Manager in the future |
| EC2 disk fills up | Deploy fails | `deploy.sh` prunes Docker build cache older than 72h; add a disk usage check |
| Concurrent deploys | Corrupted state | Single-instance setup makes this unlikely; add a file lock in `deploy.sh` if needed |
| Long build time on t3.micro | Deploy takes 5-8 min | Acceptable for now; future: build image in CI and push to ECR, EC2 just pulls |
| Flaky tests block deploys | Frustrated team | Keep test suite deterministic; the `employee.router.test.ts` fix (Postgres service in CI) eliminates the main flaky test |

---

## Future Improvements (Out of Scope)

- **Build image in CI, push to ECR**: Instead of building on the EC2, build in the CI
  workflow and push to Amazon ECR. The deploy script then does `docker compose pull && docker compose up -d`.
  This is faster, more reliable, and enables multi-instance deployments.
- **Staging environment**: Add a staging EC2 that deploys on every PR merge, with production
  deploying only on tagged releases.
- **Database backup before deploy**: Add a `pg_dump` step to `deploy.sh` before `prisma migrate deploy`.
- **Slack/email deploy notifications**: Post to a Slack channel when a deploy starts/finishes.
- **`release-please` for automated versioning**: Parses conventional commits and auto-creates
  version bump PRs with changelogs.
- **Branch protection rules**: Require CI to pass before merging PRs to main.
