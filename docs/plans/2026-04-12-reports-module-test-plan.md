# Reports Module — Test Plan

**Date:** 2026-04-12
**Implementation plan:** `docs/plans/2026-04-12-reports-module.md`
**Baseline:** 40 test files, 359 tests passing (1 file skipped — `employee.router.test.ts` requires live Postgres).

---

## Strategy reconciliation

The agreed testing strategy calls for:
1. Router unit tests (mocked Prisma, no live DB) — same pattern as `analytics.router.test.ts`, `hiring.router.test.ts`, etc.
2. Component tests (mocked tRPC hooks via `vi.mock('@/lib/trpc')`) — same pattern as `analytics-page.test.tsx`, `hiring-page.test.tsx`, etc.

The implementation plan is fully consistent with the strategy. No changes to scope, cost, or external dependencies. The plan introduces no paid services or infrastructure beyond what already exists.

**One adjustment made during reconciliation:** The plan includes an embedded bug fix (Task 1: `employee.terminate` must persist `reason` into `workInfo`) as a prerequisite for the Termination Report. The test for this fix is added to the existing `employee.router.test.ts` suite, not the new reports test file. This is consistent with the strategy — it is a regression test for a real bug that must be green before the new feature is complete.

---

## Harness requirements

No new harnesses needed. The existing mock pattern (in-memory Prisma mock + `vi.mock('@/server/trpc')`) is sufficient. Both harnesses are well-established in the codebase:

- **Router unit harness:** `vi.mock('@/lib/db')` + `vi.mock('@/server/trpc')`, then `router.createCaller(ctx)`. Zero DB dependency. Used by all router test files.
- **Component harness:** `vi.mock('@/lib/trpc')` with mock return values, then `render(<Page />)` with Testing Library. Used by all component test files.

---

## Test plan

### Prerequisite: Bug fix — employee.terminate must persist terminationReason

**Test 1 — terminate persists reason into workInfo**
- **Type:** regression
- **Disposition:** new (added to existing `tests/unit/routers/employee.router.test.ts`)
- **Harness:** Router unit harness (mocked Prisma)
- **Preconditions:** Employee `emp-1` exists with `workInfo: '{}'`, status `ACTIVE`
- **Actions:** Call `employee.terminate({ id: 'emp-1', endDate: new Date('2026-04-01'), reason: 'Resignation' })`
- **Expected outcome:** `prisma.employee.update` is called with `data.workInfo` containing the string `'Resignation'`. Confirms the fix persists reason into the JSON blob.
- **Source of truth:** Implementation plan, Task 1 bug description — `terminate` currently does not persist `reason` into `workInfo`, causing Termination Report to always show empty reason.
- **Interactions:** `employeeRouter.terminate` → `prisma.employee.update`

---

### Router tests (`tests/unit/routers/reports.router.test.ts`)

All 15 tests start RED (module does not exist), go GREEN after Task 4 implements the router.

**Test 2 — R-1: getTerminationReport returns only TERMINATED employees with correct fields**
- **Type:** integration
- **Disposition:** new
- **Harness:** Router unit harness
- **Preconditions:** `db.employee.findMany` returns one TERMINATED employee with `workInfo: '{"terminationReason":"Resignation"}'`, `endDate: 2025-03-15`, `department: { name: 'Sales' }`
- **Actions:** `reports.getTerminationReport({})`
- **Expected outcome:** `result.rows` has length 1; `row.name === 'Bob Jones'`; `row.terminationReason === 'Resignation'`; `row.endDate` equals the mock date; `typeof row.seniorityYears === 'number'` and `> 0`
- **Source of truth:** Implementation plan — field mapping table (terminationReason from workInfo JSON, seniorityYears computed from startDate/endDate)
- **Interactions:** `reportsRouter.getTerminationReport` → `prisma.employee.findMany`

**Test 3 — R-2: getTerminationReport enforces company isolation**
- **Type:** invariant
- **Disposition:** new
- **Harness:** Router unit harness
- **Preconditions:** `db.employee.findMany` returns `[]`
- **Actions:** `reports.getTerminationReport({})`
- **Expected outcome:** `prisma.employee.findMany` is called with `where` containing `{ companyId: 'co-1', status: 'TERMINATED' }`
- **Source of truth:** Implementation plan — all procedures use `ctx.user.companyId`; HiBob multi-tenant isolation requirement
- **Interactions:** `reportsRouter.getTerminationReport` → `prisma.employee.findMany`

