# Test Plan: Switch SQLite → PostgreSQL + Add Redis Session Cache

_Authored: 2026-04-01. Worktree: `postgres-redis-switch`._

---

## Overview

This plan covers every test file touched by the `postgres-redis-switch` implementation plan.
The total test count that must pass when the implementation is complete is **163**.

All 163 tests were green on the `main` branch prior to this work (including
`analytics.test.ts` and `hiring.test.ts`, which were fixed in an earlier commit on this
branch and are confirmed passing).

---

## Test Classification Legend

- **REGRESSION** — test existed before this change; it must stay green; the assertion logic
  does not change (only infra/setup may change).
- **MODIFIED** — file is edited; test assertions stay the same but setup code changes to use
  Postgres instead of SQLite.
- **NEW** — test that did not exist before; it must go green as part of this implementation.

---

## Test Files

### 1. `tests/unit/services/analytics.test.ts`

**Status**: REGRESSION (no changes to this file)
**Classification**: Pure-logic unit tests; no DB or Redis dependency.

| # | Test name | Asserts |
|---|-----------|---------|
| 1 | `calculateHeadcount() › should count only ACTIVE employees` | `filter(status === 'ACTIVE').length === 3` |
| 2 | `calculateHeadcount() › should count terminated employees` | `filter(status === 'TERMINATED').length === 1` |
| 3 | `calculateHeadcount() › should handle empty array` | returns `0` |
| 4 | `calculateHeadcount() › should handle missing status` | returns `0` for unknown status |
| 5 | `calculateHeadcount() › should count all employees with no filter` | `activeCount <= total` |
| 6 | `calculateGrowthRate() › should calculate positive growth` | `(120-100)/100 * 100 === 20` |
| 7 | `calculateGrowthRate() › should calculate negative growth` | `(80-100)/100 * 100 === -20` |
| 8 | `calculateGrowthRate() › should return 0 for no growth` | identical headcounts → `0` |
| 9 | `calculateGrowthRate() › should return 0 for zero previous headcount` | divide-by-zero guard → `0` |
| 10 | `calculateGrowthRate() › should handle large growth` | `(1000-100)/100*100 === 900` |
| 11 | `calculateGrowthRate() › should handle decimal growth` | `5` |
| 12 | `calculateGrowthRate() › should round to 2 decimal places` | `rate % 1 <= 0.01` |
| 13 | `calculateAttritionRate() › should calculate attrition rate` | `10/100*100 === 10` |
| 14 | `calculateAttritionRate() › should return 0 for no attrition` | `0` terminations → `0` |
| 15 | `calculateAttritionRate() › should return 0 for zero headcount` | divide-by-zero guard → `0` |
| 16 | `calculateAttritionRate() › should handle 100% attrition` | `100/100*100 === 100` |
| 17 | `calculateAttritionRate() › should handle decimal attrition` | `5` |
| 18 | `calculateAttritionRate() › should handle small attrition rates` | `1/500*100 === 0.2` |
| 19 | `calculateDepartmentBreakdown() › should group by department` | Engineering=3, Sales=1, HR=1 |
| 20 | `calculateDepartmentBreakdown() › should filter by status` | only ACTIVE: Engineering=2 |
| 21 | `calculateDepartmentBreakdown() › should handle empty breakdown` | `{}` |
| 22 | `calculateDepartmentBreakdown() › should count all employees without filter` | sum equals total |
| 23 | `calculateDepartmentBreakdown() › should handle single department` | 1 key, count=2 |
| 24 | `calculateAverageHeadcount() › should calculate average of start and end` | `(100+120)/2 === 110` |
| 25 | `calculateAverageHeadcount() › should handle equal values` | `100` |
| 26 | `calculateAverageHeadcount() › should round to 2 decimal places` | `isFinite(result)` |
| 27 | `calculateAverageHeadcount() › should handle decimal values` | `(100.5+110.5)/2 === 105.5` |
| 28 | `calculateAverageHeadcount() › should handle large numbers` | `(10000+12000)/2 === 11000` |
| 29 | `calculateTenureDistribution() › should calculate tenure distribution` | `0-1`, `1-3`, `5+` all > 0 |
| 30 | `calculateTenureDistribution() › should classify new hires (0-1 years)` | hire Jan 2024 → `0-1` = 1 |
| 31 | `calculateTenureDistribution() › should classify mid-tenure employees (1-3 years)` | hire Jan 2022 → `1-3` > 0 |
| 32 | `calculateTenureDistribution() › should classify senior employees (5+ years)` | hire Jan 2018 → `5+` = 1 |
| 33 | `calculateTenureDistribution() › should handle empty list` | all buckets sum to 0 |
| 34 | `calculateDiversityMetrics() › should calculate gender distribution` | M=3, F=2 |
| 35 | `calculateDiversityMetrics() › should calculate ethnicity distribution` | Asian=2, Hispanic=1 |
| 36 | `calculateDiversityMetrics() › should handle missing diversity data` | empty distributions |
| 37 | `calculateDiversityMetrics() › should handle partial diversity data` | M=1, Asian=1 |
| 38 | `calculateHiringRate() › should calculate hiring rate` | `12/100*100 === 12` |
| 39 | `calculateHiringRate() › should return 0 for no hires` | `0` |
| 40 | `calculateHiringRate() › should return 0 for zero headcount` | divide-by-zero guard → `0` |
| 41 | `calculateHiringRate() › should handle high hiring rate` | `50` |
| 42 | `calculateHiringRate() › should handle small hiring rate` | `1/500*100 === 0.2` |
| 43 | `Analytics edge cases › should handle large organization` | 5000 employees; activeCount > 4800; 20 dept keys |
| 44 | `Analytics edge cases › should handle rapid growth` | `(100-10)/10*100 === 900` |
| 45 | `Analytics edge cases › should handle rapid decline` | `(10-100)/100*100 === -90` |
| 46 | `Analytics edge cases › should handle zero-growth scenarios` | `0` |
| 47 | `Analytics edge cases › should combine multiple metrics` | active=3, breakdown has 2 keys, terminated=1 |

