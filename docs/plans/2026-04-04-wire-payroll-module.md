# Wire Payroll Module — Implementation Plan

**Date:** 2026-04-04  
**Branch:** `wire-payroll-module`  
**Scope:** Build the Payroll module from scratch: add `PayRun` model, build `payrollRouter`, register it in `_app.ts`, replace the hardcoded payroll page with real tRPC calls, and seed pay run data.

---

## 1. Schema Changes

### 1.1 Add `PayRun` Model to `prisma/schema.prisma`

Append the following model **after the `OnboardingTask` model** (end of file):

```prisma
model PayRun {
  id            String    @id @default(cuid())
  companyId     String
  periodStart   DateTime
  periodEnd     DateTime
  totalAmount   Float
  currency      String    @default("USD")
  employeeCount Int
  status        String    @default("PENDING")  // PENDING | PROCESSING | COMPLETED | FAILED
  processedAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  @@index([companyId])
  @@index([status])
  @@index([periodStart])
}
```

### 1.2 Add `payRuns` Back-Relation on `Company`

In the `Company` model, add the `payRuns` back-relation field alongside the existing relation fields:

```prisma
// Add this line to the Company model's relation fields block
payRuns            PayRun[]
```

The full updated `Company` model relations block becomes:
```prisma
  employees          Employee[]
  departments        Department[]
  sites              Site[]
  timeOffPolicies    TimeOffPolicy[]
  reviewCycles       ReviewCycle[]
  goals              Goal[]
  salaryBands        SalaryBand[]
  jobPostings        JobPosting[]
  surveys            Survey[]
  documents          Document[]
  positions          Position[]
  auditLogs          AuditLog[]
  webhooks           Webhook[]
  onboardingTemplates OnboardingTemplate[]
  payRuns            PayRun[]
```

### 1.3 Apply Schema to the Database

This project uses `prisma db push` (not migrations). Run:

```bash
npx prisma db push
```

Then regenerate the Prisma client:

```bash
npx prisma generate
```

Both commands are safe to re-run. `db push` introspects the schema diff and applies it without creating a migration file. This is the correct approach for this Docker-based development environment — confirmed by the absence of a `prisma/migrations/` directory in the repo.

---

## 2. Router Implementation

**File to create:** `src/server/routers/payroll.ts`

### 2.1 Input Schemas

```ts
import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';

const listPayRunsSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
  limit: z.number().min(1).max(100).default(10),
  cursor: z.string().optional(),
});

const createPayRunSchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  totalAmount: z.number().positive(),
  currency: z.string().default('USD'),
  employeeCount: z.number().int().positive(),
});
```

