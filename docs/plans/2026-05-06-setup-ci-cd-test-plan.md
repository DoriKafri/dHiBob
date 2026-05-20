# CI/CD Infrastructure — Test Plan

## Strategy Reconciliation

The agreed testing strategy proposed 17 tests across 3 files:

- **Workflow validation** (10 tests): YAML validity, correct triggers, required steps/secrets, Node version
- **Deploy script** (5 tests): Shebang, git pull, docker compose, health check
- **ESLint config** (2 tests): Config exists, extends next/core-web-vitals

After reading the implementation plan, the strategy holds with minor adjustments:

1. The plan creates 3 workflow files (ci.yml, cd.yml, release.yml) — the workflow validation tests should cover all three, not just one generic "workflow". This increases the workflow validation tests slightly.
2. The plan includes fixing `reports-page.test.tsx` and deleting `org-chart-old/` as pre-requisites for CI to go green. These are regression/integration fixes — we verify them by running the existing test suite and build, not by writing new tests about them.
3. The `employee.router.test.ts` fix (Postgres in CI) is a CI workflow concern, tested by verifying the workflow YAML includes a postgres service with the correct env vars.
4. The deploy script in the plan references `docker-compose.prod.yml` — the test should validate this, not just "docker compose".

No cost or scope changes relative to the agreed strategy. Proceeding.

---

## Test Plan

### Test file 1: `tests/unit/infra/workflow-validation.test.ts`

Tests use the **file-content inspection harness**: read YAML files from disk with `fs.readFileSync`, parse with `yaml` (or `js-yaml`) package, and assert on the parsed structure. No network, no Docker, no GitHub API — purely structural validation that the workflow files are correct before they hit GitHub.

---

**T-01: CI workflow file is valid YAML with correct structure**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection (read `.github/workflows/ci.yml`, parse as YAML)
- **Preconditions**: `.github/workflows/ci.yml` exists in the repo
- **Actions**: Read the file, parse YAML, inspect the `on`, `jobs` top-level keys
- **Expected outcome**: File parses without error. Has `on` with `push` and `pull_request` triggers. Has at least one job. Source of truth: implementation plan section 3 (CI triggers: "Every push to any branch, every pull request targeting main").
- **Interactions**: None

**T-02: CI workflow triggers on push and pull_request to main**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection
- **Preconditions**: `.github/workflows/ci.yml` exists and parses as valid YAML
- **Actions**: Parse YAML, inspect `on.push` and `on.pull_request` keys
- **Expected outcome**: `on.push` is present (branches can be any or unspecified). `on.pull_request` is present and includes `main` in its branches list (or is unfiltered, which means all branches including main). Source of truth: plan section 3 ("Every push to any branch, every pull request targeting main").
- **Interactions**: None

**T-03: CI workflow includes lint, typecheck, test, and build steps**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection
- **Preconditions**: CI workflow exists
- **Actions**: Parse YAML, extract all `run:` values from the job steps
- **Expected outcome**: The concatenated run commands contain all four gates: a command matching `lint` (e.g., `npm run lint` or `next lint`), a command matching `tsc` (e.g., `npx tsc --noEmit`), a command matching `test` (e.g., `npm run test` or `vitest`), a command matching `build` (e.g., `npm run build` or `next build`). Source of truth: plan section 3 (gate 1-4: lint, TypeScript, Vitest, Next.js build).
- **Interactions**: None

**T-04: CI workflow uses Node 20**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection
- **Preconditions**: CI workflow exists
- **Actions**: Parse YAML, find the `actions/setup-node` step, inspect `with.node-version`
- **Expected outcome**: Node version is `20` or `20.x` or starts with `20`. Source of truth: plan section 3 ("Node 20 to match Dockerfile").
- **Interactions**: None

**T-05: CI workflow includes Postgres service for integration tests**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection
- **Preconditions**: CI workflow exists
- **Actions**: Parse YAML, inspect `jobs.*.services`
- **Expected outcome**: At least one service uses a postgres image (image name contains `postgres`). The service has a port mapping that includes `5432`. Source of truth: plan section 3 ("Postgres service container so employee.router.test.ts can run against a real DB") and section 2c.
- **Interactions**: None

**T-06: CI workflow sets DATABASE_URL and TEST_DATABASE_URL environment variables**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection
- **Preconditions**: CI workflow exists
- **Actions**: Parse YAML, inspect job-level or step-level `env` blocks
- **Expected outcome**: Both `DATABASE_URL` and `TEST_DATABASE_URL` are set in the env, and both contain `postgresql://` connection strings referencing port 5432. Source of truth: plan section 3 (env block listing both variables).
- **Interactions**: None