**Total**: 47 tests

---

### 2. `tests/unit/services/hiring.test.ts`

**Status**: REGRESSION (no changes to this file)
**Classification**: Pure-logic unit tests; no DB or Redis dependency.

| # | Test name | Asserts |
|---|-----------|---------|
| 1 | `validateStageTransition() › should allow APPLIED to SCREENING` | returns `true` |
| 2 | `validateStageTransition() › should allow APPLIED to REJECTED` | returns `true` |
| 3 | `validateStageTransition() › should reject APPLIED to OFFER` | returns `false` |
| 4 | `validateStageTransition() › should allow SCREENING to PHONE` | returns `true` |
| 5 | `validateStageTransition() › should reject SCREENING to APPLIED` | returns `false` |
| 6 | `validateStageTransition() › should allow PHONE to INTERVIEW` | returns `true` |
| 7 | `validateStageTransition() › should allow INTERVIEW to OFFER` | returns `true` |
| 8 | `validateStageTransition() › should allow OFFER to HIRED` | returns `true` |
| 9 | `validateStageTransition() › should reject HIRED transitions` | HIRED→APPLIED and HIRED→REJECTED both `false` |
| 10 | `validateStageTransition() › should reject REJECTED transitions` | REJECTED→SCREENING is `false` |
| 11 | `validateStageTransition() › should not allow skipping stages` | APPLIED→INTERVIEW and APPLIED→HIRED both `false` |
| 12 | `moveCandidate() › should move candidate to new valid stage` | `result.stage === 'SCREENING'` |
| 13 | `moveCandidate() › should throw error for invalid transition` | throws `'Invalid transition'` |
| 14 | `moveCandidate() › should record who moved candidate` | `lastMovedBy === 'user-456'` |
| 15 | `moveCandidate() › should set timestamp of move` | `lastMovedAt instanceof Date` |
| 16 | `moveCandidate() › should preserve existing notes and add new ones` | notes contains both old and new text |
| 17 | `moveCandidate() › should allow moving through pipeline` | sequential SCREENING→PHONE→INTERVIEW succeeds |
| 18 | `moveCandidate() › should reject invalid rejection from SCREENING` | SCREENING→REJECTED results in `stage === 'REJECTED'` |
| 19 | `calculateCandidateScore() › should average multiple ratings` | `(80+90+70)/3 === 80` |
| 20 | `calculateCandidateScore() › should normalize different max scores` | `(100+75)/2 === 88` (rounded) |
| 21 | `calculateCandidateScore() › should return 0 for empty ratings` | `0` |
| 22 | `calculateCandidateScore() › should handle single rating` | `8/10*100 === 80` |
| 23 | `calculateCandidateScore() › should round to nearest integer` | `Number.isInteger(score)` |
| 24 | `aggregateInterviewScores() › should calculate average of multiple interviews` | averageScore = 80 |
| 25 | `aggregateInterviewScores() › should normalize different rating scales` | `(80+90)/2 === 85` |
| 26 | `aggregateInterviewScores() › should return 0 for empty interviews` | both values = 0 |
| 27 | `aggregateInterviewScores() › should handle single interview` | averageScore = 80 |
| 28 | `aggregateInterviewScores() › should return both average and normalized scores` | both properties defined |
| 29 | `evaluateCandidateQuality() › should rate 90+ as EXCEPTIONAL` | 95 and 100 → `'EXCEPTIONAL'` |
| 30 | `evaluateCandidateQuality() › should rate 75-89 as STRONG` | 75, 85, 89 → `'STRONG'` |
| 31 | `evaluateCandidateQuality() › should rate 60-74 as ACCEPTABLE` | 60, 70 → `'ACCEPTABLE'` |
| 32 | `evaluateCandidateQuality() › should rate below 60 as NEEDS_IMPROVEMENT` | 50, 0 → `'NEEDS_IMPROVEMENT'` |
| 33 | `evaluateCandidateQuality() › should handle boundary values` | 90=EXCEPTIONAL, 89.9=STRONG, 75=STRONG, 74.9=ACCEPTABLE |
| 34 | `createCandidate() › should create candidate with valid data` | `stage === 'APPLIED'`, `firstName === 'Jane'` |
| 35 | `createCandidate() › should throw error for missing first name` | throws `'First name required'` |
| 36 | `createCandidate() › should throw error for missing last name` | throws `'Last name required'` |
| 37 | `createCandidate() › should throw error for invalid email` | throws `'Valid email required'` |
| 38 | `createCandidate() › should throw error for missing position` | throws `'Position required'` |
| 39 | `createCandidate() › should generate unique candidate ID` | two calls produce different IDs |
| 40 | `createCandidate() › should start with APPLIED stage` | `stage === 'APPLIED'` |
| 41 | `Hiring pipeline edge cases › should allow candidate to move from OFFER to HIRED` | `stage === 'HIRED'` |
| 42 | `Hiring pipeline edge cases › should prevent moving from HIRED` | throws on any transition |
| 43 | `Hiring pipeline edge cases › should track multiple stage transitions` | notes contain `'Step 4'`, stage=OFFER |
| 44 | `Hiring pipeline edge cases › should handle rejection at any stage` | REJECTED stage after any valid rejection |