There is no separate input schema for `getSummary` — it takes no input (it aggregates across the caller's entire company).

### 2.2 `listPayRuns` Procedure

```ts
listPayRuns: protectedProcedure.input(listPayRunsSchema).query(async ({ ctx, input }) => {
  const { status, limit, cursor } = input;
  const where: any = { companyId: ctx.user.companyId };
  if (status) where.status = status;
  const payRuns = await ctx.db.payRun.findMany({
    where,
    orderBy: { periodStart: 'desc' },
    take: limit + 1,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  });
  let nextCursor: typeof cursor | undefined = undefined;
  if (payRuns.length > limit) {
    const nextItem = payRuns.pop();
    nextCursor = nextItem?.id;
  }
  return { payRuns, nextCursor };
}),
```

Key behaviors:
- Scoped to `ctx.user.companyId` — never returns another company's pay runs.
- Optional `status` filter.
- Cursor-based pagination: returns `limit + 1` records; if the extra record exists, pops it and returns its `id` as `nextCursor`.
- Ordered by `periodStart` descending so the most recent run appears first.

### 2.3 `getSummary` Procedure

`getSummary` returns aggregated statistics for the page's stat cards. All aggregation is performed in JavaScript (no raw SQL), as required.

```ts
getSummary: protectedProcedure.query(async ({ ctx }) => {
  const payRuns = await ctx.db.payRun.findMany({
    where: { companyId: ctx.user.companyId },
    orderBy: { periodStart: 'desc' },
  });

  // Total payroll YTD: sum of totalAmount for COMPLETED runs in the current calendar year
  const currentYear = new Date().getFullYear();
  const completedThisYear = payRuns.filter(
    r => r.status === 'COMPLETED' && new Date(r.periodStart).getFullYear() === currentYear
  );
  const totalPayrollYTD = completedThisYear.reduce((sum, r) => sum + r.totalAmount, 0);

  // Latest completed run's employeeCount (most recent headcount snapshot)
  const lastCompleted = payRuns.find(r => r.status === 'COMPLETED');
  const employeeCount = lastCompleted?.employeeCount ?? 0;

  // Next run date: periodEnd of the most recent COMPLETED run + 1 day
  // (i.e. the next pay period starts the day after the last period ended)
  let nextRunDate: Date | null = null;
  if (lastCompleted) {
    const next = new Date(lastCompleted.periodEnd);
    next.setDate(next.getDate() + 1);
    nextRunDate = next;
  }

  // Pending reviews: count of PENDING pay runs
  const pendingCount = payRuns.filter(r => r.status === 'PENDING').length;

  return { totalPayrollYTD, employeeCount, nextRunDate, pendingCount };
}),
```

Key design decisions:
- All `payRun.findMany` results are loaded into memory and filtered/reduced in JS. The dataset is small (pay runs accumulate ~24/year), so this is appropriate without raw SQL.
- `totalPayrollYTD` only sums `COMPLETED` runs to avoid counting incomplete or failed payroll in the total.
- `employeeCount` is taken from the most recent completed run, not a live employee query — this reflects the headcount at the time of the last processed payroll.
- `nextRunDate` is derived from `lastCompleted.periodEnd + 1 day`. If there are no completed runs, `nextRunDate` is `null`.
- `pendingCount` is the stat card "Pending Reviews" — the count of pay runs awaiting processing.

### 2.4 `createPayRun` Procedure

```ts
createPayRun: protectedProcedure.input(createPayRunSchema).mutation(async ({ ctx, input }) => {
  if (input.periodStart >= input.periodEnd) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'periodStart must be before periodEnd' });
  }
  const payRun = await ctx.db.payRun.create({
    data: {
      companyId: ctx.user.companyId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      totalAmount: input.totalAmount,
      currency: input.currency,
      employeeCount: input.employeeCount,
      status: 'PENDING',
    },
  });
  return payRun;
}),
```

Key behaviors:
- Validates `periodStart < periodEnd`; throws `BAD_REQUEST` if violated. Prisma is not called if this check fails.
- `companyId` is always injected from `ctx.user.companyId` — never from input.
- `status` is always `'PENDING'` on creation; the caller cannot set it.
- Returns the full created `PayRun` record.

### 2.5 Full Router Export

All procedures are defined **inline** inside the `router({...})` call — not as separate top-level variables. The snippets in §2.2–2.4 show the procedure bodies as they appear embedded in the object literal. The complete file structure is:

```ts
import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';

// --- input schemas (from §2.1) ---
const listPayRunsSchema = z.object({ ... });
const createPayRunSchema = z.object({ ... });

export const payrollRouter = router({
  listPayRuns: protectedProcedure.input(listPayRunsSchema).query(async ({ ctx, input }) => {
    // body from §2.2
  }),

  getSummary: protectedProcedure.query(async ({ ctx }) => {
    // body from §2.3
  }),

  createPayRun: protectedProcedure.input(createPayRunSchema).mutation(async ({ ctx, input }) => {
    // body from §2.4
  }),
});
```

Do **not** declare `listPayRuns`, `getSummary`, or `createPayRun` as standalone `const` variables — embed them directly as object keys, matching the pattern used in every other router in this codebase (e.g. `src/server/routers/performance.ts`).

---

## 3. Register Router in `_app.ts`

**File:** `src/server/routers/_app.ts`

Add import and registration:

```ts
import { router } from '@/server/trpc';
import { employeeRouter } from './employee';
import { timeoffRouter } from './timeoff';
import { hiringRouter } from './hiring';
import { performanceRouter } from './performance';
import { analyticsRouter } from './analytics';
import { payrollRouter } from './payroll';

export const appRouter = router({
  employee: employeeRouter,
  timeoff: timeoffRouter,
  hiring: hiringRouter,
  performance: performanceRouter,
  analytics: analyticsRouter,
  payroll: payrollRouter,
});
export type AppRouter = typeof appRouter;
```

This follows the exact same pattern used by all existing routers — one import line and one key added to the `router({...})` object.

---

## 4. Page Rewrite

**File:** `src/app/(dashboard)/payroll/page.tsx`

### 4.1 Stat Card Derivations

The current page has four hardcoded stat cards. Here is how each will be derived from `trpc.payroll.getSummary`:

| Card | Hardcoded | Source | Derivation |
|---|---|---|---|
| Total Payroll | `"$1.2M"` | `getSummary.totalPayrollYTD` | Format as USD currency string |
| Employees | `247` | `getSummary.employeeCount` | Direct integer value from last completed run |
| Next Run | `"Apr 1"` | `getSummary.nextRunDate` | Format as `"MMM D"` (e.g. `"Apr 16"`) |
| Pending Reviews | `3` | `getSummary.pendingCount` | Direct integer count of PENDING runs |

**Currency formatting helper:**
```ts
function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency,
    notation: 'compact', maximumFractionDigits: 1,
  }).format(amount);
  // e.g. $1.2M, $580K
}
```

**Date formatting helper (for Next Run and pay period display):**
```ts
function formatDate(date: Date | string | null | undefined, pattern: 'short' | 'period' = 'short'): string {
  if (!date) return '—';
  const d = new Date(date);
  if (pattern === 'short') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    // e.g. "Apr 1"
  }
  // pattern === 'period': "Mar 1 – Mar 15"
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatPeriod(start: Date | string, end: Date | string): string {
  const s = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const e = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${s} – ${e}`;
}
```

### 4.2 tRPC Query Plan

```tsx
// Two queries for the page
const { data: summary, isLoading: summaryLoading } =
  trpc.payroll.getSummary.useQuery();

