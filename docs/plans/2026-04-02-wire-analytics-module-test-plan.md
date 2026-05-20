# Test Plan: Wire Analytics Module

**Branch:** `wire-analytics-module`
**Date:** 2026-04-02
**Linked plan:** `2026-04-02-wire-analytics-module.md`
**Goal:** Validate that every analytics router procedure returns real, correctly shaped data from the database (via mocked Prisma), that the analytics UI page contains no hardcoded values, and that all pre-existing tests remain green.

---

## Scope

Two test files will be created as part of the implementation, both following existing project conventions:

| File | Purpose |
|---|---|
| `tests/unit/routers/analytics.router.test.ts` | Router-level unit tests — mocked Prisma, no real DB |
| `tests/unit/components/analytics-page.test.tsx` | Component-level tests — mocked tRPC hooks, no real network |

The pre-existing file `tests/unit/services/analytics.test.ts` (46 pure-function tests) must remain green throughout; it is exercised as a regression guard.

---

## Harness Setup (both files)

### Router tests (`analytics.router.test.ts`)

```
Harness: vitest
DB mock: in-memory vi.fn() object injected as ctx.db
tRPC mock: vi.mock('@/server/trpc', ...) — same technique as timeoff.router.test.ts
Caller: analyticsRouter.createCaller(makeCtx())
```

The `db` mock object must expose at minimum:
- `db.employee.findMany` — vi.fn()
- `db.candidate.findMany` — vi.fn()

The `makeCtx()` helper injects `{ db, user: { companyId: 'co-1', ... } }`.

### Component tests (`analytics-page.test.tsx`)

```
Harness: vitest + @testing-library/react
tRPC mock: vi.mock('@/lib/trpc', ...) — same technique as people-page.test.tsx
Recharts mock: vi.mock('recharts', ...) — all chart components replaced with
               data-testid div stubs to avoid canvas/ResizeObserver errors
next-auth mock: vi.mock('next-auth/react', ...)
next/navigation mock: vi.mock('next/navigation', ...)
```

---

## Test Suite A — Router Unit Tests

File: `tests/unit/routers/analytics.router.test.ts`

> **Execution order note:** These tests are written BEFORE the router is fixed (RED), then go GREEN after Tasks 1–4 are applied.

---

### A-1: `headcount` — department groupBy returns correct structure

**Name:** headcount with department groupBy returns grouped counts and total  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.employee.findMany resolves with:
[
  { id: 'e1', status: 'ACTIVE', employmentType: 'FULL_TIME', startDate: new Date('2022-01-01'), endDate: null,
    department: { name: 'Engineering' }, site: { name: 'NYC' } },
  { id: 'e2', status: 'ACTIVE', employmentType: 'FULL_TIME', startDate: new Date('2023-03-01'), endDate: null,
    department: { name: 'Engineering' }, site: { name: 'NYC' } },
  { id: 'e3', status: 'ACTIVE', employmentType: 'PART_TIME', startDate: new Date('2021-06-01'), endDate: null,
    department: { name: 'Sales' }, site: { name: 'LA' } },
]
```

**Actions:**
```ts
const result = await caller.headcount({ groupBy: 'department' })
```

**Expected outcome:**
- `result.total === 3`
- `result.groupBy === 'department'`
- `result.grouped` contains `{ key: 'Engineering', count: 2 }` and `{ key: 'Sales', count: 1 }`
- `result.grouped` does NOT contain any entry with key `undefined` or `'Unassigned'` when all employees have departments
- `db.employee.findMany` was called with `where` containing `companyId: 'co-1'`

---

### A-2: `headcount` — returns `avgTenureMonths` as a number

**Name:** headcount returns avgTenureMonths computed from employee startDates  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.employee.findMany resolves with two employees:
- startDate: exactly 12 months before test execution date
- startDate: exactly 24 months before test execution date
(Use fixed dates relative to a pinned "now" to avoid flakiness — mock Date.now() or compute expected value dynamically)
```

**Actions:**
```ts
const result = await caller.headcount({ groupBy: 'department' })
```

**Expected outcome:**
- `typeof result.avgTenureMonths === 'number'`
- `result.avgTenureMonths` is approximately 18 (average of 12 and 24 months), within ±1 month of rounding
- `result.avgTenureMonths` is NOT `undefined` or `NaN`

---

### A-3: `headcount` — empty company returns total 0 and avgTenureMonths 0