**Total**: 44 tests

---

### 3. `tests/unit/services/employee.test.ts`

**Status**: REGRESSION (no changes to this file)
**Classification**: Pure-logic unit tests; mocks `@/server/db` via `vi.mock`; no DB or Redis dependency.

| # | Test name | Asserts |
|---|-----------|---------|
| 1 | `createEmployee() › should create employee with valid data` | `firstName === 'John'`, `status === 'ACTIVE'` |
| 2 | `createEmployee() › should throw error for missing first name` | throws `'First name is required'` |
| 3 | `createEmployee() › should throw error for missing last name` | throws `'Last name is required'` |
| 4 | `createEmployee() › should throw error for invalid email` | throws `'Valid email is required'` |
| 5 | `createEmployee() › should throw error for missing department` | throws `'Department is required'` |
| 6 | `createEmployee() › should throw error for duplicate email` | throws `'Employee with this email already exists'` |
| 7 | `createEmployee() › should return employee with generated ID` | `id` defined, starts with `emp-` |
| 8 | `createEmployee() › should set creation timestamp` | `createdAt instanceof Date` |
| 9 | `filterEmployees() › should filter by department` | Engineering employees = 2 |
| 10 | `filterEmployees() › should filter by status` | ACTIVE = 2 |
| 11 | `filterEmployees() › should filter by hire date range` | count > 0 within 2023 |
| 12 | `filterEmployees() › should combine multiple filters` | Engineering + ACTIVE = 1 (John) |
| 13 | `filterEmployees() › should return all when no filters` | length = 3 |
| 14 | `filterEmployees() › should return empty for no matches` | Marketing = 0 |
| 15 | `searchEmployees() › should search by first name` | 'John' matches 2 records |
| 16 | `searchEmployees() › should search by last name` | 'Smith' = 1 |
| 17 | `searchEmployees() › should search by email` | 'jane' = 1 |
| 18 | `searchEmployees() › should be case insensitive` | 'JOHN' matches > 0 |
| 19 | `searchEmployees() › should return empty for no matches` | 'NonExistent' = 0 |
| 20 | `searchEmployees() › should handle partial matches` | 'jo' > 0 |
| 21 | `paginateResults() › should return first page without cursor` | 10 items, cursor='10', hasMore=true |
| 22 | `paginateResults() › should return correct page with cursor` | cursor='10' returns items 11-20 |
| 23 | `paginateResults() › should indicate no next page` | cursor='20', 5 items, hasMore=false |
| 24 | `paginateResults() › should handle custom page size` | pageSize=5, cursor='5' |
| 25 | `paginateResults() › should handle small dataset` | 1 item, hasMore=false |
| 26 | `paginateResults() › should handle empty array` | 0 items, hasMore=false |
| 27 | `terminateEmployee() › should update status to TERMINATED` | `status === 'TERMINATED'` |
| 28 | `terminateEmployee() › should set end date` | `endDate` equals provided date |
| 29 | `terminateEmployee() › should set termination reason` | `terminationReason === 'Layoff'` |
| 30 | `terminateEmployee() › should preserve other properties` | `firstName` and `email` unchanged |
| 31 | `terminateEmployee() › should handle different reasons` | Resignation, Layoff, Retirement each set correctly |
| 32 | `Employee validation edge cases › should trim whitespace from name fields` | does not throw for padded names |
| 33 | `Employee validation edge cases › should validate email with plus addressing` | `john+tag@` does not throw |
| 34 | `Employee validation edge cases › should require valid department` | empty dept throws `'Department is required'` |