const { data: runsData, isLoading: runsLoading } =
  trpc.payroll.listPayRuns.useQuery({ limit: 10 });
```

### 4.3 Create `src/components/ui/skeleton.tsx`

`Skeleton` does not exist in the codebase. Create it with the following content before wiring loading states:

```tsx
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-gray-200', className)}
      {...props}
    />
  );
}
```

### 4.4 Stat Card Loading States

While `summaryLoading` is `true`, render `<Skeleton className="h-24 w-full" />` for each stat card (4 skeletons). This matches the analytics page pattern.

Import `Skeleton` from `@/components/ui/skeleton`.

### 4.5 Pay Run Table Rewrite

The current table renders a hardcoded array of 3 pay runs. Replace it with `runsData?.payRuns.map(...)`.

**Field mapping:**
- Period: `formatPeriod(run.periodStart, run.periodEnd)`
- Amount: `formatCurrency(run.totalAmount, run.currency)`
- Processed date: `run.processedAt ? formatDate(run.processedAt) : '—'`
- Status badge: see §4.6 below

**Loading state:** Render 3 skeleton rows (`<Skeleton className="h-14 w-full" />`) while `runsLoading`.

**Empty state:** When `runsData?.payRuns.length === 0`, show a centered message: `"No pay runs yet."` inside the card.

### 4.6 Status Badge Variant Mapping

| Status | Badge variant |
|---|---|
| `COMPLETED` | `"success"` (green) |
| `PENDING` | `"warning"` (yellow) |
| `PROCESSING` | `"default"` (blue/indigo) |
| `FAILED` | `"destructive"` (red) |

### 4.7 Full Page Component Architecture

```
PayrollPage ("use client")
├── Header row (title: "Payroll")
├── Stat cards grid (4 cards from getSummary)
│   ├── Total Payroll (totalPayrollYTD formatted as currency)
│   ├── Employees (employeeCount)
│   ├── Next Run (nextRunDate formatted as "MMM D")
│   └── Pending Reviews (pendingCount)
└── "Recent Pay Runs" card
    └── Pay run rows from listPayRuns
        ├── Period range (periodStart – periodEnd)
        ├── Processed date (processedAt or "—")
        ├── Amount (totalAmount formatted)
        └── Status badge