**Test 4 — R-3: getTerminationReport passes department filter to DB query**
- **Type:** integration
- **Disposition:** new
- **Harness:** Router unit harness
- **Preconditions:** `db.employee.findMany` returns `[]`
- **Actions:** `reports.getTerminationReport({ department: 'Engineering' })`
- **Expected outcome:** `prisma.employee.findMany` called with `where.department = { name: { equals: 'Engineering', mode: 'insensitive' } }`
- **Source of truth:** Implementation plan — `deptFilter()` helper; PostgreSQL `mode: 'insensitive'` requirement established in earlier People/Analytics modules
- **Interactions:** `reportsRouter.getTerminationReport` → `prisma.employee.findMany`

**Test 5 — R-4: getTerminationReport date range filter narrows by endDate**
- **Type:** boundary
- **Disposition:** new
- **Harness:** Router unit harness
- **Preconditions:** `db.employee.findMany` returns `[]`
- **Actions:** `reports.getTerminationReport({ startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31') })`
- **Expected outcome:** `prisma.employee.findMany` called with `where.endDate = { gte: new Date('2025-01-01'), lte: new Date('2025-12-31') }`
- **Source of truth:** Implementation plan — termination date range filter spec
- **Interactions:** `reportsRouter.getTerminationReport` → `prisma.employee.findMany`

**Test 6 — R-5: getActiveReport returns only ACTIVE employees with salary from CompensationRecord**
- **Type:** integration
- **Disposition:** new
- **Harness:** Router unit harness
- **Preconditions:** `db.employee.findMany` returns one ACTIVE employee with `compensationHistory: [{ type: 'BASE_SALARY', status: 'APPROVED', effectiveDate: new Date('2023-01-01'), salary: 95000 }]`
- **Actions:** `reports.getActiveReport({})`
- **Expected outcome:** `result.rows[0].name === 'Alice Smith'`; `result.rows[0].salary === 95000`; `typeof result.rows[0].seniorityYears === 'number'`; `result.rows[0].startDate instanceof Date`
- **Source of truth:** Implementation plan — `getCurrentSalary()` from `compensation-engine.ts`; field mapping table
- **Interactions:** `reportsRouter.getActiveReport` → `prisma.employee.findMany` → `getCurrentSalary()`

**Test 7 — R-6: getActiveReport shows salary 0 for employee with no CompensationRecord**
- **Type:** boundary
- **Disposition:** new
- **Harness:** Router unit harness
- **Preconditions:** `db.employee.findMany` returns ACTIVE employee with `compensationHistory: []`
- **Actions:** `reports.getActiveReport({})`
- **Expected outcome:** `result.rows[0].salary === 0`
- **Source of truth:** `getCurrentSalary()` returns 0 when no approved BASE_SALARY records
- **Interactions:** `reportsRouter.getActiveReport` → `getCurrentSalary()`

**Test 8 — R-7: getActiveReport enforces company isolation**
- **Type:** invariant
- **Disposition:** new
- **Harness:** Router unit harness
- **Preconditions:** `db.employee.findMany` returns `[]`
- **Actions:** `reports.getActiveReport({})`
- **Expected outcome:** `prisma.employee.findMany` called with `where` containing `{ companyId: 'co-1', status: 'ACTIVE' }`
- **Source of truth:** Implementation plan — company isolation invariant
- **Interactions:** `reportsRouter.getActiveReport` → `prisma.employee.findMany`

**Test 9 — R-8: getActiveReport passes department filter to DB query**
- **Type:** integration
- **Disposition:** new
- **Harness:** Router unit harness
- **Preconditions:** `db.employee.findMany` returns `[]`
- **Actions:** `reports.getActiveReport({ department: 'Engineering' })`
- **Expected outcome:** `prisma.employee.findMany` called with `where.department = { name: { equals: 'Engineering', mode: 'insensitive' } }`
- **Source of truth:** Implementation plan — department filter spec
- **Interactions:** `reportsRouter.getActiveReport` → `prisma.employee.findMany`

**Test 10 — R-9: getSalaryReport returns current salary and future increases per employee**
- **Type:** integration
- **Disposition:** new
- **Harness:** Router unit harness
- **Preconditions:** Employee has two CompensationRecord rows — one past (effectiveDate 2023-01-01, salary 80000) and one future (next year, salary 90000), both APPROVED BASE_SALARY
- **Actions:** `reports.getSalaryReport({})`
- **Expected outcome:** `result.rows[0].currentSalary === 80000`; `result.rows[0].futureIncreases.length === 1`; `result.rows[0].futureIncreases[0].salary === 90000`
- **Source of truth:** Implementation plan — `getCurrentSalary()` for current; future increases are rows with `effectiveDate > now && status === 'APPROVED'`
- **Interactions:** `reportsRouter.getSalaryReport` → `prisma.employee.findMany` → `getCurrentSalary()`