**Total**: 34 tests

---

### 4. `tests/unit/auth/auth-session.test.ts`

**Status**: REGRESSION (no changes to this file)
**Classification**: Pure-logic unit tests; mirrors auth callback logic inline; no DB or Redis
dependency.

| # | Test name | Asserts |
|---|-----------|---------|
| 1 | `Auth callbacks › jwt callback preserves companyId from user object` | `companyId`, `role`, `employeeId` forwarded to token |
| 2 | `Auth callbacks › jwt callback with no user leaves token unchanged` | token fields unchanged when `user` absent |
| 3 | `Auth callbacks › session callback copies companyId from token to session.user` | `session.user.companyId`, `id`, `role` all set |
| 4 | `Auth callbacks › session callback sets empty string when sub is missing` | `session.user.id === ''` |

**Total**: 4 tests

---

### 5. `tests/unit/routers/employee.router.test.ts`

**Status**: MODIFIED — this file is edited as part of the implementation (file path unchanged;
test assertions unchanged; only DB setup/teardown code changes from SQLite to PostgreSQL).

**What changes in this file**:
- Remove `import fs from 'fs'`
- Remove `const TEST_DB_PATH = ...` (SQLite temp file path)
- Replace `TEST_DB_URL` to read from `process.env.TEST_DATABASE_URL` with a Postgres DSN
  fallback
- Add `db.employee.deleteMany({})`, `db.department.deleteMany({})`,
  `db.company.deleteMany({})` at the top of `beforeAll` for idempotent re-runs
- Remove `fs.unlinkSync` temp-file cleanup from `afterAll`
- Update test description for case-insensitivity test (see row 4 below) to reflect Postgres
  `mode: 'insensitive'` behavior