**T-07: CI workflow runs prisma generate before lint/typecheck**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection
- **Preconditions**: CI workflow exists
- **Actions**: Parse YAML, extract ordered list of step names or run commands from the CI job
- **Expected outcome**: A step containing `prisma generate` appears before any step containing `lint`, `tsc`, `test`, or `build`. Source of truth: plan section 3 ("prisma generate is needed before lint/typecheck because the generated client types are imported everywhere").
- **Interactions**: None

**T-08: CD workflow deploys only on push to main**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection (read `.github/workflows/cd.yml`)
- **Preconditions**: `.github/workflows/cd.yml` exists
- **Actions**: Parse YAML, inspect triggers and job conditions
- **Expected outcome**: Trigger includes `push` with `branches: [main]` (or the job has an `if` condition checking `github.ref == 'refs/heads/main'`). Source of truth: plan section 4 ("Push to main branch only").
- **Interactions**: None

**T-09: CD workflow references required secrets for SSH deployment**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection
- **Preconditions**: CD workflow exists
- **Actions**: Read the raw YAML text, search for secret references
- **Expected outcome**: The file contains references to `secrets.EC2_HOST` and `secrets.EC2_SSH_KEY` (or equivalent names). Source of truth: plan section 4 (required GitHub Secrets table).
- **Interactions**: None

**T-10: Release workflow supports both tag push and manual dispatch**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection (read `.github/workflows/release.yml`)
- **Preconditions**: `.github/workflows/release.yml` exists
- **Actions**: Parse YAML, inspect `on` triggers
- **Expected outcome**: `on.push.tags` is present (matching `v*` or similar pattern). `on.workflow_dispatch` is present. Source of truth: plan section 6 ("Tag push: When a tag matching v* is pushed" and "Manual dispatch: Deploy without creating a version tag").
- **Interactions**: None

**T-11: Release workflow creates a GitHub Release on tag push**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection
- **Preconditions**: Release workflow exists
- **Actions**: Read the raw YAML text, search for the release action
- **Expected outcome**: The file references `softprops/action-gh-release` (or `actions/create-release`, or similar release-creation action). Source of truth: plan section 6 ("uses: softprops/action-gh-release@v2").
- **Interactions**: None

---

### Test file 2: `tests/unit/infra/deploy-script.test.ts`

Tests use the **file-content inspection harness**: read `deploy.sh` as text, inspect its content for required commands and structure.

---

**T-12: deploy.sh exists and has a proper shebang**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection (read `deploy.sh`)
- **Preconditions**: `deploy.sh` exists at repo root
- **Actions**: Read the file, inspect the first line
- **Expected outcome**: First line is `#!/bin/bash` or `#!/usr/bin/env bash`. Source of truth: plan section 5 (script starts with `#!/bin/bash`).
- **Interactions**: None

**T-13: deploy.sh pulls latest code with --ff-only**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection
- **Preconditions**: `deploy.sh` exists
- **Actions**: Read the file content
- **Expected outcome**: Script contains `git pull --ff-only` (or `git pull` with `--ff-only` flag). Source of truth: plan section 5 ("git pull --ff-only origin main — refuses to merge if the local branch diverged").
- **Interactions**: None

**T-14: deploy.sh rebuilds Docker containers**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection
- **Preconditions**: `deploy.sh` exists
- **Actions**: Read the file content
- **Expected outcome**: Script contains a `docker compose` (or `docker-compose`) command with `build` in it. Source of truth: plan section 5 (step 2: "Rebuild containers").
- **Interactions**: None

**T-15: deploy.sh runs Prisma migrations**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection
- **Preconditions**: `deploy.sh` exists
- **Actions**: Read the file content
- **Expected outcome**: Script contains a command with `prisma` and `migrate` (e.g., `prisma migrate deploy` or `prisma db push`). Source of truth: plan section 5 (step 3: "Apply database migrations").
- **Interactions**: None

**T-16: deploy.sh includes a health check**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection
- **Preconditions**: `deploy.sh` exists
- **Actions**: Read the file content
- **Expected outcome**: Script contains `curl` referencing `/api/health` or a similar health endpoint, and exits with a non-zero code if the health check fails. Source of truth: plan section 5 (step 5: "Health check — wait up to 60s for the app to respond").
- **Interactions**: None

---

### Test file 3: `tests/unit/infra/eslint-config.test.ts`

