# Wire Payroll Module — Test Plan

**Date:** 2026-04-09
**Branch:** `wire-payroll-module`
**Derived from:** Implementation plan `2026-04-04-wire-payroll-module.md`
**Testing strategy agreement:** Option B (add PayRun model); 13 router unit tests + 9 component tests; all existing 327 passing tests must stay green.

---

## Reconciliation Notes

The implementation plan matches the agreed testing strategy exactly. No strategy changes are required. Key observations:

- **No live DB harness needed.** All router tests use mocked Prisma (same pattern as `performance.router.test.ts`). The 11 `employee.router.test.ts` failures are pre-existing live-DB failures unrelated to this task.
- **Skeleton component.** The plan creates `src/components/ui/skeleton.tsx`. The analytics page already defines an inline `Skeleton` with `role="status"` and `data-testid="skeleton"`; the component tests assert `document.querySelectorAll('.animate-pulse').length > 0` which works regardless of whether `Skeleton` is inline or from the new file.
- **Two pre-existing failing tests** (`employee-profile.test.tsx` "shows manager name in Employment tab" and `time-off-page.test.tsx` "shows request list with status badges") are tracked outside this plan. They must not regress further, and the payroll implementation must not touch those test files.
- **Current baseline:** 39 test files, 341 tests — 327 passing, 2 failing (component), 1 file erroring (employee.router.test — needs live Postgres). After this task: 41 files, 363 tests — 349 passing expected.

---

## Harness Requirements

No new harness needed. The existing Vitest + jsdom environment supports both test files:

| Harness | Used by | Notes |
|---|---|---|
| Vitest + mocked Prisma | Router unit tests (PR-1 to PR-13) | Same setup as `performance.router.test.ts` — `vi.mock('@/lib/db')` + `vi.mock('@/server/trpc')` |
| Vitest + jsdom + mocked tRPC | Component tests (PC-1 to PC-9) | Same setup as `hiring-page.test.tsx` — `vi.mock('@/lib/trpc')` with `vi.fn()` hooks |

Both harnesses are already in place. No setup work needed before writing tests.

---

## Test Plan

### Phase 1: Pre-existing failing tests (regression baseline)

**Before writing any new tests, confirm the exact failure messages** for the two pre-existing failures by running:

```bash
npx vitest run tests/unit/components/employee-profile.test.tsx tests/unit/components/time-off-page.test.tsx
```

These failures must not change after the payroll implementation. The payroll implementation does not touch either file.

---

### Router Unit Tests — `tests/unit/routers/payroll.router.test.ts`

**File disposition:** NEW (does not exist yet)
**Harness:** Vitest + mocked Prisma (no live DB)
**TDD order:** Write all 13 RED first, run to confirm failures, then implement router to GREEN.

---

**Test PR-1: listPayRuns returns pay runs scoped to the caller's company**

- **Type:** integration
- **Disposition:** new
- **Harness:** Vitest + mocked Prisma
- **Preconditions:** `db.payRun.findMany` resolves with `[mockPayRun]` (companyId: 'co-1')
- **Actions:** Call `caller.listPayRuns({ limit: 10 })`
- **Expected outcome:**
  - `result.payRuns` has length 1
  - `result.payRuns[0].id === 'run-1'`
  - `db.payRun.findMany` was called with `where` containing `companyId: 'co-1'`
  - `result.nextCursor` is `undefined`
- **Interactions:** `payrollRouter.listPayRuns` → mocked `db.payRun.findMany`
- **Source of truth:** §2.2 of implementation plan (company isolation + pagination spec)

---

**Test PR-2: listPayRuns applies optional status filter**

- **Type:** integration
- **Disposition:** new
- **Harness:** Vitest + mocked Prisma
- **Preconditions:** `db.payRun.findMany` resolves with `[mockPayRun]`
- **Actions:** Call `caller.listPayRuns({ limit: 10, status: 'COMPLETED' })`
- **Expected outcome:**
  - `db.payRun.findMany` called with `where` containing `{ companyId: 'co-1', status: 'COMPLETED' }`
  - `result.payRuns` has length 1