```

No modals or mutations are needed for the initial page rewrite — `createPayRun` is available for future use but the page spec does not call for a "Create Pay Run" button.

---

## 5. Seed Data

**File:** `prisma/seed.ts`

### 5.1 Clear-List Addition

`PayRun` must be added to the `tables` clear-list **before** `Company` (because `PayRun` has a cascade-delete relation to `Company`, but `$executeRawUnsafe("DELETE FROM ...")` operates in order and the FK constraint requires pay runs be deleted before the company row):

```ts
const tables = [
  "PayRun",            // <-- add here, before Company
  "OnboardingTask","OnboardingTemplate","Webhook","AuditLog","Position","Document",
  "SurveyResponse","Survey","Candidate","JobPosting","SalaryBand","CompensationRecord",
  "KeyResult","Goal","PerformanceReview","ReviewCycle","Attendance","TimeOffRequest",
  "TimeOffPolicy","User","Employee","Team","Department","Site","Company"
];
```

> **Why `PayRun` before `Company`?** `PayRun.companyId` references `Company.id` with `onDelete: Cascade`. However, `$executeRawUnsafe("DELETE FROM ...")` bypasses Prisma's cascade logic and issues raw SQL deletes. If `Company` is deleted first while `PayRun` rows still reference it, the FK constraint raises a violation. Adding `"PayRun"` before `"Company"` ensures pay runs are cleared first.

### 5.2 Seed Pay Run Records

Add the following `payRun` creation block **after** the `Company` is created and its `id` is available as `company.id`. A good location is just before `console.log("Seed completed successfully!")` at the end of `main()`.

The 28 seeded employees represent a realistic payroll. Using approximate salary data from the `CompensationRecord` seed (anchored on known salaries: CEO $350K, VP Eng $220K, Sr Backend $140K, Sr Frontend $120K, Design Lead $130K, with remaining roles estimated):

**Estimated monthly salary burden for 28 employees:**
- 1× CEO: $350K/yr = $29,167/mo
- 1× VP Eng: $220K/yr = $18,333/mo
- 1× VP Product: $200K/yr = $16,667/mo
- 1× VP Design: $180K/yr = $15,000/mo
- 2× Eng Manager: $160K/yr each = $26,667/mo
- 1× Sr Backend: $140K/yr = $11,667/mo
- 1× Backend: $110K/yr = $9,167/mo
- 2× Eng Manager (Frontend/DevOps): $155K/yr each = $25,833/mo
- 1× Sr Frontend: $120K/yr = $10,000/mo
- 1× Frontend: $100K/yr = $8,333/mo
- 1× DevOps: $130K/yr = $10,833/mo
- 2× Sr PM + Product Analyst: $160K + $120K = $23,333/mo
- 1× Design Lead: $130K/yr = $10,833/mo
- 1× UI Designer: $90K/yr = $7,500/mo
- 1× Marketing Mgr: $120K/yr = $10,000/mo
- 1× Content Writer: $80K/yr = $6,667/mo
- 1× Growth Specialist: $90K/yr = $7,500/mo
- 1× Sales Mgr: $140K/yr = $11,667/mo
- 1× Account Exec: $110K/yr = $9,167/mo
- 1× SDR: $70K/yr = $5,833/mo
- 1× HR Mgr: $110K/yr = $9,167/mo
- 1× Recruiter: $80K/yr = $6,667/mo
- 1× Finance Mgr: $130K/yr = $10,833/mo
- 1× Accountant: $85K/yr = $7,083/mo
- 1× Ops Mgr: $110K/yr = $9,167/mo
- 1× HR Intern: $40K/yr = $3,333/mo

**Total estimated monthly payroll: ~$360,000**  
**Bi-monthly (semi-monthly, 15-day periods): ~$180,000 per pay run**

The seed data uses 6 pay runs covering the past 3 months (bi-monthly cadence), with small realistic variance between runs:

```ts
// Create Pay Runs
await Promise.all([
  prisma.payRun.create({ data: {
    companyId: company.id,
    periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-01-15"),
    totalAmount: 182_450, currency: "USD", employeeCount: 28,
    status: "COMPLETED", processedAt: new Date("2026-01-15"),
  }}),
  prisma.payRun.create({ data: {
    companyId: company.id,
    periodStart: new Date("2026-01-16"), periodEnd: new Date("2026-01-31"),
    totalAmount: 179_820, currency: "USD", employeeCount: 28,
    status: "COMPLETED", processedAt: new Date("2026-01-31"),
  }}),
  prisma.payRun.create({ data: {
    companyId: company.id,
    periodStart: new Date("2026-02-01"), periodEnd: new Date("2026-02-15"),
    totalAmount: 183_110, currency: "USD", employeeCount: 28,
    status: "COMPLETED", processedAt: new Date("2026-02-15"),
  }}),
  prisma.payRun.create({ data: {
    companyId: company.id,
    periodStart: new Date("2026-02-16"), periodEnd: new Date("2026-02-28"),
    totalAmount: 178_990, currency: "USD", employeeCount: 28,
    status: "COMPLETED", processedAt: new Date("2026-02-28"),
  }}),
  prisma.payRun.create({ data: {
    companyId: company.id,
    periodStart: new Date("2026-03-01"), periodEnd: new Date("2026-03-15"),
    totalAmount: 184_230, currency: "USD", employeeCount: 28,
    status: "COMPLETED", processedAt: new Date("2026-03-15"),
  }}),
  prisma.payRun.create({ data: {
    companyId: company.id,
    periodStart: new Date("2026-03-16"), periodEnd: new Date("2026-03-31"),
    totalAmount: 181_670, currency: "USD", employeeCount: 28,
    status: "PENDING", processedAt: null,
  }}),
]);
```

**Resulting summary stats from this seed data:**
- `totalPayrollYTD` (COMPLETED runs in 2026): 182,450 + 179,820 + 183,110 + 178,990 + 184,230 = **$908,600** (formats as `~$908.6K`)
- `employeeCount`: `28` (from the most recent COMPLETED run, Mar 1–15)
- `nextRunDate`: Mar 31 + 1 day = **April 1, 2026** (formats as `"Apr 1"` — coincidentally matches the current hardcoded value)
- `pendingCount`: `1` (the Mar 16–31 run with `status: "PENDING"`)

---

## 6. Test Cases

### 6.1 Router Unit Tests

**File to create:** `tests/unit/routers/payroll.router.test.ts`

Follow the exact pattern from `tests/unit/routers/performance.router.test.ts`:
- Define `const db = { payRun: { findMany: vi.fn(), create: vi.fn() } }` inline
- `vi.mock('@/lib/db', () => ({ prisma: db }))`
- `vi.mock('@/server/trpc', ...)` stub that uses `initTRPC` with a session-aware `isAuthed` middleware
- Import `payrollRouter` and call `payrollRouter.createCaller(ctx)`

**Mock `db` shape:**
```ts
const db = {
  payRun: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
};
```

**`makeCtx()` helper:**
```ts
function makeCtx() {
  return {
    db: db as any,
    session: {
      user: { id: 'user-1', email: 'a@b.com', role: 'ADMIN',
               companyId: 'co-1', employeeId: 'emp-1', name: 'Alice' },
      expires: '',
    },
    user: { id: 'user-1', email: 'a@b.com', role: 'ADMIN',
             companyId: 'co-1', employeeId: 'emp-1', name: 'Alice' },
  };
}
```

**Standard mock record:**
```ts
const mockPayRun = {
  id: 'run-1',
  companyId: 'co-1',
  periodStart: new Date('2026-03-01'),
  periodEnd: new Date('2026-03-15'),
  totalAmount: 184_230,
  currency: 'USD',
  employeeCount: 28,
  status: 'COMPLETED',
  processedAt: new Date('2026-03-15'),
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-15'),
};
```

**13 Test Cases (PR-1 to PR-13):**

| ID | Procedure | Scenario |
|---|---|---|
| PR-1 | `listPayRuns` | Returns pay runs filtered by `companyId`, ordered by `periodStart` desc |
| PR-2 | `listPayRuns` | Applies `status` filter when provided |
| PR-3 | `listPayRuns` | Returns empty array when no pay runs exist |
| PR-4 | `listPayRuns` | Returns `nextCursor` when result set exceeds `limit` |
| PR-5 | `listPayRuns` | Does NOT include pay runs from another company |
| PR-6 | `getSummary` | Returns correct `totalPayrollYTD` (sum of COMPLETED runs in current year) |
| PR-7 | `getSummary` | Returns `employeeCount` from most recent COMPLETED run |
| PR-8 | `getSummary` | Returns `nextRunDate` as `periodEnd + 1 day` of the most recent COMPLETED run |
| PR-9 | `getSummary` | Returns `pendingCount` as count of PENDING runs |
| PR-10 | `getSummary` | Returns zeroed summary (`totalPayrollYTD: 0`, `employeeCount: 0`, `nextRunDate: null`, `pendingCount: 0`) when no pay runs exist |
| PR-11 | `createPayRun` | Creates pay run with `status: 'PENDING'` and injects `companyId` from context |
| PR-12 | `createPayRun` | Throws `BAD_REQUEST` when `periodStart >= periodEnd` |
| PR-13 | `createPayRun` | Does NOT call `prisma.payRun.create` when validation fails (PR-12 guard) |

**Detailed mock setups:**

PR-2 (status filter):
```ts
db.payRun.findMany.mockResolvedValue([mockPayRun]);
const result = await caller.listPayRuns({ limit: 10, status: 'COMPLETED' });
expect(db.payRun.findMany).toHaveBeenCalledWith(
  expect.objectContaining({ where: expect.objectContaining({ status: 'COMPLETED' }) })
);
expect(result.payRuns).toHaveLength(1);
```

PR-3 (empty array):
```ts
db.payRun.findMany.mockResolvedValue([]);
const result = await caller.listPayRuns({ limit: 10 });
expect(result.payRuns).toHaveLength(0);
expect(result.nextCursor).toBeUndefined();
```

PR-5 (cross-company isolation — verified via `where` clause, not filtering):
The unit test cannot run real DB filtering; instead it asserts that the query is scoped
to `companyId: 'co-1'`. The mock returns only the caller's own record, and the test
asserts `findMany` was called with `where.companyId === 'co-1'`:
```ts
db.payRun.findMany.mockResolvedValue([mockPayRun]); // only co-1 record returned by mock
const result = await caller.listPayRuns({ limit: 10 });
expect(db.payRun.findMany).toHaveBeenCalledWith(
  expect.objectContaining({ where: expect.objectContaining({ companyId: 'co-1' }) })
);
// Confirm no other company's id was passed
expect(db.payRun.findMany).not.toHaveBeenCalledWith(
  expect.objectContaining({ where: expect.objectContaining({ companyId: 'co-2' }) })
);
```

PR-1 mock:
```ts
db.payRun.findMany.mockResolvedValue([mockPayRun]);
const result = await caller.listPayRuns({ limit: 10 });
expect(result.payRuns).toHaveLength(1);
expect(result.payRuns[0].id).toBe('run-1');
expect(db.payRun.findMany).toHaveBeenCalledWith(
  expect.objectContaining({ where: expect.objectContaining({ companyId: 'co-1' }) })
);
expect(result.nextCursor).toBeUndefined();
```

PR-4 (cursor pagination):
```ts
db.payRun.findMany.mockResolvedValue([
  { ...mockPayRun, id: 'run-1' },
  { ...mockPayRun, id: 'run-2' },
  { ...mockPayRun, id: 'run-3' },
]);
const result = await caller.listPayRuns({ limit: 2 });
expect(result.payRuns).toHaveLength(2);
expect(result.nextCursor).toBe('run-3');
```

PR-6 through PR-10 (getSummary): `db.payRun.findMany` is the only DB call. Mock it with a mix of COMPLETED and PENDING records from the current year:
```ts
const currentYear = new Date().getFullYear();
const completedRun1 = { ...mockPayRun, id: 'run-1', status: 'COMPLETED',
  periodStart: new Date(`${currentYear}-01-01`), totalAmount: 180_000, employeeCount: 28,
  periodEnd: new Date(`${currentYear}-01-15`), processedAt: new Date(`${currentYear}-01-15`) };
