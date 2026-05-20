# Implementation Plan: Wire Analytics Module

**Branch:** `wire-analytics-module`
**Date:** 2026-04-02
**Goal:** Replace all hardcoded chart data in the Analytics page with real tRPC calls,
including stat cards, headcount over time, turnover rate, department breakdown, and
hiring funnel charts using Recharts wired to real database aggregates.

---

## Codebase Context

### Key files
| File | Status |
|---|---|
| `src/server/routers/analytics.ts` | Has 3 procedures (`headcount`, `attrition`, `diversity`) — all have schema bugs |
| `src/app/(dashboard)/analytics/page.tsx` | Fully hardcoded — 4 chart placeholders, 4 hardcoded stat card values |
| `prisma/schema.prisma` | `Employee.departmentId` is a FK to `Department`; `Employee.siteId` is a FK to `Site`; no `jobTitle` field |
| `src/server/routers/hiring.ts` | Has `Candidate` records with `stage` field and `createdAt` — usable for hiring funnel |
| `src/lib/trpc.ts` | `createTRPCReact<AppRouter>()` client already configured |
| `src/app/providers.tsx` | `trpc.Provider` already mounted |
| `recharts` | Already installed at `^2.10.3` |
| `tests/unit/services/analytics.test.ts` | 46 pure-function tests — must stay GREEN |
| `tests/unit/components/*.test.tsx` | Pattern established — mock `@/lib/trpc` via `vi.mock` |

### Baseline test state
- 179 tests passing (16 files) when excluding live-DB router tests
- 1 test file fails on setup when no local Postgres is available (`employee.router.test.ts`)
  — this is pre-existing and out of scope

---

## Bug Analysis: `analyticsRouter` Schema Bugs (Must Fix First)

### Bug 1 — `headcount` procedure: `emp.department` and `emp.site` don't exist
The router reads `emp.department` and `emp.site` as strings but the Employee model has
`departmentId` (FK) and `siteId` (FK). The `findMany` does not include the relations, so
those fields are always `undefined`.

**Fix:** Add `include: { department: { select: { name: true } }, site: { select: { name: true } } }`
to the `findMany`, then read `emp.department?.name` and `emp.site?.name`.

### Bug 2 — `attrition` procedure: same `emp.department` / `emp.site` problem
Same as Bug 1. The attrition groupBy logic reads `emp.department` and `emp.site` which
are both always `undefined`.

**Fix:** Same include + name access pattern as Bug 1.

### Bug 3 — `diversity` procedure: reads `emp.jobTitle` and `emp.department` which don't exist
The `select` clause casts to `any` to suppress the TypeScript error but Prisma still won't
return `jobTitle` or `department` because those columns do not exist. The
`leadershipEmployees` filter and department grouping will silently produce empty/wrong output.

**Fix:** Remove `jobTitle` from select entirely. For department grouping, use
`include: { department: { select: { name: true } } }` and read `emp.department?.name`.
Leadership detection based on `jobTitle` cannot work — replace with a simple
`workInfo`-based check or remove that metric (return `leadership: null` for now).

---

## New Procedures to Add to `analyticsRouter`

### Procedure 4 — `headcountOverTime`
**Purpose:** Monthly employee headcount series for a date range (Line/Area chart).

**Input schema:**
```ts
z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
})
```

**Output:**
```ts
Array<{ month: string; count: number }> // e.g. [{ month: "2024-01", count: 23 }, ...]
```

**Implementation (Option A — in-memory month series):**
1. Fetch all employees for the company with `startDate` and `endDate` fields.
2. Iterate over months from `startDate` to `endDate`.
3. For each month (last day of month), count employees where
   `emp.startDate <= monthEnd && (emp.endDate == null || emp.endDate >= monthStart)`.
4. Return the series array.

This avoids raw SQL and works with both SQLite and PostgreSQL.

### Procedure 5 — `timeToHire`
**Purpose:** Monthly average days-to-hire series for the hiring funnel chart.

**Input schema:**
```ts
z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
})
```

**Output:**
```ts
Array<{ month: string; avgDays: number; hires: number }>
```