- **Interactions:** `payrollRouter.listPayRuns` → mocked `db.payRun.findMany`
- **Source of truth:** §2.2 — optional `status` filter

---

**Test PR-3: listPayRuns returns empty array and no cursor when no pay runs exist**

- **Type:** boundary
- **Disposition:** new
- **Harness:** Vitest + mocked Prisma
- **Preconditions:** `db.payRun.findMany` resolves with `[]`
- **Actions:** Call `caller.listPayRuns({ limit: 10 })`
- **Expected outcome:**
  - `result.payRuns` has length 0
  - `result.nextCursor` is `undefined`
- **Interactions:** `payrollRouter.listPayRuns` → mocked `db.payRun.findMany`
- **Source of truth:** §2.2 — empty-state handling

---

**Test PR-4: listPayRuns returns nextCursor when result exceeds limit**

- **Type:** boundary
- **Disposition:** new
- **Harness:** Vitest + mocked Prisma
- **Preconditions:** `db.payRun.findMany` resolves with 3 records (limit=2, so +1 extra)
- **Actions:** Call `caller.listPayRuns({ limit: 2 })`
- **Expected outcome:**
  - `result.payRuns` has length 2 (extra item popped)
  - `result.nextCursor === 'run-3'` (id of the popped item)
- **Mock setup:**
  ```ts
  db.payRun.findMany.mockResolvedValue([
    { ...mockPayRun, id: 'run-1' },
    { ...mockPayRun, id: 'run-2' },
    { ...mockPayRun, id: 'run-3' },
  ]);
  ```
- **Interactions:** `payrollRouter.listPayRuns` → mocked `db.payRun.findMany`
- **Source of truth:** §2.2 — cursor-based pagination spec

---

**Test PR-5: listPayRuns does not query another company's pay runs**

- **Type:** invariant
- **Disposition:** new
- **Harness:** Vitest + mocked Prisma
- **Preconditions:** `db.payRun.findMany` returns `[mockPayRun]` (co-1 only)
- **Actions:** Call `caller.listPayRuns({ limit: 10 })`
- **Expected outcome:**
  - `db.payRun.findMany` called with `where.companyId === 'co-1'`
  - `db.payRun.findMany` NOT called with `where.companyId === 'co-2'`