**Name:** headcount with no employees returns zero total and zero avgTenureMonths  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.employee.findMany resolves with []
```

**Actions:**
```ts
const result = await caller.headcount({ groupBy: 'department' })
```

**Expected outcome:**
- `result.total === 0`
- `result.grouped` is an empty array
- `result.avgTenureMonths === 0`

---

### A-4: `headcount` — site groupBy reads `site.name` from relation

**Name:** headcount with site groupBy uses site relation name, not raw string field  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.employee.findMany resolves with:
[
  { id: 'e1', status: 'ACTIVE', employmentType: 'FULL_TIME', startDate: new Date('2022-01-01'), endDate: null,
    department: { name: 'Engineering' }, site: { name: 'NYC' } },
  { id: 'e2', status: 'ACTIVE', employmentType: 'FULL_TIME', startDate: new Date('2023-01-01'), endDate: null,
    department: { name: 'Sales' }, site: { name: 'LA' } },
]
```

**Actions:**
```ts
const result = await caller.headcount({ groupBy: 'site' })
```

**Expected outcome:**
- `result.grouped` contains `{ key: 'NYC', count: 1 }` and `{ key: 'LA', count: 1 }`
- No entry with key `undefined` appears in `result.grouped`

---

### A-5: `attrition` — overall attritionRate and byGroup returned correctly

**Name:** attrition returns overall attritionRate and byGroup with department keys  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
First db.employee.findMany call (terminated filter) resolves with:
[
  { id: 'e4', status: 'TERMINATED', endDate: new Date('2024-06-15'), employmentType: 'FULL_TIME',
    startDate: new Date('2021-01-01'), department: { name: 'Engineering' }, site: { name: 'NYC' } },
]

Second db.employee.findMany call (all employees, no status filter) resolves with:
[
  { id: 'e1', status: 'ACTIVE', startDate: new Date('2022-01-01'), endDate: null,
    department: { name: 'Engineering' }, site: { name: 'NYC' } },
  { id: 'e2', status: 'ACTIVE', startDate: new Date('2023-03-01'), endDate: null,
    department: { name: 'Engineering' }, site: { name: 'NYC' } },
  { id: 'e4', status: 'TERMINATED', startDate: new Date('2021-01-01'), endDate: new Date('2024-06-15'),
    department: { name: 'Engineering' }, site: { name: 'NYC' } },
]
Input: startDate = new Date('2024-01-01'), endDate = new Date('2024-12-31')
```

**Actions:**
```ts
const result = await caller.attrition({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
  groupBy: 'department',
})
```

**Expected outcome:**
- `result.overall.terminations === 1`
- `result.overall.attritionRate` is a number (not `undefined`)
- `result.byGroup` has at least one entry
- The entry for `'Engineering'` has `key === 'Engineering'`, `terminations === 1`
- No `byGroup` entry has key `undefined`

---

### A-6: `attrition` — site groupBy reads `site.name` from relation

**Name:** attrition with site groupBy groups by site.name not raw site string  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
Terminated employees list: one employee with site: { name: 'NYC' }
All employees list: same employee plus one active employee with site: { name: 'NYC' }
Input: groupBy: 'site', valid startDate/endDate range
```

**Actions:**
```ts
const result = await caller.attrition({ startDate, endDate, groupBy: 'site' })
```

**Expected outcome:**
- `result.byGroup[0].key === 'NYC'`
- No `byGroup` entry has key `undefined`

---

### A-7: `headcountOverTime` — returns month series with correct length and counts

**Name:** headcountOverTime returns one entry per month in range with correct headcount  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.employee.findMany resolves with:
[
  { id: 'e1', startDate: new Date('2024-01-15'), endDate: null },
  { id: 'e2', startDate: new Date('2024-02-01'), endDate: null },
  { id: 'e3', startDate: new Date('2024-03-01'), endDate: new Date('2024-04-30') },
]
Input: startDate = new Date('2024-01-01'), endDate = new Date('2024-03-31')
```

**Actions:**
```ts
const result = await caller.headcountOverTime({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-03-31'),
})
```

**Expected outcome:**
- `result` is an array of length 3 (Jan, Feb, Mar)
- `result[0]` is `{ month: '2024-01', count: 1 }` (only e1 active in Jan)
- `result[1]` is `{ month: '2024-02', count: 2 }` (e1 + e2 active in Feb)
- `result[2]` is `{ month: '2024-03', count: 3 }` (e1 + e2 + e3 all active in Mar)
- Each entry has shape `{ month: string, count: number }`

---

### A-8: `headcountOverTime` — terminated employees not counted after endDate

**Name:** headcountOverTime excludes employees who terminated before the month  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.employee.findMany resolves with:
[
  { id: 'e1', startDate: new Date('2023-06-01'), endDate: new Date('2023-12-31') },
  { id: 'e2', startDate: new Date('2023-06-01'), endDate: null },
]
Input: startDate = new Date('2024-01-01'), endDate = new Date('2024-02-28')
```