const completedRun2 = { ...mockPayRun, id: 'run-2', status: 'COMPLETED',
  periodStart: new Date(`${currentYear}-01-16`), totalAmount: 182_000, employeeCount: 28,
  periodEnd: new Date(`${currentYear}-01-31`), processedAt: new Date(`${currentYear}-01-31`) };
const pendingRun = { ...mockPayRun, id: 'run-3', status: 'PENDING',
  periodStart: new Date(`${currentYear}-02-01`), periodEnd: new Date(`${currentYear}-02-15`),
  processedAt: null, totalAmount: 0, employeeCount: 0 };
// findMany returns [pendingRun, completedRun2, completedRun1] (desc order by periodStart:
// pendingRun.periodStart = Feb 1 > completedRun2.periodStart = Jan 16 > completedRun1.periodStart = Jan 1)
db.payRun.findMany.mockResolvedValue([pendingRun, completedRun2, completedRun1]);
```
- PR-6: `result.totalPayrollYTD === 362_000`
- PR-7: `result.employeeCount === 28` (from `completedRun2`, the most recent with status COMPLETED)
- PR-8: `result.nextRunDate` equals `new Date(`${currentYear}-02-01`)` (Jan 31 + 1 day)
- PR-9: `result.pendingCount === 1`
- PR-10: `db.payRun.findMany.mockResolvedValue([])` → all fields are zero/null

PR-11 (createPayRun):
```ts
const createdRun = { ...mockPayRun, id: 'run-new', status: 'PENDING', processedAt: null };
db.payRun.create.mockResolvedValue(createdRun);
const result = await caller.createPayRun({
  periodStart: new Date('2026-04-01'),
  periodEnd: new Date('2026-04-15'),
  totalAmount: 185_000, currency: 'USD', employeeCount: 28,
});
expect(result.status).toBe('PENDING');
expect(db.payRun.create).toHaveBeenCalledWith(
  expect.objectContaining({
    data: expect.objectContaining({ companyId: 'co-1', status: 'PENDING' }),
  })
);
```

PR-12 + PR-13 (date validation):
```ts
await expect(
  caller.createPayRun({
    periodStart: new Date('2026-04-15'),
    periodEnd: new Date('2026-04-01'), // end before start
    totalAmount: 185_000, currency: 'USD', employeeCount: 28,
  })
).rejects.toThrow(TRPCError);
// PR-13: Prisma never called
expect(db.payRun.create).not.toHaveBeenCalled();
```

### 6.2 Component Tests

**File to create:** `tests/unit/components/payroll-page.test.tsx`

Follow the exact pattern from `tests/unit/components/hiring-page.test.tsx`:
- `vi.mock('@/lib/trpc', ...)` with stub `trpc.payroll.*` hooks
- `vi.mock('next-auth/react', ...)` with `useSession`
- `vi.mock('next/navigation', ...)`

**tRPC mock structure:**
```ts
vi.mock('@/lib/trpc', () => ({
  trpc: {
    payroll: {
      getSummary: { useQuery: vi.fn() },
      listPayRuns: { useQuery: vi.fn() },
      createPayRun: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
    },
    useContext: vi.fn(() => ({
      payroll: {
        listPayRuns: { invalidate: vi.fn() },
        getSummary: { invalidate: vi.fn() },
      },
    })),
  },
}));
```

**Standard mock data:**
```ts
const mockSummary = {
  totalPayrollYTD: 908_600,
  employeeCount: 28,
  nextRunDate: new Date('2026-04-01'),
  pendingCount: 1,
};