**Test 11 — R-10: getSalaryReport enforces company isolation with ACTIVE filter**
- **Type:** invariant
- **Disposition:** new
- **Harness:** Router unit harness
- **Preconditions:** `db.employee.findMany` returns `[]`
- **Actions:** `reports.getSalaryReport({})`
- **Expected outcome:** `prisma.employee.findMany` called with `where` containing `{ companyId: 'co-1', status: 'ACTIVE' }`
- **Source of truth:** Implementation plan — Salary Report shows active employees only
- **Interactions:** `reportsRouter.getSalaryReport` → `prisma.employee.findMany`

**Test 12 — R-11: getSalaryReport passes department filter**
- **Type:** integration
- **Disposition:** new
- **Harness:** Router unit harness
- **Preconditions:** `db.employee.findMany` returns `[]`
- **Actions:** `reports.getSalaryReport({ department: 'Sales' })`
- **Expected outcome:** `prisma.employee.findMany` called with `where.department = { name: { equals: 'Sales', mode: 'insensitive' } }`
- **Source of truth:** Implementation plan — department filter spec
- **Interactions:** `reportsRouter.getSalaryReport` → `prisma.employee.findMany`

**Test 13 — R-12: getSalaryReport increaseType filter restricts futureIncreases**
- **Type:** boundary
- **Disposition:** new
- **Harness:** Router unit harness
- **Preconditions:** Employee has three future CompensationRecord rows: one BONUS, two BASE_SALARY
- **Actions:** `reports.getSalaryReport({ increaseType: 'BONUS' })`
- **Expected outcome:** `result.rows[0].futureIncreases.length === 1`; `result.rows[0].futureIncreases[0].type === 'BONUS'`
- **Source of truth:** Implementation plan — in-memory filter on `cr.type === input.increaseType`
- **Interactions:** `reportsRouter.getSalaryReport` → in-memory type filter on `compensationHistory`

**Test 14 — R-13: getTotalCostReport returns monthly cost summaries**
- **Type:** integration
- **Disposition:** new
- **Harness:** Router unit harness
- **Preconditions:** `db.compensationRecord.findMany` returns 2 records in future months (nextMonth: BASE_SALARY 5000, monthAfter: BONUS 2000)
- **Actions:** `reports.getTotalCostReport({ startDate: now, endDate: monthAfter })`
- **Expected outcome:** `result.months.length >= 1`; at least one month has `total > 0`
- **Source of truth:** Implementation plan — monthly aggregation using `toMonthLabel()`, grouping by month key
- **Interactions:** `reportsRouter.getTotalCostReport` → `prisma.compensationRecord.findMany` → monthly grouping

**Test 15 — R-14: getTotalCostReport enforces company isolation through employee relation**
- **Type:** invariant
- **Disposition:** new
- **Harness:** Router unit harness
- **Preconditions:** `db.compensationRecord.findMany` returns `[]`
- **Actions:** `reports.getTotalCostReport({ startDate: now, endDate: future })`
- **Expected outcome:** `prisma.compensationRecord.findMany` called with `where.employee` containing `{ companyId: 'co-1' }`
- **Source of truth:** Implementation plan — isolation via `employee.companyId` join (no direct `companyId` on `CompensationRecord`)
- **Interactions:** `reportsRouter.getTotalCostReport` → `prisma.compensationRecord.findMany`

**Test 16 — R-15: getTotalCostReport department filter narrows results**
- **Type:** integration
- **Disposition:** new
- **Harness:** Router unit harness
- **Preconditions:** `db.compensationRecord.findMany` returns `[]`
- **Actions:** `reports.getTotalCostReport({ startDate: now, endDate: future, department: 'Engineering' })`
- **Expected outcome:** `prisma.compensationRecord.findMany` called with `where.employee` containing `{ companyId: 'co-1', department: { name: { equals: 'Engineering', mode: 'insensitive' } } }`
- **Source of truth:** Implementation plan — department filter spec for Cost Report
- **Interactions:** `reportsRouter.getTotalCostReport` → `prisma.compensationRecord.findMany`

---