**Actions:**
```ts
const result = await caller.headcountOverTime({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-02-28'),
})
```

**Expected outcome:**
- `result[0].count === 1` (only e2 is still active in Jan 2024; e1 ended Dec 2023)
- `result[1].count === 1` (only e2 still active in Feb 2024)

---

### A-9: `headcountOverTime` — employees hired after the period are not counted

**Name:** headcountOverTime excludes employees whose startDate is after the month end  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.employee.findMany resolves with:
[
  { id: 'e1', startDate: new Date('2024-03-01'), endDate: null },
]
Input: startDate = new Date('2024-01-01'), endDate = new Date('2024-02-28')
```

**Actions:**
```ts
const result = await caller.headcountOverTime({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-02-28'),
})
```

**Expected outcome:**
- `result[0].count === 0` (e1 hasn't started yet in Jan)
- `result[1].count === 0` (e1 hasn't started yet in Feb)

---

### A-10: `headcountOverTime` — rejects date ranges exceeding 24 months

**Name:** headcountOverTime throws BAD_REQUEST when range exceeds 24 months  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.employee.findMany need not be called
Input: startDate = new Date('2022-01-01'), endDate = new Date('2024-02-01')  (25 months)
```

**Actions:**
```ts
await expect(
  caller.headcountOverTime({ startDate: new Date('2022-01-01'), endDate: new Date('2024-02-01') })
).rejects.toThrow(TRPCError)
```

**Expected outcome:**
- Throws `TRPCError` with `code: 'BAD_REQUEST'`
- Error message mentions "24 months"
- `db.employee.findMany` is NOT called

---

### A-11: `timeToHire` — returns monthly avgDays and hires for HIRED candidates

**Name:** timeToHire returns correct monthly average days-to-hire from HIRED candidates  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.candidate.findMany resolves with:
[
  {
    id: 'c1',
    stage: 'HIRED',
    createdAt: new Date('2024-03-01'),
    updatedAt: new Date('2024-03-16'),  // 15 days
    job: { companyId: 'co-1' },
  },
  {
    id: 'c2',
    stage: 'HIRED',
    createdAt: new Date('2024-03-05'),
    updatedAt: new Date('2024-03-20'),  // 15 days
    job: { companyId: 'co-1' },
  },
]
Input: startDate = new Date('2024-03-01'), endDate = new Date('2024-03-31')
```

**Actions:**
```ts
const result = await caller.timeToHire({
  startDate: new Date('2024-03-01'),
  endDate: new Date('2024-03-31'),
})
```

**Expected outcome:**
- `result` is an array with one entry for March 2024
- `result[0].month === '2024-03'`
- `result[0].hires === 2`
- `result[0].avgDays === 15` (or within floating-point rounding of 15)
- Each entry has shape `{ month: string, avgDays: number, hires: number }`

---

### A-12: `timeToHire` — candidates from other companies are excluded

**Name:** timeToHire excludes HIRED candidates whose job belongs to a different company  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
The query is called with where: { job: { companyId: 'co-1' } } —
either the DB mock enforces this via the query shape, or the test verifies
db.candidate.findMany was called with where containing job.companyId = 'co-1'.

Simulate cross-company isolation one of two ways:
  Option A (preferred): assert the Prisma call includes the companyId filter in where
  Option B: mock returns a mix of company candidates and verify the result only
            includes the correct company's data (if in-memory filter is used)

For this test, set up db.candidate.findMany to return only company 'co-2' candidates,
and verify result is empty.
```

**Actions:**
```ts
// db.candidate.findMany mock returns candidates with job.companyId = 'co-2'
// but ctx.user.companyId = 'co-1'
const result = await caller.timeToHire({ startDate, endDate })
```

**Expected outcome:**
- Either `result` is an empty array (if in-memory filter is applied after include)
- OR `db.candidate.findMany` is called with `where` containing `job: { companyId: 'co-1' }` (asserting DB-level isolation)

---