const mockPayRuns = [
  {
    id: 'run-1',
    companyId: 'co-1',
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-03-15'),
    totalAmount: 184_230,
    currency: 'USD',
    employeeCount: 28,
    status: 'COMPLETED',
    processedAt: new Date('2026-03-15'),
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-15'),
  },
  {
    id: 'run-2',
    companyId: 'co-1',
    periodStart: new Date('2026-02-16'),
    periodEnd: new Date('2026-02-28'),
    totalAmount: 178_990,
    currency: 'USD',
    employeeCount: 28,
    status: 'COMPLETED',
    processedAt: new Date('2026-02-28'),
    createdAt: new Date('2026-02-16'),
    updatedAt: new Date('2026-02-28'),
  },
];
```

**`setupDefaultMocks` helper:**
```ts
function setupDefaultMocks() {
  vi.mocked(trpc.payroll.getSummary.useQuery).mockReturnValue({
    data: mockSummary, isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.payroll.listPayRuns.useQuery).mockReturnValue({
    data: { payRuns: mockPayRuns, nextCursor: undefined }, isLoading: false, error: null,
  } as any);
  vi.mocked(trpc.payroll.createPayRun.useMutation).mockReturnValue({
    mutate: vi.fn(), isPending: false,
  } as any);
}

beforeEach(() => { vi.clearAllMocks(); setupDefaultMocks(); });
```

**9 Test Cases (PC-1 to PC-9):**

| ID | Scenario |
|---|---|
| PC-1 | Total Payroll stat card shows formatted `totalPayrollYTD`, not hardcoded `"$1.2M"` |
| PC-2 | Employees stat card shows `employeeCount` from `getSummary`, not hardcoded `247` |
| PC-3 | Next Run stat card shows formatted `nextRunDate`, not hardcoded `"Apr 1"` (verify via data source) |
| PC-4 | Pending Reviews stat card shows `pendingCount` from `getSummary`, not hardcoded `3` |
| PC-5 | Pay run table renders rows from `listPayRuns` data, not hardcoded 3-row array |
| PC-6 | Pay run row shows formatted period range from `periodStart`/`periodEnd` |
| PC-7 | Loading skeletons render when `getSummary` is loading |
| PC-8 | Loading skeletons render when `listPayRuns` is loading |
| PC-9 | Empty state shown when `listPayRuns` returns empty array |

**Detailed test notes:**

PC-1: Set `totalPayrollYTD: 750_000` in the mock summary (not 908,600), assert the rendered value contains "750" or "750K" somewhere, and assert that `"$1.2M"` is NOT in the document. Using a value distinct from the hardcoded value proves the component reads from data.

PC-2: Set `employeeCount: 31` in the mock (not 28, not 247), assert `screen.getByText('31')` exists and `screen.queryByText('247')` is null.

PC-3: The real proof that Next Run reads from `nextRunDate` rather than hardcoded `"Apr 1"` is to supply a date that would produce a different string. Use `nextRunDate: new Date('2026-05-16')` (formats as `"May 16"`), assert `"May 16"` is in document and `"Apr 1"` is not. Note: because the real seed data coincidentally produces "Apr 1", the test must use a different date to prove the stat is data-driven.

PC-4: Set `pendingCount: 7` in the mock (not 3), assert `screen.getByText('7')` exists and `screen.queryByText('3')` is null.

PC-5: Assert that both `mockPayRuns[0]` and `mockPayRuns[1]` period strings appear (e.g., `"Mar 1"` and `"Feb 16"`), and that none of the hardcoded period strings appear (`"Mar 1-15"`, `"Feb 16-28"`, `"Feb 1-15"`).

PC-6: Assert `screen.getByText(/Mar 1/i)` or a longer period range pattern is present in the document when `mockPayRuns` is rendered.

PC-7: Mock `getSummary.useQuery` to return `{ data: undefined, isLoading: true }`. Assert `document.querySelectorAll('.animate-pulse').length > 0`. Assert hardcoded `"$1.2M"` is not in document.

PC-8: Mock `listPayRuns.useQuery` to return `{ data: undefined, isLoading: true }`. Assert skeleton elements present. Assert no hardcoded pay run periods are rendered.

PC-9: Mock `listPayRuns.useQuery` to return `{ data: { payRuns: [], nextCursor: undefined }, isLoading: false }`. Assert `screen.getByText(/no pay runs/i)` is in document.

---

## 7. TDD Execution Order

### Phase 1: Write RED Tests (nothing implemented yet)

1. Create `tests/unit/routers/payroll.router.test.ts` with all 13 cases (PR-1 to PR-13).
2. Create `tests/unit/components/payroll-page.test.tsx` with all 9 cases (PC-1 to PC-9).
3. Run `npx vitest run tests/unit/routers/payroll.router.test.ts` — all 13 fail (module not found or import errors).
4. Run `npx vitest run tests/unit/components/payroll-page.test.tsx` — all 9 fail.

### Phase 2: Implement to GREEN

**Step 1: Schema**
- Edit `prisma/schema.prisma`: add `PayRun` model, add `payRuns PayRun[]` to `Company`.
- Run `npx prisma db push` then `npx prisma generate`.

**Step 2: Router**
- Create `src/server/routers/payroll.ts` with `listPayRuns`, `getSummary`, `createPayRun` as specified in §2.
- Run router tests: `npx vitest run tests/unit/routers/payroll.router.test.ts` → all 13 should pass.

**Step 3: Register**
- Edit `src/server/routers/_app.ts`: add `payrollRouter` import and key.

**Step 4: Rewrite Page**
- Create `src/components/ui/skeleton.tsx` as specified in §4.3.
- Rewrite `src/app/(dashboard)/payroll/page.tsx` as specified in §4.
- Run component tests: `npx vitest run tests/unit/components/payroll-page.test.tsx` → all 9 should pass.

**Step 5: Seed**
- Edit `prisma/seed.ts`:
  - Add `"PayRun"` to clear-list.
  - Add `payRun.create` block at the end of `main()`.
- Run `npx prisma db seed` to verify seed succeeds.

**Step 6: Full Regression Check**
- Run `npx vitest run` — all 271 existing tests plus 22 new tests (13 router + 9 component) must pass (293 total).

---

## 8. Files Changed

| File | Action |
|---|---|
| `prisma/schema.prisma` | Add `PayRun` model + `Company.payRuns` back-relation |
| `prisma/seed.ts` | Add `"PayRun"` to clear-list; add 6 `payRun.create` calls |
| `src/server/routers/payroll.ts` | **Create** — `payrollRouter` with 3 procedures |
| `src/server/routers/_app.ts` | Add `payrollRouter` import + key |
| `src/components/ui/skeleton.tsx` | **Create** — minimal `Skeleton` component used for loading states |
| `src/app/(dashboard)/payroll/page.tsx` | Full rewrite with `getSummary` + `listPayRuns` tRPC hooks |
| `tests/unit/routers/payroll.router.test.ts` | **Create** — 13 router unit tests (RED first) |
| `tests/unit/components/payroll-page.test.tsx` | **Create** — 9 component tests (RED first) |

No new external npm dependencies required. `StatCard`, `Card`, and `Badge` are already present in the codebase. `Skeleton` does **not** yet exist and must be created (see row above).

---

## 9. Edge Cases and Notes

- **`getSummary` year boundary:** The `totalPayrollYTD` calculation uses `new Date().getFullYear()` at query time. If the server clock is UTC and a pay run has `periodStart` in UTC Dec 31 but local time Jan 1, the run will be included in the next year's YTD. This is an acceptable edge case for a dev seed environment.

- **`getSummary` findMany order matters:** The procedure returns `findMany` with `orderBy: { periodStart: 'desc' }`. The `lastCompleted` detection uses `payRuns.find(r => r.status === 'COMPLETED')` — this correctly picks the first (most recent) completed run from the desc-sorted result set without requiring a separate query.

- **Component test date determinism:** Tests PC-5 and PC-6 assert on formatted date strings derived from `mockPayRuns[0].periodStart = new Date('2026-03-01')`. `toLocaleDateString('en-US', { month: 'short', day: 'numeric' })` produces `"Mar 1"` regardless of timezone in jsdom (which defaults to UTC). This is stable.

- **`isLoading` vs `isPending`:** The tRPC React hooks return `isLoading` for queries and `isPending` for mutations. The component mock and `mutationStub` must return both (`isLoading: false, isPending: false`) to avoid undefined-property bugs. The test assertions for loading skeletons target query states (`isLoading: true`), not mutation states.

- **`useContext` invalidation:** `trpc.useContext()` returns the cache invalidation object. The mock must include `.payroll.listPayRuns.invalidate` and `.payroll.getSummary.invalidate` so that `createPayRun.onSuccess` does not throw. Even if the page's initial implementation does not wire `createPayRun`, the mock should be present for forward compatibility.

- **Prisma `db push` vs `generate`:** `db push` alone may not regenerate the client types in all environments. Always run `prisma generate` after `db push` to ensure TypeScript picks up the new `PayRun` model types.

- **`PayRun` table name casing:** Prisma maps the model name `PayRun` to the table `"PayRun"` by default (quoted, CamelCase). The `$executeRawUnsafe` call in `seed.ts` uses quoted table names throughout (e.g., `"OnboardingTask"`). Use `"PayRun"` (quoted, capital P and R) in the clear-list to match this convention.

---

## 10. Acceptance Criteria

- [ ] `tests/unit/routers/payroll.router.test.ts` — 13 tests pass (PR-1 to PR-13)
- [ ] `tests/unit/components/payroll-page.test.tsx` — 9 tests pass (PC-1 to PC-9)
- [ ] All 271 pre-existing tests remain green (no regressions)
- [ ] `prisma/schema.prisma` contains `PayRun` model and `Company.payRuns` back-relation
- [ ] `src/server/routers/payroll.ts` exports `payrollRouter` with `listPayRuns`, `getSummary`, `createPayRun`
- [ ] `src/server/routers/_app.ts` registers `payroll: payrollRouter`
- [ ] `payroll/page.tsx` contains no hardcoded stat values (`$1.2M`, `247`, `"Apr 1"`, `3`)
- [ ] `payroll/page.tsx` contains no hardcoded pay run array (`"Mar 1-15"`, `"$580,000"`, etc.)
- [ ] Stat cards read from `trpc.payroll.getSummary` response
- [ ] Pay run table reads from `trpc.payroll.listPayRuns` response
- [ ] Loading skeletons shown while queries are in flight
- [ ] Empty state shown when no pay runs are returned
- [ ] `prisma/seed.ts` clears `"PayRun"` before `"Company"` and creates 6 realistic pay run records
- [ ] `npx prisma db seed` completes without errors after schema changes