| # | Test name (after rename where noted) | Asserts | Classification |
|---|--------------------------------------|---------|----------------|
| 1 | `employeeRouter.list › returns only employees from the caller company` | result has 2 employees, all with caller's `companyId` | REGRESSION |
| 2 | `employeeRouter.list › returns correct fields including manager relation` | Alice found; `firstName`, `lastName`, `manager` key present | REGRESSION |
| 3 | `employeeRouter.list › filters by search string (partial first name match)` | search='ali' → 1 result, Alice | REGRESSION |
| 4 | `employeeRouter.list › search is case-insensitive (mode: insensitive on Postgres)` _(renamed from SQLite description)_ | search='ALI' → 1 result (Postgres `ILIKE` via `mode: 'insensitive'`) | MODIFIED |
| 5 | `employeeRouter.list › search by email works` | search='bob@test' → 1 result, Bob | REGRESSION |
| 6 | `employeeRouter.list › returns empty results for search with no match` | search='zzznomatch' → 0 results, no cursor | REGRESSION |
| 7 | `employeeRouter.list › paginates correctly with limit` | limit=1 page1 has nextCursor; page2 has different employee | REGRESSION |
| 8 | `employeeRouter.list › returns all when limit is large enough` | limit=100 → 2 employees, no cursor | REGRESSION |
| 9 | `employeeRouter.getById › returns the employee with relations when found` | `id`, `firstName`, `companyId` match; `directReports` is array | REGRESSION |
| 10 | `employeeRouter.getById › throws NOT_FOUND for non-existent employee` | throws `'Employee not found'` | REGRESSION |
| 11 | `employeeRouter.getById › throws FORBIDDEN when employee belongs to different company` | throws `'You do not have access to this employee'` | REGRESSION |

**Total**: 11 tests

**Key pre-condition**: `TEST_DATABASE_URL` environment variable must be set to a running
Postgres instance before running this file. Without it, the test falls back to
`postgresql://dhibob:dhibob_secret@localhost:5432/dhibob_test`. The `beforeAll` timeout is
60 seconds to allow `prisma db push` to complete.

---

### 6. `tests/unit/lib/redis.test.ts` (NEW FILE)

**Status**: NEW — must go green as part of this implementation.
**Classification**: Unit tests for the new `src/lib/redis.ts` module.
These tests mock `ioredis` to avoid requiring a live Redis instance in the unit test suite.

| # | Test name | Asserts |
|---|-----------|---------|
| 1 | `redisClient() › returns a Redis instance` | resolves to a truthy object |
| 2 | `redisClient() › reuses singleton on second call` | two calls return the same object reference |
| 3 | `redisClient() › uses REDIS_URL env var when set` | `new Redis` called with the env var value |
| 4 | `redisClient() › falls back to redis://localhost:6379 when REDIS_URL is absent` | `new Redis` called with fallback URL |
| 5 | `addToBlocklist() › sets a key with EX TTL in Redis` | `redis.set('blocklist:jti-abc', '1', 'EX', 3600)` called |
| 6 | `isBlocklisted() › returns true when key exists` | `redis.get` returns `'1'` → function returns `true` |
| 7 | `isBlocklisted() › returns false when key does not exist` | `redis.get` returns `null` → function returns `false` |

**Total**: 7 tests

**Implementation note**: This file must be created alongside `src/lib/redis.ts`. Use
`vi.mock('ioredis')` to stub the Redis class; configure `mockResolvedValue` on `connect`,
`set`, and `get` as needed per test. Reset `globalForRedis.redis` to `undefined` in
`beforeEach` so singleton tests are isolated.

---

## Grand Total

| File | Tests | Classification |
|------|-------|----------------|
| `tests/unit/services/analytics.test.ts` | 47 | REGRESSION |
| `tests/unit/services/hiring.test.ts` | 44 | REGRESSION |
| `tests/unit/services/employee.test.ts` | 34 | REGRESSION |
| `tests/unit/auth/auth-session.test.ts` | 4 | REGRESSION |
| `tests/unit/routers/employee.router.test.ts` | 11 | MODIFIED (10 REGRESSION + 1 label change) |
| `tests/unit/lib/redis.test.ts` | 7 | NEW |
| **Total** | **147 existing + 7 new = 163 + 7 = 163** | |