### Component tests (`tests/unit/components/reports-page.test.tsx`)

All 10 tests start RED (page component does not exist), go GREEN after Task 5 implements the page.

**Test 17 — C-1: default tab shows Termination Report data from live tRPC mock**
- **Type:** scenario
- **Disposition:** new
- **Harness:** Component harness (mocked tRPC)
- **Preconditions:** `getTerminationReport.useQuery` returns `{ rows: [{ name: 'Bob Jones', terminationReason: 'Resignation', ... }] }`
- **Actions:** `render(<ReportsPage />)` — no further interaction (default tab)
- **Expected outcome:** `screen.getByRole('tab', { name: /termination/i })` is present; `screen.getByText('Bob Jones')` is present; `screen.getByText('Resignation')` is present; `screen.queryByText('Jane Doe')` is absent (no hardcoded names)
- **Source of truth:** Implementation plan — Termination tab is default; data comes from `getTerminationReport` mock
- **Interactions:** `ReportsPage` → `trpc.reports.getTerminationReport.useQuery`

**Test 18 — C-2: Active Employees tab shows active employee data**
- **Type:** scenario
- **Disposition:** new
- **Harness:** Component harness
- **Preconditions:** `getActiveReport.useQuery` returns `{ rows: [{ name: 'Alice Smith', salary: 95000, ... }] }`
- **Actions:** Click tab with `name: /active/i`
- **Expected outcome:** `screen.getByText('Alice Smith')` is present; `screen.getByText('$95,000')` is present
- **Source of truth:** Implementation plan — Active Employees tab wires to `getActiveReport`
- **Interactions:** `ReportsPage` → `trpc.reports.getActiveReport.useQuery`

**Test 19 — C-3: Salary tab shows salary report data**
- **Type:** scenario
- **Disposition:** new
- **Harness:** Component harness
- **Preconditions:** `getSalaryReport.useQuery` returns `{ rows: [{ name: 'Alice Smith', currentSalary: 95000, ... }] }`
- **Actions:** Click tab with `name: /salary/i`
- **Expected outcome:** `screen.getByText('Alice Smith')` is present; `screen.getByText('$95,000')` is present
- **Source of truth:** Implementation plan — Salary tab wires to `getSalaryReport`
- **Interactions:** `ReportsPage` → `trpc.reports.getSalaryReport.useQuery`

**Test 20 — C-4: Future Increases / Cost tab shows monthly cost data**
- **Type:** scenario
- **Disposition:** new
- **Harness:** Component harness
- **Preconditions:** `getTotalCostReport.useQuery` returns `{ months: [{ month: '2026-05', total: 15000, ... }] }`
- **Actions:** Click tab matching `/future|cost/i`
- **Expected outcome:** `screen.getByText('2026-05')` is present; text matching `/15,000/` is present
- **Source of truth:** Implementation plan — Cost/Future Increases tab wires to `getTotalCostReport`
- **Interactions:** `ReportsPage` → `trpc.reports.getTotalCostReport.useQuery`

**Test 21 — C-5: Loading state shows skeleton rows, not real data**
- **Type:** scenario
- **Disposition:** new
- **Harness:** Component harness
- **Preconditions:** `getTerminationReport.useQuery` returns `{ data: undefined, isLoading: true }`
- **Actions:** `render(<ReportsPage />)`
- **Expected outcome:** `screen.queryByText('Bob Jones')` is absent; at least one element with `data-testid="skeleton"`, class `animate-pulse`, or `role="status"` is present
- **Source of truth:** Implementation plan — Skeleton component with `data-testid="skeleton"` and `role="status"`
- **Interactions:** `ReportsPage` → conditional Skeleton render on `isLoading`

**Test 22 — C-6: Empty data renders "No results" message without crash**
- **Type:** boundary
- **Disposition:** new
- **Harness:** Component harness
- **Preconditions:** `getTerminationReport.useQuery` returns `{ data: { rows: [] }, isLoading: false }`
- **Actions:** `render(<ReportsPage />)`
- **Expected outcome:** `screen.queryByText('Bob Jones')` is absent; text matching `/no results|no data|no records/i` is present
- **Source of truth:** Implementation plan — SortableTable empty state: "No results found for the selected filters."
- **Interactions:** `ReportsPage` → `SortableTable` empty state branch