### A-13: `timeToHire` — empty results return empty array

**Name:** timeToHire returns empty array when no HIRED candidates exist in range  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.candidate.findMany resolves with []
```

**Actions:**
```ts
const result = await caller.timeToHire({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-03-31'),
})
```

**Expected outcome:**
- `result` is `[]`
- No exception thrown

---

### A-14: `diversity` — does not crash on valid employees and does not reference jobTitle

**Name:** diversity procedure returns without error and omits jobTitle references  
**Type:** unit  
**Harness:** mocked Prisma via vitest

**Preconditions:**
```
db.employee.findMany resolves with:
[
  { id: 'e1', employmentType: 'FULL_TIME', startDate: new Date('2024-01-10'), endDate: null,
    department: { name: 'Engineering' } },
  { id: 'e2', employmentType: 'PART_TIME', startDate: new Date('2024-02-01'), endDate: null,
    department: { name: 'Sales' } },
]
Note: NO jobTitle field on any mock employee object
```

**Actions:**
```ts
const result = await caller.diversity({ year: 2024 })
```

**Expected outcome:**
- Call does not throw
- `result.totalEmployees === 2`
- `result.leadership` is `null` (jobTitle-based detection removed)
- `result.gender` is `null` (fabricated gender data removed)
- `result.byDepartment` contains entries for 'Engineering' and 'Sales'
- No `undefined` keys appear in `result.byDepartment`

---

## Test Suite B — Component Tests

File: `tests/unit/components/analytics-page.test.tsx`

> **Execution order note:** These tests are written BEFORE the page is rewritten (RED), then go GREEN after Task 6 is applied.

All tests in this suite use the `vi.mock('@/lib/trpc', ...)` pattern established in `people-page.test.tsx`. The mock provides `useQuery` fns that return controlled data objects. Recharts is mocked to avoid canvas/ResizeObserver issues in jsdom.

### Standard mock data used across B tests

```ts
const mockHeadcountData = {
  total: 52,
  groupBy: 'department',
  grouped: [{ key: 'Engineering', count: 30 }, { key: 'Sales', count: 22 }],
  avgTenureMonths: 18.5,
}
const mockAttritionData = {
  period: { startDate: new Date('2025-04-01'), endDate: new Date('2026-03-31') },
  overall: { terminations: 4, headcount: 52, attritionRate: 7.69 },
  byGroup: [{ key: 'Engineering', terminations: 2, headcount: 30, attritionRate: 6.67 }],
  groupBy: 'department',
}
const mockHeadcountOverTimeData = [
  { month: '2025-04', count: 48 },
  { month: '2025-05', count: 50 },
  { month: '2026-03', count: 52 },
]
const mockTimeToHireData = [
  { month: '2025-04', avgDays: 21, hires: 3 },
  { month: '2025-05', avgDays: 18, hires: 5 },
]
```

---

### B-1: Headcount stat card shows live total, not hardcoded 247

**Name:** Headcount stat card displays value from tRPC data, not hardcoded 247  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC

**Preconditions:**
```
trpc.analytics.headcount.useQuery returns { data: mockHeadcountData, isLoading: false }
trpc.analytics.attrition.useQuery returns { data: mockAttritionData, isLoading: false }
trpc.analytics.headcountOverTime.useQuery returns { data: mockHeadcountOverTimeData, isLoading: false }
trpc.analytics.timeToHire.useQuery returns { data: mockTimeToHireData, isLoading: false }
```

**Actions:**
```ts
render(<AnalyticsPage />)
```

**Expected outcome:**
- `screen.getByText('52')` is found (live total from mock data)
- `screen.queryByText('247')` returns null (hardcoded value is gone)

---

### B-2: Turnover Rate stat card shows live attritionRate, not hardcoded 8.2%

**Name:** Turnover Rate stat card displays value from tRPC attrition data, not hardcoded 8.2%  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC

**Preconditions:** Same as B-1

**Actions:**
```ts
render(<AnalyticsPage />)
```

**Expected outcome:**
- Screen contains text matching `'7.69%'` (derived from `attritionData.overall.attritionRate`)
- `screen.queryByText('8.2%')` returns null

---

### B-3: eNPS Score card shows "N/A"

**Name:** eNPS Score stat card shows N/A instead of a number  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC

**Preconditions:** Same as B-1

**Actions:**
```ts
render(<AnalyticsPage />)
```

**Expected outcome:**
- Screen contains the text `'N/A'` in the eNPS card region
- `screen.queryByText('42')` returns null (hardcoded eNPS value is gone)

---

### B-4: Avg Tenure card shows value derived from avgTenureMonths, not hardcoded 2.4y

**Name:** Avg Tenure stat card displays value derived from headcount avgTenureMonths, not hardcoded 2.4y  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC

**Preconditions:** Same as B-1 (`mockHeadcountData.avgTenureMonths = 18.5`)

**Actions:**
```ts
render(<AnalyticsPage />)
```

**Expected outcome:**
- Screen contains text matching the formatted tenure from 18.5 months (e.g. `'1.5y'` or similar formatted value)
- `screen.queryByText('2.4y')` returns null

---

### B-5: Headcount by Department chart renders (not placeholder text)

**Name:** Headcount by Department section renders a BarChart component, not placeholder text  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC + recharts

**Preconditions:** Same as B-1; recharts mocked to render `data-testid="bar-chart"` divs

**Actions:**
```ts
render(<AnalyticsPage />)
```

**Expected outcome:**
- `screen.getAllByTestId('bar-chart')` returns at least one element (for dept breakdown)
- `screen.queryByText('Recharts bar chart placeholder')` returns null

---

### B-6: Headcount Over Time chart renders

**Name:** Headcount Over Time section renders a LineChart component, not placeholder text  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC + recharts

**Preconditions:** Same as B-1; recharts mocked to render `data-testid="line-chart"` divs

**Actions:**
```ts
render(<AnalyticsPage />)
```

**Expected outcome:**
- `screen.getByTestId('line-chart')` is found
- "Gender Distribution" chart title is gone (replaced by "Headcount Over Time")

---

### B-7: Turnover by Department chart renders

**Name:** Turnover by Department section renders a BarChart component  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC + recharts

**Preconditions:** Same as B-1

**Actions:**
```ts
render(<AnalyticsPage />)
```

**Expected outcome:**
- "Turnover by Department" heading is present in the DOM
- "Turnover Trend" text (old chart title) is gone
- A `data-testid="bar-chart"` element is present for this chart

---

### B-8: Time to Hire Trend chart renders

**Name:** Time to Hire Trend section renders an AreaChart component, not placeholder text  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC + recharts

**Preconditions:** Same as B-1; recharts mocked to render `data-testid="area-chart"` divs

**Actions:**
```ts
render(<AnalyticsPage />)
```

**Expected outcome:**
- `screen.getByTestId('area-chart')` is found
- `screen.queryByText('Recharts area chart placeholder')` returns null

---

### B-9: Loading skeletons render when queries are in flight

**Name:** Analytics page renders loading skeleton states when tRPC queries are loading  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC

**Preconditions:**
```
All four trpc.analytics.*.useQuery mocks return { data: undefined, isLoading: true }
```

**Actions:**
```ts
render(<AnalyticsPage />)
```

**Expected outcome:**
- At least one skeleton element is rendered (e.g. `role="status"` or matching skeleton CSS class / data-testid)
- Stat card values (52, '7.69%', etc.) are NOT rendered
- No JavaScript exceptions thrown

---

### B-10: Charts handle empty data gracefully

**Name:** Analytics page renders "No data" or empty state when procedures return empty arrays  
**Type:** unit  
**Harness:** vitest + @testing-library/react, mocked tRPC

**Preconditions:**
```
trpc.analytics.headcount.useQuery returns { data: { total: 0, grouped: [], groupBy: 'department', avgTenureMonths: 0 }, isLoading: false }
trpc.analytics.attrition.useQuery returns { data: { ..., byGroup: [], overall: { terminations: 0, headcount: 0, attritionRate: 0 } }, isLoading: false }
trpc.analytics.headcountOverTime.useQuery returns { data: [], isLoading: false }
trpc.analytics.timeToHire.useQuery returns { data: [], isLoading: false }
```

**Actions:**
```ts
render(<AnalyticsPage />)
```

**Expected outcome:**
- Page renders without throwing
- Some "No data" indicator is visible for chart areas with empty data (exact text may vary — match against the implementation's empty-state message)

---

## Test Suite C — Regression Guard

### C-1: Existing analytics service tests remain green

**Name:** All 46 tests in `tests/unit/services/analytics.test.ts` continue to pass  
**Type:** regression  
**Harness:** vitest (existing file, no changes)

**Preconditions:**
- No modifications to `tests/unit/services/analytics.test.ts`
- No modifications to the pure functions defined within that file

**Actions:**
```
npx vitest run tests/unit/services/analytics.test.ts
```

**Expected outcome:**
- All 46 tests pass
- Exit code 0

---

### C-2: Existing hiring and employee service tests remain green

**Name:** `tests/unit/services/hiring.test.ts` and `employee.test.ts` continue to pass  
**Type:** regression  
**Harness:** vitest (existing files, no changes)

**Actions:**
```
npx vitest run tests/unit/services/hiring.test.ts tests/unit/services/employee.test.ts
```

**Expected outcome:**
- All tests in both files pass
- Exit code 0

---

### C-3: Full test suite passes (excluding live-DB router test)

**Name:** All 179 pre-existing passing tests remain green after all implementation tasks  
**Type:** regression  
**Harness:** vitest

**Actions:**
```
npx vitest run --ignore tests/unit/routers/employee.router.test.ts
```

**Expected outcome:**
- 179 + new tests pass
- `employee.router.test.ts` excluded (pre-existing failure, out of scope — requires live Postgres)
- Exit code 0

---

### C-4: TypeScript compilation succeeds

**Name:** No TypeScript errors introduced by analytics router fixes or page rewrite  
**Type:** regression  
**Harness:** tsc

**Actions:**
```
npx tsc --noEmit
```

**Expected outcome:**
- Exit code 0
- No `any` escapes remain in the analytics router for `emp.department` or `emp.site` field accesses

---

## Test Inventory Summary

| ID | Suite | Name | Type |
|---|---|---|---|
| A-1 | Router | headcount dept groupBy returns grouped counts and total | unit |
| A-2 | Router | headcount returns avgTenureMonths as a number | unit |
| A-3 | Router | headcount empty company returns 0 total and 0 avgTenureMonths | unit |
| A-4 | Router | headcount site groupBy reads site.name from relation | unit |
| A-5 | Router | attrition returns overall attritionRate and byGroup with dept keys | unit |
| A-6 | Router | attrition site groupBy reads site.name from relation | unit |
| A-7 | Router | headcountOverTime returns month series with correct length and counts | unit |
| A-8 | Router | headcountOverTime excludes employees terminated before the month | unit |
| A-9 | Router | headcountOverTime excludes employees hired after the month | unit |
| A-10 | Router | headcountOverTime throws BAD_REQUEST for ranges > 24 months | unit |
| A-11 | Router | timeToHire returns monthly avgDays and hires for HIRED candidates | unit |
| A-12 | Router | timeToHire excludes candidates from other companies | unit |
| A-13 | Router | timeToHire returns empty array when no HIRED candidates in range | unit |
| A-14 | Router | diversity does not crash and does not reference jobTitle | unit |
| B-1 | Component | Headcount stat card shows live total not hardcoded 247 | unit |
| B-2 | Component | Turnover Rate shows live attritionRate not hardcoded 8.2% | unit |
| B-3 | Component | eNPS Score shows N/A | unit |
| B-4 | Component | Avg Tenure shows derived value not hardcoded 2.4y | unit |
| B-5 | Component | Headcount by Department renders BarChart not placeholder | unit |
| B-6 | Component | Headcount Over Time renders LineChart not placeholder | unit |
| B-7 | Component | Turnover by Department renders BarChart | unit |
| B-8 | Component | Time to Hire Trend renders AreaChart not placeholder | unit |
| B-9 | Component | Loading skeletons render when queries are in flight | unit |
| B-10 | Component | Charts handle empty data gracefully | unit |
| C-1 | Regression | analytics.test.ts 46 pure-function tests remain green | regression |
| C-2 | Regression | hiring.test.ts and employee.test.ts remain green | regression |
| C-3 | Regression | Full suite (179+) passes excluding live-DB router test | regression |
| C-4 | Regression | TypeScript compiles with no errors | regression |

**Total: 28 test specifications across 3 suites**

---

## Execution Order

Mirrors the implementation plan's execution order to enforce RED → GREEN discipline:

1. Write Suite A tests (A-1 through A-14) — tests are RED against current buggy router
2. Apply Tasks 1–4 (fix router bugs, add procedures) — Suite A goes GREEN
3. Write Suite B tests (B-1 through B-10) — tests are RED against current hardcoded page
4. Apply Task 6 (rewrite analytics page) — Suite B goes GREEN
5. Run Suite C (regression) — verify all existing tests still pass
6. Run `npx tsc --noEmit` — verify TypeScript is clean