**Implementation (Option A — compute from Candidate records):**
1. Fetch all `Candidate` records for the company's `JobPosting`s where
   `stage = 'HIRED'` and `updatedAt` falls within the date range.
2. Compute `daysDiff = (candidate.updatedAt - candidate.createdAt) / ms_per_day`.
3. Group by calendar month of `candidate.updatedAt`.
4. Return `[{ month, avgDays: avg(daysDiff), hires: count }]` per month.

Note: `Candidate` does not have a direct `companyId` — join through `job.companyId`.
Preferred Prisma query (pushes company filter to DB):
```ts
ctx.db.candidate.findMany({
  where: {
    stage: 'HIRED',
    updatedAt: { gte: input.startDate, lte: input.endDate },
    job: { companyId: ctx.user.companyId },
  },
})
```
Fallback: `include: { job: { select: { companyId: true } } }` and filter in-memory if the nested `where` is unsupported in the runtime Prisma version.

---

## UI Changes: `src/app/(dashboard)/analytics/page.tsx`

Replace the entire hardcoded page with a wired component. Structure:

### Stat cards (top row)
Replace hardcoded values with real tRPC data:

| Card | tRPC call | Derived value |
|---|---|---|
| Headcount | `analytics.headcount` (no date range → all ACTIVE) | `data.total` |
| Turnover Rate | `analytics.attrition` (trailing 12 months) | `data.overall.attritionRate` + `%` |
| Avg Tenure | Compute from `analytics.headcount` employees | Compute months from `startDate` |
| eNPS Score | Not available in DB — show `"N/A"` (no fake data) |

> **Important:** The `headcount` procedure returns only the count of currently active
> employees (no individual startDate). To compute average tenure we need a different
> query. Simplest approach: make the `headcount` procedure also return
> `avgTenureMonths` by computing it server-side from the fetched employees'
> `startDate` fields before returning.

Update `headcount` procedure to also return:
```ts
avgTenureMonths: number  // average months since startDate for ACTIVE employees
```

### Charts (bottom 2×2 grid)

| Chart | tRPC procedure | Recharts type |
|---|---|---|
| Headcount by Department | `analytics.headcount({ groupBy: 'department' })` | `BarChart` |
| Headcount Over Time | `analytics.headcountOverTime({ startDate, endDate })` | `LineChart` |
| Turnover by Department | `analytics.attrition({ ... groupBy: 'department' })` | `BarChart` |
| Time to Hire Trend | `analytics.timeToHire({ startDate, endDate })` | `AreaChart` |

> Replace the placeholder `"Gender Distribution"` chart with `"Headcount Over Time"`
> — gender data is fabricated in the current code and should not be shown.
> Replace `"Turnover Trend"` (which had no data source) with `"Turnover by Department"`.

---

## Task Breakdown

> **IMPORTANT — follow the Execution Order section at the bottom, not task numbers.**
> Task 5 (router tests, RED) must be written BEFORE Tasks 1–4 (router fixes) so the
> tests provably start red. Task 7 (component tests, RED) must be written BEFORE Task 6
> (page rewrite). Task numbers reflect logical grouping, not implementation order.

### Task 1 — Fix Bug 1 + Bug 2: `headcount` and `attrition` procedures
**File:** `src/server/routers/analytics.ts`

Steps:
1. In `headcount` procedure: add `include: { department: { select: { name: true } }, site: { select: { name: true } } }` to both `findMany` calls. Update groupBy reads to use `emp.department?.name` and `emp.site?.name`.
2. Also compute and return `avgTenureMonths` from the ACTIVE employees' `startDate` values.
   - `avgTenureMonths` is always computed from the employees returned by the query (which are
     filtered to `status: 'ACTIVE'` when no date range is provided). When a `startDate`/`endDate`
     range is given the procedure returns employees active during that window; compute
     `avgTenureMonths` from that set. Return `0` if the set is empty.
   - Formula: `avg((now - emp.startDate) / (365.25/12))`, rounded to one decimal.
3. In `attrition` procedure: add the same `include` to both `findMany` calls (terminated and all). Update groupBy reads.