**Test 23 — C-7: Clicking Name column header toggles sort direction indicator**
- **Type:** scenario
- **Disposition:** new
- **Harness:** Component harness
- **Preconditions:** Default mocks set up with termination row data
- **Actions:** `render(<ReportsPage />)`; click `columnheader` with `name: /name/i`
- **Expected outcome:** Column header `textContent` matches `/↑|↓|▲|▼/` after click (sort indicator appears)
- **Source of truth:** Implementation plan — `sortIndicator()` appends `' ↑'` or `' ↓'` to header text
- **Interactions:** `ReportsPage` → `SortableTable.handleHeaderClick` → `sortIndicator()`

**Test 24 — C-8: Toggling off a column removes it from table headers**
- **Type:** scenario
- **Disposition:** new
- **Harness:** Component harness
- **Preconditions:** Default mocks set up
- **Actions:** Click button matching `/columns|toggle|customize/i`; if "Reason" checkbox is found, click it
- **Expected outcome:** `screen.queryByRole('columnheader', { name: /reason/i })` is absent after unchecking
- **Source of truth:** Implementation plan — `onToggleColumn` callback; `visibleColumns = columns.filter(c => c.visible)`
- **Interactions:** `ReportsPage` → `SortableTable` column toggle dropdown → `onToggleColumn`

**Test 25 — C-9: Download CSV button triggers blob creation**
- **Type:** scenario
- **Disposition:** new
- **Harness:** Component harness + mocked `URL.createObjectURL`
- **Preconditions:** Default mocks set up; `URL.createObjectURL` mocked to return `'blob:test'`
- **Actions:** `render(<ReportsPage />)`; find button matching `/download|export|csv/i`; click it
- **Expected outcome:** Button is present in DOM; `URL.createObjectURL` was called after click
- **Source of truth:** Implementation plan — `downloadCsv()` calls `URL.createObjectURL(blob)` then `URL.revokeObjectURL(url)`
- **Interactions:** `ReportsPage` → `downloadCsv()` → `URL.createObjectURL`

**Test 26 — C-10: No hardcoded employee names or placeholder values appear**
- **Type:** regression
- **Disposition:** new
- **Harness:** Component harness
- **Preconditions:** Default mocks set up (real mock data, no hardcoded values)
- **Actions:** `render(<ReportsPage />)`
- **Expected outcome:** `queryByText('Jane Doe')` absent; `queryByText('John Smith')` absent; `queryByText('$1,200,000')` absent
- **Source of truth:** No hardcoded values should appear — all data comes from tRPC mocks
- **Interactions:** `ReportsPage` renders only from tRPC mock data

---

### Regression: existing suite stays green

**Test 27 — Full suite regression**
- **Type:** regression
- **Disposition:** existing
- **Harness:** `npm test` (all 40 test files)
- **Preconditions:** All Tasks 1–6 complete; `employee.router.test.ts` skipped (requires live Postgres, consistent with baseline)
- **Actions:** `npm test`
- **Expected outcome:** 42 test files pass (40 existing + 2 new); 375+ tests pass (359 baseline + 1 bug fix test + 15 router tests + 10 component tests); 0 regressions
- **Source of truth:** Baseline test run before implementation
- **Interactions:** All routers, components, services, auth, providers tested in isolation

---

## Coverage summary

### Covered
- All 4 `reportsRouter` procedures: field mapping, company isolation, department filter (all)
- Date range filter (getTerminationReport, getTotalCostReport)
- `increaseType` filter (getSalaryReport, getTotalCostReport)
- Salary computation via `getCurrentSalary()` (active report, salary report)
- Future increase detection (salary report — effectiveDate > now)
- Monthly aggregation (total cost report)
- All 4 page tabs and their data bindings
- Loading skeleton state
- Empty state
- Column sort (toggle indicator)
- Column visibility toggle
- CSV download (URL.createObjectURL called)
- No hardcoded values regression
- Bug fix: `employee.terminate` persists reason

### Explicitly excluded per agreed strategy
- **Browser/E2E tests (Playwright):** Not installed. Full navigation flow, real DB round-trips, and CSS layout are not tested. Risk: visual regressions and timing bugs under real browser would not be caught.
- **CSV file content correctness:** Only that `createObjectURL` is called, not that the CSV text is well-formed. Risk: malformed CSV would not be caught until manual test.
- **Role-based access control for Reports page:** The page uses `protectedProcedure` (requires authenticated session); UNAUTHORIZED behavior is inherited from tRPC middleware already tested in other router suites.
- **`getTotalCostReport` without date range:** The input schema requires `startDate` and `endDate` for this procedure; no optional-date boundary tests were added.