- **Interactions:** `payrollRouter.listPayRuns` → mocked `db.payRun.findMany`
- **Source of truth:** §2.2 — company isolation (never returns another company's pay runs)

---

**Test PR-6: getSummary returns correct totalPayrollYTD**

- **Type:** integration
- **Disposition:** new
- **Harness:** Vitest + mocked Prisma
- **Preconditions:** `db.payRun.findMany` returns `[pendingRun, completedRun2, completedRun1]` (see shared mock data below)
  - `completedRun1.totalAmount = 180_000`, `completedRun2.totalAmount = 182_000` (both COMPLETED, current year)
  - `pendingRun.totalAmount = 0`, `pendingRun.status = 'PENDING'`
- **Actions:** Call `caller.getSummary()`
- **Expected outcome:**
  - `result.totalPayrollYTD === 362_000` (sum of COMPLETED runs in current year only)
- **Interactions:** `payrollRouter.getSummary` → mocked `db.payRun.findMany`
- **Source of truth:** §2.3 — totalPayrollYTD calculation

---

**Test PR-7: getSummary returns employeeCount from most recent COMPLETED run**

- **Type:** integration
- **Disposition:** new
- **Harness:** Vitest + mocked Prisma
- **Preconditions:** Same shared mock data as PR-6; `completedRun2` is the most recent completed (higher periodStart), `completedRun2.employeeCount = 28`
- **Actions:** Call `caller.getSummary()`
- **Expected outcome:**
  - `result.employeeCount === 28` (from `completedRun2`, not from `completedRun1`)
- **Interactions:** `payrollRouter.getSummary` → mocked `db.payRun.findMany`
- **Source of truth:** §2.3 — employeeCount from most recent COMPLETED run

---

**Test PR-8: getSummary returns nextRunDate as periodEnd + 1 day of most recent COMPLETED run**

- **Type:** integration
- **Disposition:** new
- **Harness:** Vitest + mocked Prisma
- **Preconditions:** Same shared mock data; `completedRun2.periodEnd = new Date(`${currentYear}-01-31`)`
- **Actions:** Call `caller.getSummary()`
- **Expected outcome:**
  - `result.nextRunDate` is a Date equal to `new Date(`${currentYear}-02-01`)` (Jan 31 + 1 day)
- **Interactions:** `payrollRouter.getSummary` → mocked `db.payRun.findMany`
- **Source of truth:** §2.3 — nextRunDate derivation

---

**Test PR-9: getSummary returns pendingCount as count of PENDING runs**

- **Type:** integration
- **Disposition:** new
- **Harness:** Vitest + mocked Prisma
- **Preconditions:** Same shared mock data; 1 PENDING run in the mock array
- **Actions:** Call `caller.getSummary()`
- **Expected outcome:**
  - `result.pendingCount === 1`
- **Interactions:** `payrollRouter.getSummary` → mocked `db.payRun.findMany`
- **Source of truth:** §2.3 — pendingCount calculation

---

**Test PR-10: getSummary returns zero/null summary when no pay runs exist**

- **Type:** boundary
- **Disposition:** new
- **Harness:** Vitest + mocked Prisma
- **Preconditions:** `db.payRun.findMany` resolves with `[]`
- **Actions:** Call `caller.getSummary()`
- **Expected outcome:**
  - `result.totalPayrollYTD === 0`
  - `result.employeeCount === 0`
  - `result.nextRunDate === null`
  - `result.pendingCount === 0`
- **Interactions:** `payrollRouter.getSummary` → mocked `db.payRun.findMany`
- **Source of truth:** §2.3 — zero-state handling

---

**Test PR-11: createPayRun creates a PENDING pay run with companyId from context**

- **Type:** integration
- **Disposition:** new
- **Harness:** Vitest + mocked Prisma
- **Preconditions:** `db.payRun.create` resolves with `{ ...mockPayRun, id: 'run-new', status: 'PENDING', processedAt: null }`
- **Actions:** Call `caller.createPayRun({ periodStart: new Date('2026-04-01'), periodEnd: new Date('2026-04-15'), totalAmount: 185_000, currency: 'USD', employeeCount: 28 })`
- **Expected outcome:**
  - `result.status === 'PENDING'`
  - `db.payRun.create` called with `data` containing `{ companyId: 'co-1', status: 'PENDING' }`
  - `db.payRun.create` NOT called with `companyId` from input (must come from ctx)
- **Interactions:** `payrollRouter.createPayRun` → mocked `db.payRun.create`
- **Source of truth:** §2.4 — companyId injection, status always PENDING

---

**Test PR-12: createPayRun throws BAD_REQUEST when periodStart >= periodEnd**

- **Type:** boundary
- **Disposition:** new
- **Harness:** Vitest + mocked Prisma
- **Preconditions:** `db.payRun.create` is available (but must NOT be called)
- **Actions:** Call `caller.createPayRun({ periodStart: new Date('2026-04-15'), periodEnd: new Date('2026-04-01'), ... })` (end before start)
- **Expected outcome:**
  - Promise rejects with `TRPCError` with code `'BAD_REQUEST'`
- **Interactions:** `payrollRouter.createPayRun` — validation only
- **Source of truth:** §2.4 — date validation guard

---

**Test PR-13: createPayRun does not call prisma.payRun.create when validation fails**

- **Type:** invariant
- **Disposition:** new
- **Harness:** Vitest + mocked Prisma
- **Preconditions:** `db.payRun.create` mock is fresh (no prior calls)
- **Actions:** Same as PR-12 (periodStart >= periodEnd, expect rejection)
- **Expected outcome:**
  - `db.payRun.create` was NOT called
- **Interactions:** `payrollRouter.createPayRun` — no DB interaction on validation failure
- **Source of truth:** §2.4 — "Prisma is not called if this check fails"

---

### Component Tests — `tests/unit/components/payroll-page.test.tsx`

**File disposition:** NEW (does not exist yet)
**Harness:** Vitest + jsdom + mocked tRPC
**TDD order:** Write all 9 RED first (component doesn't use tRPC yet), then implement page to GREEN.

**Standard mock data for all PC tests:**

```ts
// Use non-seed values to prove data-driven rendering:
const mockSummary = {
  totalPayrollYTD: 750_000,   // not 908_600, not hardcoded "$1.2M"
  employeeCount: 31,           // not 28, not hardcoded 247
  nextRunDate: new Date('2026-05-16'), // formats as "May 16", not "Apr 1"
  pendingCount: 7,             // not 1, not hardcoded 3
};

const mockPayRuns = [
  {
    id: 'run-1', companyId: 'co-1',
    periodStart: new Date('2026-03-01'), periodEnd: new Date('2026-03-15'),
    totalAmount: 184_230, currency: 'USD', employeeCount: 28,
    status: 'COMPLETED', processedAt: new Date('2026-03-15'),
    createdAt: new Date('2026-03-01'), updatedAt: new Date('2026-03-15'),
  },
  {
    id: 'run-2', companyId: 'co-1',
    periodStart: new Date('2026-02-16'), periodEnd: new Date('2026-02-28'),
    totalAmount: 178_990, currency: 'USD', employeeCount: 28,
    status: 'COMPLETED', processedAt: new Date('2026-02-28'),
    createdAt: new Date('2026-02-16'), updatedAt: new Date('2026-02-28'),
  },
];
```

---

**Test PC-1: Total Payroll stat card shows formatted totalPayrollYTD, not hardcoded "$1.2M"**

- **Type:** scenario
- **Disposition:** new
- **Harness:** Vitest + jsdom + mocked tRPC
- **Preconditions:** `getSummary.useQuery` returns `{ data: { ...mockSummary, totalPayrollYTD: 750_000 }, isLoading: false }`
- **Actions:** Render `<PayrollPage />`
- **Expected outcome:**
  - Document contains text matching `750` or `750K` (formatted USD compact notation)
  - Document does NOT contain `"$1.2M"`
- **Interactions:** `PayrollPage` component → mocked `trpc.payroll.getSummary.useQuery`
- **Source of truth:** §4.1 — Total Payroll card bound to `getSummary.totalPayrollYTD`; hardcoded value was `"$1.2M"`

---

**Test PC-2: Employees stat card shows employeeCount from getSummary, not hardcoded 247**

- **Type:** scenario
- **Disposition:** new
- **Harness:** Vitest + jsdom + mocked tRPC
- **Preconditions:** `getSummary.useQuery` returns `{ data: { ...mockSummary, employeeCount: 31 }, isLoading: false }`
- **Actions:** Render `<PayrollPage />`
- **Expected outcome:**
  - `screen.getByText('31')` exists
  - `screen.queryByText('247')` returns null
- **Interactions:** `PayrollPage` → mocked `trpc.payroll.getSummary.useQuery`
- **Source of truth:** §4.1 — Employees card bound to `getSummary.employeeCount`; hardcoded was `247`

---

**Test PC-3: Next Run stat card shows formatted nextRunDate, not hardcoded "Apr 1"**

- **Type:** scenario
- **Disposition:** new
- **Harness:** Vitest + jsdom + mocked tRPC
- **Preconditions:** `getSummary.useQuery` returns `{ data: { ...mockSummary, nextRunDate: new Date('2026-05-16') }, isLoading: false }`
- **Actions:** Render `<PayrollPage />`
- **Expected outcome:**
  - Document contains `"May 16"` (formatted from `nextRunDate`)
  - Document does NOT contain `"Apr 1"` as a stat card value
- **Interactions:** `PayrollPage` → mocked `trpc.payroll.getSummary.useQuery`
- **Source of truth:** §4.1 — Next Run card bound to `getSummary.nextRunDate`; hardcoded was `"Apr 1"`
- **Note:** This test uses May 16 specifically because the real seed data would produce "Apr 1", so the distinct date proves the stat is data-driven

---

**Test PC-4: Pending Reviews stat card shows pendingCount from getSummary, not hardcoded 3**

- **Type:** scenario
- **Disposition:** new
- **Harness:** Vitest + jsdom + mocked tRPC
- **Preconditions:** `getSummary.useQuery` returns `{ data: { ...mockSummary, pendingCount: 7 }, isLoading: false }`
- **Actions:** Render `<PayrollPage />`
- **Expected outcome:**
  - `screen.getByText('7')` exists
  - `screen.queryByText('3')` returns null
- **Interactions:** `PayrollPage` → mocked `trpc.payroll.getSummary.useQuery`
- **Source of truth:** §4.1 — Pending Reviews card bound to `getSummary.pendingCount`; hardcoded was `3`

---

**Test PC-5: Pay run table renders rows from listPayRuns data, not hardcoded rows**

- **Type:** scenario
- **Disposition:** new
- **Harness:** Vitest + jsdom + mocked tRPC
- **Preconditions:** `listPayRuns.useQuery` returns `{ data: { payRuns: mockPayRuns, nextCursor: undefined }, isLoading: false }`
- **Actions:** Render `<PayrollPage />`
- **Expected outcome:**
  - At least one element containing `"Mar"` and `"15"` is present (from run-1 period or processedAt)
  - At least one element containing `"Feb"` is present (from run-2)
  - `screen.queryByText('Mar 1-15')` returns null (old hardcoded format)
  - `screen.queryByText('Feb 16-28')` returns null (old hardcoded format)
  - `screen.queryByText('Feb 1-15')` returns null (third old hardcoded row)
- **Interactions:** `PayrollPage` → mocked `trpc.payroll.listPayRuns.useQuery`
- **Source of truth:** §4.5 — table rewritten from `runsData?.payRuns.map(...)`; old array had 3 hardcoded rows

---

**Test PC-6: Pay run row shows formatted period range from periodStart and periodEnd**

- **Type:** integration
- **Disposition:** new
- **Harness:** Vitest + jsdom + mocked tRPC
- **Preconditions:** `listPayRuns.useQuery` returns `{ data: { payRuns: [mockPayRuns[0]], nextCursor: undefined }, isLoading: false }` (`run-1`: periodStart Mar 1, periodEnd Mar 15)
- **Actions:** Render `<PayrollPage />`
- **Expected outcome:**
  - Document contains text matching the period of run-1 (e.g. `"Mar 1"` appears somewhere in a pay run row)
- **Interactions:** `PayrollPage` → mocked `trpc.payroll.listPayRuns.useQuery` → `formatPeriod(periodStart, periodEnd)`
- **Source of truth:** §4.5 — period field: `formatPeriod(run.periodStart, run.periodEnd)`

---

**Test PC-7: Loading skeletons render when getSummary is loading**

- **Type:** scenario
- **Disposition:** new
- **Harness:** Vitest + jsdom + mocked tRPC
- **Preconditions:** `getSummary.useQuery` returns `{ data: undefined, isLoading: true }`; `listPayRuns.useQuery` returns loaded state
- **Actions:** Render `<PayrollPage />`
- **Expected outcome:**
  - `document.querySelectorAll('.animate-pulse').length > 0` (skeletons are present)
  - `screen.queryByText('$1.2M')` returns null
- **Interactions:** `PayrollPage` → mocked `trpc.payroll.getSummary.useQuery` (loading state)
- **Source of truth:** §4.4 — loading state: render 4 Skeleton elements while `summaryLoading`

---

**Test PC-8: Loading skeletons render when listPayRuns is loading**

- **Type:** scenario
- **Disposition:** new
- **Harness:** Vitest + jsdom + mocked tRPC
- **Preconditions:** `getSummary.useQuery` returns loaded state; `listPayRuns.useQuery` returns `{ data: undefined, isLoading: true }`
- **Actions:** Render `<PayrollPage />`
- **Expected outcome:**
  - `document.querySelectorAll('.animate-pulse').length > 0`
  - `screen.queryByText('Mar 1-15')` returns null (hardcoded pay run periods absent)
  - `screen.queryByText('Feb 16-28')` returns null
- **Interactions:** `PayrollPage` → mocked `trpc.payroll.listPayRuns.useQuery` (loading state)
- **Source of truth:** §4.5 — loading state: render 3 skeleton rows while `runsLoading`

---

**Test PC-9: Empty state shown when listPayRuns returns empty array**

- **Type:** boundary
- **Disposition:** new
- **Harness:** Vitest + jsdom + mocked tRPC
- **Preconditions:** `listPayRuns.useQuery` returns `{ data: { payRuns: [], nextCursor: undefined }, isLoading: false }`
- **Actions:** Render `<PayrollPage />`
- **Expected outcome:**
  - `screen.getByText(/no pay runs/i)` is in document
- **Interactions:** `PayrollPage` → mocked `trpc.payroll.listPayRuns.useQuery` (empty state)
- **Source of truth:** §4.5 — empty state: `"No pay runs yet."` message

---

### Regression Tests

**Test REG-1: All existing passing tests remain green after payroll implementation**

- **Type:** regression
- **Disposition:** existing
- **Harness:** Full Vitest suite
- **Preconditions:** Payroll module fully implemented (schema, router, page, seed)
- **Actions:** Run `npx vitest run` (excluding `employee.router.test.ts` which requires live Postgres)
- **Expected outcome:**
  - All 327 currently passing tests remain passing
  - 22 new payroll tests (PR-1 to PR-13, PC-1 to PC-9) all pass
  - Total: 349 passing
  - The 2 pre-existing failures (`employee-profile` manager tab, `time-off-page` status badges) remain exactly as before — not improved, not worsened
- **Interactions:** All existing routers, components, utilities
- **Source of truth:** Existing test suite

---

## Coverage Summary

### Covered

| Area | Tests |
|---|---|
| `payrollRouter.listPayRuns` — happy path, company scoping, status filter, pagination, empty state | PR-1 to PR-5 |
| `payrollRouter.getSummary` — all 4 stat card derivations, zero-state | PR-6 to PR-10 |
| `payrollRouter.createPayRun` — happy path, date validation, DB non-call on error | PR-11 to PR-13 |
| Payroll page stat cards — all 4 data-driven assertions, hardcoded values absent | PC-1 to PC-4 |
| Payroll page pay run table — data-driven rows, period format, hardcoded rows absent | PC-5, PC-6 |
| Payroll page loading states — stat card skeletons, table skeletons | PC-7, PC-8 |
| Payroll page empty state | PC-9 |
| Existing test suite regression | REG-1 |

### Explicitly Excluded

| Area | Reason |
|---|---|
| `createPayRun` UI button/modal on the payroll page | Implementation plan §4.7 explicitly excludes a "Create Pay Run" button from initial page rewrite |
| Status transition (PENDING → COMPLETED, FAILED) | No `processPayRun` or `updateStatus` procedure in the plan |
| Cross-year `totalPayrollYTD` edge cases | Acceptable edge case per plan §9 (UTC vs. local time at year boundary) — low risk for demo seed environment |
| Live DB round-trip tests | Not available without live Postgres; router unit tests use mocked Prisma |
| Browser rendering / CSS layout | Would require Playwright; agreed strategy did not include browser-level testing |
| `employee.router.test.ts` (live Postgres) | Pre-existing infrastructure gap, out of scope for this task |

### Risk Note

The component tests mock the tRPC layer entirely. If the `trpc.payroll.*` namespace is misconfigured in `_app.ts` or the client type generation fails, the tests will pass but the live page will 404. This is mitigated by: (a) the router unit tests proving the procedures work against the real router export, and (b) the plan's explicit step to register `payrollRouter` in `_app.ts` and verify with `npx tsc --noEmit` before calling implementation complete.