**Verification:** TypeScript must compile with no `any` escapes for these fields.

### Task 2 — Fix Bug 3: `diversity` procedure
**File:** `src/server/routers/analytics.ts`

Steps:
1. Remove the entire `select` clause (including the `as any` cast) from the `findMany` call and replace it with `include: { department: { select: { name: true } } }`. Do not keep both `select` and `include` — Prisma rejects that combination at runtime.
2. Remove `emp.jobTitle` references entirely.
3. Replace `leadershipRoles`/`leadershipEmployees` logic with `leadership: null` (or remove the field).
4. Update `departmentGroups` to use `emp.department?.name`.
5. Keep the gender diversity section but mark it clearly as placeholder: return `gender: null` until real gender data is in the schema.

### Task 3 — Add `headcountOverTime` procedure
**File:** `src/server/routers/analytics.ts`

Steps:
1. Add input schema.
2. Guard: if `endDate - startDate > 24 months`, throw `new TRPCError({ code: 'BAD_REQUEST', message: 'Date range must not exceed 24 months' })`.
3. Fetch all employees for company with `startDate` and `endDate`.
4. Iterate months from `input.startDate` to `input.endDate`, counting active employees per month.
5. Return `Array<{ month: string; count: number }>`.

### Task 4 — Add `timeToHire` procedure
**File:** `src/server/routers/analytics.ts`

Steps:
1. Add input schema.
2. Fetch HIRED candidates via `jobPosting` join (filter by company).
3. Filter candidates where `updatedAt` is in `[startDate, endDate]`.
4. Group by month, compute avg days and hire count per month.
5. Return `Array<{ month: string; avgDays: number; hires: number }>`.

### Task 5 — Write router unit tests (RED → GREEN)
**File:** `tests/unit/routers/analytics.router.test.ts` (new)

Write tests with Prisma mocked using `vi.mock`. Tests must start RED (before Tasks 1–4 are complete) and go GREEN after. Pattern mirrors `timeoff.router.test.ts` / `employee.router.test.ts` but uses mocked Prisma (not live DB) to avoid needing a running PostgreSQL.

Tests to write:
1. `headcount` with department groupBy — returns grouped counts and correct total, reads `department.name` (not raw string)
2. `headcount` returns `avgTenureMonths` as a number
3. `attrition` — returns `overall.attritionRate` and `byGroup` with correct keys
4. `attrition` groupBy site — reads `site.name`
5. `headcountOverTime` — returns month series array with correct length and counts
6. `headcountOverTime` — employees terminating before period are not counted
7. `timeToHire` — returns monthly `avgDays` and `hires` for HIRED candidates
8. `timeToHire` — candidates from other companies are excluded
9. `diversity` — no longer references `jobTitle` or raw `department` string (no crash on valid data)

### Task 6 — Rewrite `analytics/page.tsx`
**File:** `src/app/(dashboard)/analytics/page.tsx`

Steps:
1. Add tRPC hooks at top of component:
   - `trpc.analytics.headcount.useQuery({ groupBy: 'department' })`
   - `trpc.analytics.attrition.useQuery({ startDate: twelveMonthsAgo, endDate: today, groupBy: 'department' })`
   - `trpc.analytics.headcountOverTime.useQuery({ startDate: twelveMonthsAgo, endDate: today })`
   - `trpc.analytics.timeToHire.useQuery({ startDate: twelveMonthsAgo, endDate: today })`
2. Replace hardcoded stat card values:
   - `Headcount`: `headcountData?.total ?? '—'`
   - `Turnover Rate`: `attritionData ? attritionData.overall.attritionRate + '%' : '—'`
   - `Avg Tenure`: derive from `headcountData?.avgTenureMonths` → format as `"X.Xy"`
   - `eNPS Score`: show `"N/A"` with no change indicator
3. Replace each chart placeholder with a real Recharts component:
   - `BarChart` for "Headcount by Department" wired to `headcountData.grouped`
   - `LineChart` for "Headcount Over Time" wired to `headcountOverTimeData`
   - `BarChart` for "Turnover by Department" wired to `attritionData.byGroup`
   - `AreaChart` for "Time to Hire Trend" wired to `timeToHireData`