Tests use the **file-content inspection harness**: read `.eslintrc.json` from disk and inspect its content.

---

**T-17: ESLint config exists and extends next/core-web-vitals**
- **Type**: integration
- **Disposition**: new
- **Harness**: File-content inspection (read `.eslintrc.json`, parse as JSON)
- **Preconditions**: `.eslintrc.json` exists at repo root
- **Actions**: Read the file, parse JSON, inspect the `extends` field
- **Expected outcome**: `extends` is `"next/core-web-vitals"` or an array containing `"next/core-web-vitals"`. Source of truth: plan section 1 (config content: `{"extends": "next/core-web-vitals"}`).
- **Interactions**: None

**T-18: ESLint config is valid JSON**
- **Type**: boundary
- **Disposition**: new
- **Harness**: File-content inspection
- **Preconditions**: `.eslintrc.json` exists
- **Actions**: Read the file, attempt `JSON.parse()`
- **Expected outcome**: Parsing succeeds without throwing. Source of truth: ESLint requires valid JSON configuration files.
- **Interactions**: None

---

### Regression verification (not new tests — existing suite)

**T-R1: reports-page.test.tsx passes after mock fix**
- **Type**: regression
- **Disposition**: extend (fix existing test's mock, re-run existing 10 tests)
- **Harness**: Vitest (existing `tests/unit/components/reports-page.test.tsx`)
- **Preconditions**: Missing tRPC mock hooks (`getCustomReportData`, `getExpenseReport`) have been added per plan section 2b
- **Actions**: Run `npx vitest run tests/unit/components/reports-page.test.tsx`
- **Expected outcome**: All 10 tests pass. Source of truth: the existing test assertions remain unchanged; only the mock setup is extended to include hooks the component now calls.
- **Interactions**: Validates that the component renders without `TypeError` from unmocked tRPC hooks.

**T-R2: Next.js production build succeeds after org-chart-old deletion**
- **Type**: regression
- **Disposition**: existing
- **Harness**: `npm run build` (command-line)
- **Preconditions**: `src/app/(dashboard)/org-chart-old/` directory has been deleted per plan section 2a
- **Actions**: Run `npm run build`
- **Expected outcome**: Build completes with exit code 0. No "Module not found" error for `@/lib/org-chart-utils` or `@/components/org-chart/employee-node`. Source of truth: plan section 2a ("next build" was failing because of imports to deleted modules).
- **Interactions**: Full production build validates that no other deleted-module imports exist.

**T-R3: Full test suite passes (including employee.router.test.ts with Postgres)**
- **Type**: regression
- **Disposition**: existing
- **Harness**: `npm run test` with Postgres available
- **Preconditions**: Postgres running on localhost:5432, `TEST_DATABASE_URL` set
- **Actions**: Run `npm run test`
- **Expected outcome**: All test files pass (0 failures). Source of truth: the full existing test suite represents the project's quality baseline.
- **Interactions**: Exercises the full tRPC/Prisma stack for employee router integration tests.

---

## Coverage Summary

### Covered

| Area | Tests | What's proven |
|------|-------|---------------|
| CI workflow structure | T-01 through T-07 | Valid YAML, correct triggers, 4 gates (lint/typecheck/test/build), Node 20, Postgres service, env vars, prisma generate ordering |
| CD workflow | T-08, T-09 | Deploy-on-main-only trigger, required SSH secrets |
| Release workflow | T-10, T-11 | Dual trigger (tag + manual dispatch), release action |
| Deploy script | T-12 through T-16 | Shebang, git pull --ff-only, docker build, prisma migrate, health check |
| ESLint config | T-17, T-18 | Valid JSON, extends next/core-web-vitals |
| Pre-existing fix regression | T-R1, T-R2, T-R3 | Reports test mock, build after org-chart-old deletion, full suite green |

### Explicitly Excluded (per agreed strategy)

| Area | Reason | Risk |
|------|--------|------|
| Actually running workflows on GitHub | Requires push to a GitHub repo with Actions enabled and secrets configured — cannot be tested locally | Medium: YAML structure tests catch most errors but won't catch GitHub Actions runtime issues (e.g., wrong action version, permission errors). Mitigated by testing the first real push carefully. |
| E2E deploy testing | Requires SSH access to the EC2 instance | Low: deploy.sh is a simple sequential script; structure tests catch missing steps |
| GitHub secrets configuration | Manual step in GitHub UI | Low: documented in the plan; workflow tests verify secret references exist |
| Caddy/reverse proxy behavior | Out of scope per plan (Caddy is not restarted during deploy) | None for this task |