> Accounting: 163 = 47 + 44 + 34 + 4 + 11 + (7 new added to bring the suite from 156 to
> 163). The existing suite on `main` is 163; the 7 redis tests are additive and bring the
> post-implementation count to **163** only if the redis tests replace tests removed
> elsewhere, OR the target count is 163 + 7 = 170. **Clarification**: the acceptance
> criterion "all 163 existing tests must pass" means those 163 stay green. The 7 new redis
> tests are additional and the final suite will have **170 tests**. The `npm test` run must
> show 0 failures.

---

## How to Run

### All tests (unit + router integration)

```bash
# Requires: Postgres running at TEST_DATABASE_URL, Redis at REDIS_URL
TEST_DATABASE_URL="postgresql://dhibob:dhibob_secret@localhost:5432/dhibob_test" \
REDIS_URL="redis://localhost:6379" \
npm test
```

### Unit tests only (no live Postgres or Redis needed)

These four files use only in-memory / mocked dependencies and can run anywhere:

```bash
npx vitest run \
  tests/unit/services/analytics.test.ts \
  tests/unit/services/hiring.test.ts \
  tests/unit/services/employee.test.ts \
  tests/unit/auth/auth-session.test.ts \
  tests/unit/lib/redis.test.ts
```

### Router integration test only (requires live Postgres)

```bash
TEST_DATABASE_URL="postgresql://dhibob:dhibob_secret@localhost:5432/dhibob_test" \
npx vitest run tests/unit/routers/employee.router.test.ts
```

### With coverage

```bash
TEST_DATABASE_URL="postgresql://dhibob:dhibob_secret@localhost:5432/dhibob_test" \
REDIS_URL="redis://localhost:6379" \
npm run test:coverage
```

### Spin up dependencies for integration testing via Docker

```bash
# Start Postgres + Redis (subset of full docker-compose)
docker compose up postgres redis -d

# Then run full suite
TEST_DATABASE_URL="postgresql://dhibob:dhibob_secret@localhost:5432/dhibob_test" \
REDIS_URL="redis://localhost:6379" \
npm test
```

### Docker compose smoke test (acceptance criterion 2)

```bash
docker compose up --build
# Verify: postgres, redis, and app containers all reach healthy/running state
# Verify: redis-cli keys 'session:*' returns at least one key after login
```

---

## Pre-existing Broken Tests

No tests are broken on the `main` branch or on this worktree branch going into the
implementation. `analytics.test.ts` and `hiring.test.ts` were fixed in an earlier commit on
this branch and are **confirmed passing**. No tests need to be skipped.

If `employee.router.test.ts` is run without `TEST_DATABASE_URL` pointing to a live Postgres
instance, the `beforeAll` will fail and all 11 tests in that file will be marked as failed
(not skipped). This is expected behaviour in CI environments without Postgres. The fix is to
provide `TEST_DATABASE_URL`.

---

## Files Modified or Created by This Test Plan

| File | Action | Reason |
|------|--------|--------|
| `tests/unit/routers/employee.router.test.ts` | Modified | Switch DB setup from SQLite temp file to `TEST_DATABASE_URL` Postgres DSN; add `deleteMany` truncation; rename case-sensitivity test description |
| `tests/unit/lib/redis.test.ts` | Created (new) | Unit-test the new `src/lib/redis.ts` singleton, `addToBlocklist`, and `isBlocklisted` helpers |

All other test files listed in this plan are **read-only** with respect to this
implementation — they must stay green with zero edits.

---

## Acceptance Checklist

- [ ] `npm test` exits 0 with all tests passing (163 original + 7 new = 170 total)
- [ ] `tests/unit/routers/employee.router.test.ts` passes against a live Postgres instance
      using `TEST_DATABASE_URL`
- [ ] Case-insensitive search test (test #4 in router file) passes with `mode: 'insensitive'`
      applied in `src/server/routers/employee.ts`
- [ ] `tests/unit/lib/redis.test.ts` all 7 tests green with ioredis mocked
- [ ] `docker compose up --build` brings all three services healthy
- [ ] After login, `redis-cli keys 'session:*'` returns at least one key
- [ ] No existing test has had its assertion weakened or been deleted