4. Each chart must show a skeleton/loading state while data loads.
5. Each chart must handle empty data gracefully (show "No data" text).

### Task 7 — Write analytics page component test
**File:** `tests/unit/components/analytics-page.test.tsx` (new)

Mock `@/lib/trpc` (same pattern as `people-page.test.tsx`). Mock `recharts` to avoid
canvas issues in jsdom.

Tests:
1. Stat cards show live data values (not hardcoded 247, "8.2%", "2.4y", 42)
2. `headcountData.total` value appears in the Headcount stat card
3. `attritionData.overall.attritionRate` + "%" appears in Turnover Rate stat card
4. Chart component for "Headcount by Department" renders (not placeholder text)
5. Chart component for "Headcount Over Time" renders
6. Chart component for "Turnover by Department" renders
7. Chart component for "Time to Hire Trend" renders
8. Loading state renders skeletons when queries are loading
9. "N/A" appears in eNPS card (no hardcoded number)

### Task 8 — Regression check
Run full test suite and confirm:
- All 179 pre-existing passing tests still pass
- New router unit tests (Task 5): all GREEN
- New component tests (Task 7): all GREEN
- TypeScript: `npx tsc --noEmit` exits 0

---

## Recharts Usage Pattern

Recharts requires wrapping components in `<ResponsiveContainer>`. In jsdom tests,
`ResizeObserver` is not available — mock it via `vitest.setup.ts` or inline in the test.

Also mock `recharts` in component tests to avoid canvas rendering errors:
```ts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Bar: () => null,
  Line: () => null,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))
```

---

## Month Iterator Helper

For `headcountOverTime` and `timeToHire`, use a shared private helper:

```ts
function* monthRange(start: Date, end: Date): Generator<{ year: number; month: number; label: string; monthStart: Date; monthEnd: Date }> {
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const finish = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= finish) {
    const monthStart = new Date(cur);
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59, 999);
    yield {
      year: cur.getFullYear(),
      month: cur.getMonth() + 1,
      label: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`,
      monthStart,
      monthEnd,
    };
    cur.setMonth(cur.getMonth() + 1);
  }
}
```

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `Candidate.updatedAt` tracks all changes (not just stage moves to HIRED) | Filter by `stage = 'HIRED'` and use `updatedAt` as hire date; this is an approximation but correct for analytics |
| `timeToHire` company isolation: `Candidate` has no `companyId` | Join through `job.companyId` in query; filter in-memory after `include: { job: true }` |
| Recharts `ResizeObserver` undefined in jsdom | Mock recharts in component tests (see Recharts Usage Pattern above) |
| `headcountOverTime` with large date ranges is O(months × employees) in memory | Cap the range: if `endDate - startDate > 24 months`, throw a TRPC BAD_REQUEST |
| `diversity` leadership detection removed | Explicitly return `leadership: null` so callers don't break on missing field |
| eNPS stat card shows "N/A" instead of a number | Acceptable — better than showing fabricated data |

---

## File Change Summary

| File | Change type |
|---|---|
| `src/server/routers/analytics.ts` | Modify — fix 3 bugs, add 2 procedures, add `avgTenureMonths` |
| `src/app/(dashboard)/analytics/page.tsx` | Rewrite — replace hardcoded data with tRPC hooks + Recharts |
| `tests/unit/routers/analytics.router.test.ts` | New — router unit tests with mocked Prisma |
| `tests/unit/components/analytics-page.test.tsx` | New — component tests |

---

## Execution Order

1. Task 5 (write RED tests) — do this **before** touching the router so tests provably start RED
2. Task 1 (fix Bug 1+2 in router)
3. Task 2 (fix Bug 3 in router)
4. Task 3 (add `headcountOverTime`)
5. Task 4 (add `timeToHire`)
6. Verify router tests are now GREEN
7. Task 7 (write component tests — they start RED against hardcoded page)
8. Task 6 (rewrite analytics page)
9. Verify component tests are GREEN
10. Task 8 (full regression run)
