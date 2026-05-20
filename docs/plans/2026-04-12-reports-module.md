# Reports Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use trycycle-executing to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/reports` page and `reportsRouter` that provides four filterable, sortable, CSV-downloadable HR reports: Termination Report, Active Employees Report, Salary Report, and Future Increases Report.

**Architecture:** New `reportsRouter` with four `protectedProcedure` queries, each accepting filter/sort/pagination inputs, joined to `CompensationRecord` for salary data and reading `workInfo` JSON for `terminationReason`. New `src/app/(dashboard)/reports/` page with tab-based UI, column-toggle, per-column sorting, and client-side CSV download. All salary comes from `CompensationRecord` DB rows (not the `salaryHistory` JSON blob in `workInfo`, which is the inline-edit scratch pad). Seniority is computed from `startDate` at query time.

**Tech Stack:** tRPC v10, Prisma/PostgreSQL, Next.js 14 App Router, Tailwind CSS, Radix UI, lucide-react, Vitest + Testing Library

---

## Data Model Notes

Key fields for each report, all from the `Employee` model and relations:

| Field | Source |
|---|---|
| Employee name | `employee.firstName + ' ' + employee.lastName` |
| Seniority | Computed: `(now - employee.startDate)` in years (e.g. `2.1y`) |
| Start date | `employee.startDate` |
| End date / termination date | `employee.endDate` |
| Termination reason | `JSON.parse(employee.workInfo).terminationReason ?? ''` |
| Salary (current) | Latest `CompensationRecord` with `type='BASE_SALARY'`, `status='APPROVED'`, `effectiveDate <= now`, sorted desc — use `compensationHistory[0]?.salary ?? 0` |
| Future salary increases | `CompensationRecord` rows with `effectiveDate > now` |
| Department | `employee.department?.name` (relation) |
| Role / job title | `JSON.parse(employee.workInfo).jobTitle ?? ''` |
| Status | `employee.status` (`ACTIVE`, `INACTIVE`, `TERMINATED`) |
| Increase type | `CompensationRecord.type` (`BASE_SALARY`, `BONUS`, `EQUITY_GRANT`) |

`terminationReason` is stored in `workInfo` JSON. The `terminate` mutation on `employeeRouter` currently only sets `status: 'TERMINATED'` and `endDate` — it does NOT persist the `reason` argument into `workInfo`. **This is a bug that must be fixed in Task 1.**

---

## File Structure

| File | Action |
|---|---|
| `src/server/routers/reports.ts` | **Create** — four procedures |
| `src/server/routers/_app.ts` | **Modify** — add `reportsRouter` |
| `src/app/(dashboard)/reports/page.tsx` | **Create** — tab UI, filters, sort, CSV download |
| `src/app/(dashboard)/reports/layout.tsx` | **Create** — simple passthrough layout |
| `src/components/layout/sidebar.tsx` | **Modify** — add Reports nav link |
| `src/middleware.ts` | **Modify** — add `/reports/:path*` to matcher |
| `tests/unit/routers/reports.router.test.ts` | **Create** — 15 router unit tests |
| `tests/unit/components/reports-page.test.tsx` | **Create** — 10 component tests |

---

## Strategy Gate

**Is there a simpler path?** No. The user asked for filterable, sortable, downloadable reports. A tRPC router is the established pattern — it gives company isolation, type safety, and reusability.

**Architectural decision — where to compute salary:** `CompensationRecord` table is the right source (not `workInfo.salaryHistory` JSON). The compensation engine function `getCurrentSalary` in `src/lib/compensation-engine.ts` already encapsulates this logic.

**Architectural decision — sorting and filtering:** Do it server-side in the router where possible (department, status, date range). Column sort direction can be handled client-side since report data is paginated at a reasonable max (500 rows).

**Architectural decision — CSV download:** Client-side. The component converts the loaded array to CSV and triggers a Blob download — no new API endpoint needed.

---

## Task Breakdown

> **REQUIRED EXECUTION ORDER:**
> 1. Task 1 (fix termination reason bug — must happen first so tests use real data)
> 2. Task 2 (write router tests RED)
> 3. Task 3 (write component tests RED)
> 4. Task 4 (implement reports router — makes Task 2 tests GREEN)
> 5. Task 5 (implement reports page — makes Task 3 tests GREEN)
> 6. Task 6 (wire sidebar + middleware, run full suite)
>
> Do NOT skip ahead. Each task must complete (tests GREEN) before the next begins.

---

### Task 1: Fix `employee.terminate` to persist termination reason into `workInfo`

**Files:**
- Modify: `src/server/routers/employee.ts` (the `terminate` procedure, ~line 313)

**Why:** `terminationReason` is stored in `workInfo` JSON but the `terminate` mutation only sets `endDate` and `status`. The Termination Report needs this field. Without this fix, all existing terminated employees have an empty termination reason. The fix makes new terminations persist the reason, and the router test for this behavior can be RED before the fix.

- [ ] **Step 1: Write the failing test**

  File: `tests/unit/routers/reports.router.test.ts` — but this is a fix to the **employee** router. Add a single focused test to `tests/unit/routers/employee.router.test.ts` in the existing describe block.

  In `tests/unit/routers/employee.router.test.ts`, add inside the existing `describe('employeeRouter', ...)`:

  ```ts
  it('terminate persists reason into workInfo', async () => {
    db.employee.findUnique.mockResolvedValue({
      id: 'emp-1', companyId: 'co-1', workInfo: '{}', status: 'ACTIVE',
    });
    db.employee.update.mockResolvedValue({
      id: 'emp-1', status: 'TERMINATED', endDate: new Date('2026-04-01'),
      workInfo: '{"terminationReason":"Resignation"}', companyId: 'co-1', company: {},
    });

    await createCaller(makeCtx()).terminate({
      id: 'emp-1',
      endDate: new Date('2026-04-01'),
      reason: 'Resignation',
    });

    // update must have been called with workInfo containing terminationReason
    expect(db.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workInfo: expect.stringContaining('Resignation'),
        }),
      })
    );
  });
  ```

- [ ] **Step 2: Run to confirm it fails**

  ```bash
  cd /tmp/ws-profile-edit-clone && npm test -- --run tests/unit/routers/employee.router.test.ts 2>&1 | tail -20
  ```
  Expected: FAIL — `update` is called without `workInfo`.

- [ ] **Step 3: Fix `terminate` in `src/server/routers/employee.ts`**

  Replace the current `terminate` procedure body (around line 313):

  ```ts
  terminate: protectedProcedure.input(terminateEmployeeSchema).mutation(async ({ ctx, input }) => {
    const employee = await ctx.db.employee.findUnique({ where: { id: input.id } });
    if (!employee) throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
    if (employee.companyId !== ctx.user.companyId) throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have permission to terminate this employee' });
    const currentWorkInfo = JSON.parse(employee.workInfo || '{}');
    if (input.reason) {
      currentWorkInfo.terminationReason = input.reason;
    }
    const terminated = await ctx.db.employee.update({
      where: { id: input.id },
      data: {
        status: 'TERMINATED',
        endDate: input.endDate,
        workInfo: JSON.stringify(currentWorkInfo),
      },
      include: { company: true },
    });
    return terminated;
  }),
  ```

- [ ] **Step 4: Run test to confirm it passes**

  ```bash
  cd /tmp/ws-profile-edit-clone && npm test -- --run tests/unit/routers/employee.router.test.ts 2>&1 | tail -20
  ```
  Expected: PASS

- [ ] **Step 5: Refactor and verify full suite**

  ```bash
  cd /tmp/ws-profile-edit-clone && npm test 2>&1 | tail -15
  ```
  Expected: all previously passing tests still PASS.

- [ ] **Step 6: Commit**

  ```bash
  cd /tmp/ws-profile-edit-clone
  git add src/server/routers/employee.ts tests/unit/routers/employee.router.test.ts
  git commit -m "fix: persist terminationReason into workInfo on employee.terminate"
  ```

---

### Task 2: Write router tests RED (`tests/unit/routers/reports.router.test.ts`)

**Files:**
- Create: `tests/unit/routers/reports.router.test.ts`

This file is written BEFORE the router exists, so every test will fail with "cannot find module".

- [ ] **Step 1: Create the failing test file**

  Create `tests/unit/routers/reports.router.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, vi } from 'vitest';
  import { TRPCError } from '@trpc/server';

  // -----------------------------------------------------------------------
  // Minimal in-memory Prisma mock — no live DB
  // -----------------------------------------------------------------------
  const db = {
    employee: { findMany: vi.fn() },
    compensationRecord: { findMany: vi.fn() },
  };

  function makeCtx() {
    return {
      db: db as any,
      session: {
        user: { id: 'user-1', email: 'a@b.com', role: 'ADMIN', companyId: 'co-1', employeeId: 'emp-1', name: 'Alice' },
        expires: '',
      },
      user: { id: 'user-1', email: 'a@b.com', role: 'ADMIN', companyId: 'co-1', employeeId: 'emp-1', name: 'Alice' },
    };
  }

  vi.mock('@/lib/db', () => ({ prisma: db }));
  vi.mock('@/server/trpc', async () => {
    const { initTRPC, TRPCError } = await import('@trpc/server');
    const t = initTRPC.context<{ session: any; db: any; user: any }>().create();
    const isAuthed = t.middleware(({ ctx, next }) => {
      if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      return next({ ctx: { session: ctx.session, db: ctx.db, user: ctx.session.user } });
    });
    return { router: t.router, publicProcedure: t.procedure, protectedProcedure: t.procedure.use(isAuthed) };
  });

  import { reportsRouter } from '@/server/routers/reports';

  function createCaller(ctx: any) {
    return reportsRouter.createCaller(ctx);
  }

  // -----------------------------------------------------------------------
  // Helpers to build mock employees with workInfo and compensationHistory
  // -----------------------------------------------------------------------
  function makeEmployee(overrides: Partial<{
    id: string; firstName: string; lastName: string; status: string;
    startDate: Date; endDate: Date | null; companyId: string;
    workInfo: string; department: { name: string } | null;
    compensationHistory: Array<{ type: string; status: string; effectiveDate: Date; salary: number | null }>;
  }> = {}) {
    return {
      id: 'emp-1',
      firstName: 'Alice',
      lastName: 'Smith',
      status: 'ACTIVE',
      startDate: new Date('2022-01-01'),
      endDate: null,
      companyId: 'co-1',
      workInfo: '{}',
      department: { name: 'Engineering' },
      compensationHistory: [],
      ...overrides,
    };
  }

  beforeEach(() => { vi.clearAllMocks(); });

  // -----------------------------------------------------------------------
  // R-1 through R-4: getTerminationReport
  // -----------------------------------------------------------------------
  describe('getTerminationReport', () => {
    it('R-1: returns only TERMINATED employees with correct fields', async () => {
      db.employee.findMany.mockResolvedValue([
        makeEmployee({
          id: 'emp-2', firstName: 'Bob', lastName: 'Jones', status: 'TERMINATED',
          startDate: new Date('2020-06-01'), endDate: new Date('2025-03-15'),
          workInfo: JSON.stringify({ terminationReason: 'Resignation' }),
          department: { name: 'Sales' },
          compensationHistory: [],
        }),
      ]);

      const result = await createCaller(makeCtx()).getTerminationReport({});

      expect(result.rows).toHaveLength(1);
      const row = result.rows[0];
      expect(row.name).toBe('Bob Jones');
      expect(row.terminationReason).toBe('Resignation');
      expect(row.endDate).toEqual(new Date('2025-03-15'));
      expect(typeof row.seniorityYears).toBe('number');
      expect(row.seniorityYears).toBeGreaterThan(0);
    });

    it('R-2: company isolation — DB query uses companyId from ctx', async () => {
      db.employee.findMany.mockResolvedValue([]);

      await createCaller(makeCtx()).getTerminationReport({});

      expect(db.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'co-1', status: 'TERMINATED' }),
        })
      );
    });

    it('R-3: department filter is passed to DB query', async () => {
      db.employee.findMany.mockResolvedValue([]);

      await createCaller(makeCtx()).getTerminationReport({ department: 'Engineering' });

      expect(db.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            department: { name: { equals: 'Engineering', mode: 'insensitive' } },
          }),
        })
      );
    });

    it('R-4: date range filter narrows by endDate (termination date)', async () => {
      db.employee.findMany.mockResolvedValue([]);

      await createCaller(makeCtx()).getTerminationReport({
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      });

      expect(db.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            endDate: { gte: new Date('2025-01-01'), lte: new Date('2025-12-31') },
          }),
        })
      );
    });
  });

  // -----------------------------------------------------------------------
  // R-5 through R-8: getActiveReport
  // -----------------------------------------------------------------------
  describe('getActiveReport', () => {
    it('R-5: returns only ACTIVE employees with salary from CompensationRecord', async () => {
      db.employee.findMany.mockResolvedValue([
        makeEmployee({
          status: 'ACTIVE',
          compensationHistory: [
            { type: 'BASE_SALARY', status: 'APPROVED', effectiveDate: new Date('2023-01-01'), salary: 95000 },
          ],
        }),
      ]);

      const result = await createCaller(makeCtx()).getActiveReport({});

      expect(result.rows).toHaveLength(1);
      const row = result.rows[0];
      expect(row.name).toBe('Alice Smith');
      expect(row.salary).toBe(95000);
      expect(typeof row.seniorityYears).toBe('number');
      expect(row.startDate).toBeInstanceOf(Date);
    });

    it('R-6: employee with no CompensationRecord shows salary 0', async () => {
      db.employee.findMany.mockResolvedValue([
        makeEmployee({ status: 'ACTIVE', compensationHistory: [] }),
      ]);

      const result = await createCaller(makeCtx()).getActiveReport({});

      expect(result.rows[0].salary).toBe(0);
    });

    it('R-7: company isolation — DB query uses companyId and status ACTIVE', async () => {
      db.employee.findMany.mockResolvedValue([]);

      await createCaller(makeCtx()).getActiveReport({});

      expect(db.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'co-1', status: 'ACTIVE' }),
        })
      );
    });

    it('R-8: department filter is passed to DB query', async () => {
      db.employee.findMany.mockResolvedValue([]);

      await createCaller(makeCtx()).getActiveReport({ department: 'Engineering' });

      expect(db.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            department: { name: { equals: 'Engineering', mode: 'insensitive' } },
          }),
        })
      );
    });
  });

  // -----------------------------------------------------------------------
  // R-9 through R-12: getSalaryReport
  // -----------------------------------------------------------------------
  describe('getSalaryReport', () => {
    it('R-9: returns all ACTIVE employees with current salary and future increases', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      db.employee.findMany.mockResolvedValue([
        makeEmployee({
          compensationHistory: [
            { type: 'BASE_SALARY', status: 'APPROVED', effectiveDate: new Date('2023-01-01'), salary: 80000 },
            { type: 'BASE_SALARY', status: 'APPROVED', effectiveDate: futureDate, salary: 90000 },
          ],
        }),
      ]);

      const result = await createCaller(makeCtx()).getSalaryReport({});

      expect(result.rows).toHaveLength(1);
      const row = result.rows[0];
      expect(row.currentSalary).toBe(80000);
      expect(row.futureIncreases).toHaveLength(1);
      expect(row.futureIncreases[0].salary).toBe(90000);
    });

    it('R-10: company isolation — only ACTIVE employees for this company', async () => {
      db.employee.findMany.mockResolvedValue([]);

      await createCaller(makeCtx()).getSalaryReport({});

      expect(db.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'co-1', status: 'ACTIVE' }),
        })
      );
    });

    it('R-11: department filter is applied', async () => {
      db.employee.findMany.mockResolvedValue([]);

      await createCaller(makeCtx()).getSalaryReport({ department: 'Sales' });

      expect(db.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            department: { name: { equals: 'Sales', mode: 'insensitive' } },
          }),
        })
      );
    });

    it('R-12: increaseType filter restricts CompensationRecord type in futureIncreases', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      db.employee.findMany.mockResolvedValue([
        makeEmployee({
          compensationHistory: [
            { type: 'BASE_SALARY', status: 'APPROVED', effectiveDate: new Date('2023-01-01'), salary: 80000 },
            { type: 'BONUS', status: 'APPROVED', effectiveDate: futureDate, salary: 10000 },
            { type: 'BASE_SALARY', status: 'APPROVED', effectiveDate: futureDate, salary: 85000 },
          ],
        }),
      ]);

      const result = await createCaller(makeCtx()).getSalaryReport({ increaseType: 'BONUS' });

      // futureIncreases should only include BONUS type
      expect(result.rows[0].futureIncreases.every((r: any) => r.type === 'BONUS')).toBe(true);
      expect(result.rows[0].futureIncreases).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // R-13 through R-15: getTotalCostReport
  // -----------------------------------------------------------------------
  describe('getTotalCostReport', () => {
    it('R-13: returns monthly cost summaries within the selected period', async () => {
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);
      const monthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 15);

      db.compensationRecord.findMany.mockResolvedValue([
        {
          id: 'cr-1', type: 'BASE_SALARY', status: 'APPROVED',
          effectiveDate: nextMonth, salary: 5000, bonusAmount: null, currency: 'USD',
          employee: { companyId: 'co-1', department: { name: 'Engineering' } },
        },
        {
          id: 'cr-2', type: 'BONUS', status: 'APPROVED',
          effectiveDate: monthAfter, salary: null, bonusAmount: 2000, currency: 'USD',
          employee: { companyId: 'co-1', department: { name: 'Sales' } },
        },
      ]);

      const result = await createCaller(makeCtx()).getTotalCostReport({
        startDate: now,
        endDate: monthAfter,
      });

      expect(result.months.length).toBeGreaterThanOrEqual(1);
      const totals = result.months.map((m: any) => m.total);
      expect(totals.some((t: number) => t > 0)).toBe(true);
    });

    it('R-14: company isolation — CompensationRecord query filters by company through employee relation', async () => {
      db.compensationRecord.findMany.mockResolvedValue([]);

      const now = new Date();
      const future = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      await createCaller(makeCtx()).getTotalCostReport({ startDate: now, endDate: future });

      expect(db.compensationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employee: expect.objectContaining({ companyId: 'co-1' }),
          }),
        })
      );
    });

    it('R-15: department filter narrows results to the specified department', async () => {
      db.compensationRecord.findMany.mockResolvedValue([]);

      const now = new Date();
      const future = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      await createCaller(makeCtx()).getTotalCostReport({
        startDate: now,
        endDate: future,
        department: 'Engineering',
      });

      expect(db.compensationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employee: expect.objectContaining({
              companyId: 'co-1',
              department: { name: { equals: 'Engineering', mode: 'insensitive' } },
            }),
          }),
        })
      );
    });
  });
  ```

- [ ] **Step 2: Run to confirm all fail**

  ```bash
  cd /tmp/ws-profile-edit-clone && npm test -- --run tests/unit/routers/reports.router.test.ts 2>&1 | tail -20
  ```
  Expected: FAIL — "Cannot find module '@/server/routers/reports'"

---

### Task 3: Write component tests RED (`tests/unit/components/reports-page.test.tsx`)

**Files:**
- Create: `tests/unit/components/reports-page.test.tsx`

- [ ] **Step 1: Create the failing test file**

  Create `tests/unit/components/reports-page.test.tsx`:

  ```tsx
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { render, screen, fireEvent } from '@testing-library/react';

  // Mock tRPC — we test component behavior, not network calls
  vi.mock('@/lib/trpc', () => ({
    trpc: {
      reports: {
        getTerminationReport: { useQuery: vi.fn() },
        getActiveReport: { useQuery: vi.fn() },
        getSalaryReport: { useQuery: vi.fn() },
        getTotalCostReport: { useQuery: vi.fn() },
      },
    },
  }));

  vi.mock('next-auth/react', () => ({
    useSession: () => ({
      data: { user: { companyId: 'co-1', id: 'user-1', role: 'ADMIN' } },
      status: 'authenticated',
    }),
  }));

  vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/reports',
  }));

  import { trpc } from '@/lib/trpc';
  import ReportsPage from '@/app/(dashboard)/reports/page';

  const MOCK_TERMINATION_ROWS = [
    { name: 'Bob Jones', seniorityYears: 4.8, terminationReason: 'Resignation', endDate: new Date('2025-03-15'), department: 'Sales' },
  ];
  const MOCK_ACTIVE_ROWS = [
    { name: 'Alice Smith', startDate: new Date('2022-01-01'), seniorityYears: 3.2, salary: 95000, department: 'Engineering' },
  ];
  const MOCK_SALARY_ROWS = [
    {
      name: 'Alice Smith', department: 'Engineering',
      currentSalary: 95000, currency: 'USD',
      futureIncreases: [{ effectiveDate: new Date('2026-07-01'), type: 'BASE_SALARY', salary: 105000, currency: 'USD' }],
    },
  ];
  const MOCK_COST_MONTHS = [
    { month: '2026-05', total: 15000, byDepartment: { Engineering: 15000 } },
  ];

  function setupDefaultMocks() {
    vi.mocked(trpc.reports.getTerminationReport.useQuery).mockReturnValue({
      data: { rows: MOCK_TERMINATION_ROWS }, isLoading: false, error: null,
    } as any);
    vi.mocked(trpc.reports.getActiveReport.useQuery).mockReturnValue({
      data: { rows: MOCK_ACTIVE_ROWS }, isLoading: false, error: null,
    } as any);
    vi.mocked(trpc.reports.getSalaryReport.useQuery).mockReturnValue({
      data: { rows: MOCK_SALARY_ROWS }, isLoading: false, error: null,
    } as any);
    vi.mocked(trpc.reports.getTotalCostReport.useQuery).mockReturnValue({
      data: { months: MOCK_COST_MONTHS }, isLoading: false, error: null,
    } as any);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  describe('ReportsPage', () => {
    // C-1: Default tab shows Termination Report
    it('C-1: default tab shows Termination Report and its data', () => {
      render(<ReportsPage />);
      // Tab label exists
      expect(screen.getByRole('tab', { name: /termination/i })).toBeInTheDocument();
      // Employee name from mock data is visible
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
      // Termination reason is visible
      expect(screen.getByText('Resignation')).toBeInTheDocument();
      // Hardcoded values are absent
      expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
    });

    // C-2: Active Employees tab shows its data
    it('C-2: clicking Active Employees tab shows active employee data', () => {
      render(<ReportsPage />);
      const activeTab = screen.getByRole('tab', { name: /active/i });
      fireEvent.click(activeTab);
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('$95,000')).toBeInTheDocument();
    });

    // C-3: Salary tab shows salary data
    it('C-3: clicking Salary tab shows salary report', () => {
      render(<ReportsPage />);
      const salaryTab = screen.getByRole('tab', { name: /salary/i });
      fireEvent.click(salaryTab);
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('$95,000')).toBeInTheDocument();
    });

    // C-4: Future Increases tab shows cost data
    it('C-4: clicking Future Increases / Cost tab shows monthly cost', () => {
      render(<ReportsPage />);
      const costTab = screen.getByRole('tab', { name: /future|cost/i });
      fireEvent.click(costTab);
      expect(screen.getByText('2026-05')).toBeInTheDocument();
      expect(screen.getByText(/15,000/)).toBeInTheDocument();
    });

    // C-5: Loading state renders skeleton rows
    it('C-5: loading state shows skeleton rows, not real data', () => {
      vi.mocked(trpc.reports.getTerminationReport.useQuery).mockReturnValue({
        data: undefined, isLoading: true, error: null,
      } as any);

      render(<ReportsPage />);

      expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
      const skeletons = document.querySelectorAll('[data-testid="skeleton"], .animate-pulse, [role="status"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    // C-6: Empty state renders without crash
    it('C-6: empty data renders "No results" message without crash', () => {
      vi.mocked(trpc.reports.getTerminationReport.useQuery).mockReturnValue({
        data: { rows: [] }, isLoading: false, error: null,
      } as any);

      render(<ReportsPage />);

      expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
      expect(screen.getByText(/no results|no data|no records/i)).toBeInTheDocument();
    });

    // C-7: Clicking a sortable column header re-sorts the table
    it('C-7: clicking Name column header toggles sort direction', () => {
      render(<ReportsPage />);
      const nameHeader = screen.getByRole('columnheader', { name: /name/i });
      fireEvent.click(nameHeader);
      // After clicking, an arrow indicator should appear (↑ or ↓)
      expect(nameHeader.textContent).toMatch(/↑|↓|▲|▼/);
    });

    // C-8: Toggle a column off and it disappears from the table
    it('C-8: toggling off a column removes it from the table headers', () => {
      render(<ReportsPage />);
      // Find the column toggle button
      const toggleButton = screen.getByRole('button', { name: /columns|toggle|customize/i });
      fireEvent.click(toggleButton);
      // Find and uncheck "Reason" column (or similar)
      const reasonCheckbox = screen.queryByRole('checkbox', { name: /reason|termination reason/i });
      if (reasonCheckbox) {
        fireEvent.click(reasonCheckbox);
        // The column header should be gone
        expect(screen.queryByRole('columnheader', { name: /reason/i })).not.toBeInTheDocument();
      }
    });

    // C-9: Download CSV button triggers a file download
    it('C-9: Download CSV button is present and clickable', () => {
      // Mock URL.createObjectURL and document.createElement
      const createObjectURL = vi.fn().mockReturnValue('blob:test');
      const revokeObjectURL = vi.fn();
      Object.defineProperty(window, 'URL', {
        value: { createObjectURL, revokeObjectURL },
        writable: true,
      });

      render(<ReportsPage />);

      const downloadButton = screen.getByRole('button', { name: /download|export|csv/i });
      expect(downloadButton).toBeInTheDocument();
      fireEvent.click(downloadButton);
      // createObjectURL should be called when CSV is generated
      expect(createObjectURL).toHaveBeenCalled();
    });

    // C-10: Hardcoded placeholder values are not present
    it('C-10: no hardcoded employee names or placeholder values appear', () => {
      render(<ReportsPage />);
      expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
      expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
      expect(screen.queryByText('$1,200,000')).not.toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run to confirm all fail**

  ```bash
  cd /tmp/ws-profile-edit-clone && npm test -- --run tests/unit/components/reports-page.test.tsx 2>&1 | tail -20
  ```
  Expected: FAIL — "Cannot find module '@/app/(dashboard)/reports/page'"

---

### Task 4: Implement `reportsRouter` (makes Task 2 GREEN)

**Files:**
- Create: `src/server/routers/reports.ts`
- Modify: `src/server/routers/_app.ts`

- [ ] **Step 1: Create `src/server/routers/reports.ts`**

  ```ts
  import { z } from 'zod';
  import { router, protectedProcedure } from '@/server/trpc';
  import { getCurrentSalary } from '@/lib/compensation-engine';

  // -----------------------------------------------------------------------
  // Shared helpers
  // -----------------------------------------------------------------------

  /** Compute seniority in years from startDate to referenceDate (default: now). */
  function seniorityYears(startDate: Date, referenceDate: Date = new Date()): number {
    const msPerYear = 1000 * 60 * 60 * 24 * 365.25;
    return parseFloat(((referenceDate.getTime() - new Date(startDate).getTime()) / msPerYear).toFixed(1));
  }

  /** Format a number as a monthly label "YYYY-MM". */
  function toMonthLabel(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  // -----------------------------------------------------------------------
  // Input schemas
  // -----------------------------------------------------------------------

  const terminationReportSchema = z.object({
    department:  z.string().optional(),
    startDate:   z.coerce.date().optional(), // filter by termination endDate range
    endDate:     z.coerce.date().optional(),
    role:        z.string().optional(),
  });

  const activeReportSchema = z.object({
    department: z.string().optional(),
    role:       z.string().optional(),
  });

  const salaryReportSchema = z.object({
    department:   z.string().optional(),
    role:         z.string().optional(),
    increaseType: z.enum(['BASE_SALARY', 'BONUS', 'EQUITY_GRANT']).optional(),
  });

  const totalCostSchema = z.object({
    startDate:    z.coerce.date(),
    endDate:      z.coerce.date(),
    department:   z.string().optional(),
    increaseType: z.enum(['BASE_SALARY', 'BONUS', 'EQUITY_GRANT']).optional(),
  });

  // -----------------------------------------------------------------------
  // Helper: build department filter clause
  // -----------------------------------------------------------------------
  function deptFilter(department?: string) {
    if (!department) return undefined;
    return { name: { equals: department, mode: 'insensitive' as const } };
  }

  // -----------------------------------------------------------------------
  // Router
  // -----------------------------------------------------------------------

  export const reportsRouter = router({
    // ------------------------------------------------------------------
    // 1. Termination Report
    // ------------------------------------------------------------------
    getTerminationReport: protectedProcedure
      .input(terminationReportSchema)
      .query(async ({ ctx, input }) => {
        const where: any = {
          companyId: ctx.user.companyId,
          status: 'TERMINATED',
        };
        if (input.department) where.department = deptFilter(input.department);
        if (input.startDate || input.endDate) {
          where.endDate = {};
          if (input.startDate) where.endDate.gte = input.startDate;
          if (input.endDate)   where.endDate.lte = input.endDate;
        }

        const employees = await ctx.db.employee.findMany({
          where,
          include: {
            department: { select: { name: true } },
            compensationHistory: true,
          },
          orderBy: { endDate: 'desc' },
        });

        const rows = employees.map((emp: any) => {
          const workInfo = JSON.parse(emp.workInfo || '{}');
          return {
            name: `${emp.firstName} ${emp.lastName}`,
            department: emp.department?.name ?? '',
            seniorityYears: emp.endDate
              ? seniorityYears(emp.startDate, new Date(emp.endDate))
              : seniorityYears(emp.startDate),
            terminationReason: workInfo.terminationReason ?? '',
            endDate: emp.endDate,
            role: workInfo.jobTitle ?? '',
          };
        });

        // Optional role filter (applied in-memory; role is in workInfo JSON)
        const filtered = input.role
          ? rows.filter((r: any) => r.role.toLowerCase().includes(input.role!.toLowerCase()))
          : rows;

        return { rows: filtered };
      }),

    // ------------------------------------------------------------------
    // 2. Active Employees Report
    // ------------------------------------------------------------------
    getActiveReport: protectedProcedure
      .input(activeReportSchema)
      .query(async ({ ctx, input }) => {
        const where: any = {
          companyId: ctx.user.companyId,
          status: 'ACTIVE',
        };
        if (input.department) where.department = deptFilter(input.department);

        const employees = await ctx.db.employee.findMany({
          where,
          include: {
            department: { select: { name: true } },
            compensationHistory: true,
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        });

        const rows = employees.map((emp: any) => {
          const workInfo = JSON.parse(emp.workInfo || '{}');
          const salary = getCurrentSalary(emp.compensationHistory);
          return {
            name: `${emp.firstName} ${emp.lastName}`,
            department: emp.department?.name ?? '',
            startDate: emp.startDate,
            seniorityYears: seniorityYears(emp.startDate),
            salary,
            currency: emp.compensationHistory[0]?.currency ?? 'USD',
            role: workInfo.jobTitle ?? '',
          };
        });

        const filtered = input.role
          ? rows.filter((r: any) => r.role.toLowerCase().includes(input.role!.toLowerCase()))
          : rows;

        return { rows: filtered };
      }),

    // ------------------------------------------------------------------
    // 3. Salary Report (current salaries + future increases per employee)
    // ------------------------------------------------------------------
    getSalaryReport: protectedProcedure
      .input(salaryReportSchema)
      .query(async ({ ctx, input }) => {
        const where: any = {
          companyId: ctx.user.companyId,
          status: 'ACTIVE',
        };
        if (input.department) where.department = deptFilter(input.department);

        const employees = await ctx.db.employee.findMany({
          where,
          include: {
            department: { select: { name: true } },
            compensationHistory: {
              orderBy: { effectiveDate: 'asc' },
            },
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        });

        const now = new Date();

        const rows = employees.map((emp: any) => {
          const workInfo = JSON.parse(emp.workInfo || '{}');
          const currentSalary = getCurrentSalary(emp.compensationHistory, now);

          // Future increases: CompensationRecord rows with effectiveDate > now
          let futureIncreases = (emp.compensationHistory as any[]).filter(
            (cr: any) => new Date(cr.effectiveDate) > now && cr.status === 'APPROVED'
          );
          if (input.increaseType) {
            futureIncreases = futureIncreases.filter((cr: any) => cr.type === input.increaseType);
          }

          return {
            name: `${emp.firstName} ${emp.lastName}`,
            department: emp.department?.name ?? '',
            role: workInfo.jobTitle ?? '',
            currentSalary,
            currency: 'USD',
            futureIncreases: futureIncreases.map((cr: any) => ({
              effectiveDate: cr.effectiveDate,
              type: cr.type,
              salary: cr.salary ?? cr.bonusAmount ?? cr.equityAmount ?? 0,
              currency: cr.currency ?? 'USD',
              changeReason: cr.changeReason ?? '',
            })),
          };
        });

        const filtered = input.role
          ? rows.filter((r: any) => r.role.toLowerCase().includes(input.role!.toLowerCase()))
          : rows;

        return { rows: filtered };
      }),

    // ------------------------------------------------------------------
    // 4. Total Cost Report (monthly aggregation of future CompensationRecord increases)
    // ------------------------------------------------------------------
    getTotalCostReport: protectedProcedure
      .input(totalCostSchema)
      .query(async ({ ctx, input }) => {
        const where: any = {
          effectiveDate: { gte: input.startDate, lte: input.endDate },
          status: 'APPROVED',
          employee: { companyId: ctx.user.companyId },
        };
        if (input.department) {
          where.employee.department = deptFilter(input.department);
        }
        if (input.increaseType) {
          where.type = input.increaseType;
        }

        const records = await ctx.db.compensationRecord.findMany({
          where,
          include: {
            employee: {
              select: {
                companyId: true,
                department: { select: { name: true } },
              },
            },
          },
          orderBy: { effectiveDate: 'asc' },
        });

        // Group by month
        const monthMap: Record<string, { total: number; byDepartment: Record<string, number> }> = {};

        for (const record of records as any[]) {
          const label = toMonthLabel(new Date(record.effectiveDate));
          const amount = record.salary ?? record.bonusAmount ?? record.equityAmount ?? 0;
          const dept = record.employee?.department?.name ?? 'Unassigned';

          if (!monthMap[label]) monthMap[label] = { total: 0, byDepartment: {} };
          monthMap[label].total += amount;
          monthMap[label].byDepartment[dept] = (monthMap[label].byDepartment[dept] ?? 0) + amount;
        }

        const months = Object.entries(monthMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, data]) => ({ month, ...data }));

        return { months };
      }),
  });
  ```

- [ ] **Step 2: Register in `src/server/routers/_app.ts`**

  Add the import and register the router:

  ```ts
  import { reportsRouter } from './reports';

  export const appRouter = router({
    // ... existing entries ...
    reports: reportsRouter,
  });
  ```

- [ ] **Step 3: Run router tests to confirm they are GREEN**

  ```bash
  cd /tmp/ws-profile-edit-clone && npm test -- --run tests/unit/routers/reports.router.test.ts 2>&1 | tail -20
  ```
  Expected: 15/15 PASS

- [ ] **Step 4: Refactor and verify full suite**

  ```bash
  cd /tmp/ws-profile-edit-clone && npm test 2>&1 | tail -15
  ```
  Expected: all previously passing tests still PASS, plus 15 new green.

- [ ] **Step 5: Commit**

  ```bash
  cd /tmp/ws-profile-edit-clone
  git add src/server/routers/reports.ts src/server/routers/_app.ts
  git commit -m "feat: add reportsRouter with termination, active, salary, and total cost procedures"
  ```

---

### Task 5: Implement `ReportsPage` (makes Task 3 GREEN)

**Files:**
- Create: `src/app/(dashboard)/reports/page.tsx`
- Create: `src/app/(dashboard)/reports/layout.tsx`

The page has four tabs (matching the four router procedures). Each tab shows a sortable table with:
- Column toggle (show/hide individual columns)
- Sort by clicking column headers
- CSV download button

#### `src/app/(dashboard)/reports/layout.tsx`

```tsx
export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

#### `src/app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Create the page component**

  ```tsx
  "use client";

  import { useState, useMemo } from "react";
  import { trpc } from "@/lib/trpc";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Download, ChevronUp, ChevronDown, SlidersHorizontal } from "lucide-react";

  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------

  type SortDir = "asc" | "desc" | null;
  type TabKey = "termination" | "active" | "salary" | "cost";

  // ---------------------------------------------------------------------------
  // Skeleton
  // ---------------------------------------------------------------------------

  function Skeleton({ className }: { className?: string }) {
    return (
      <div
        role="status"
        data-testid="skeleton"
        className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className ?? ""}`}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // CSV download helper
  // ---------------------------------------------------------------------------

  function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(","),
      ...rows.map((row) =>
        headers.map((h) => {
          const val = row[h];
          const str = val instanceof Date ? val.toISOString().slice(0, 10) : String(val ?? "");
          return `"${str.replace(/"/g, '""')}"`;
        }).join(",")
      ),
    ];
    const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // SortableTable
  // ---------------------------------------------------------------------------

  interface Column {
    key: string;
    label: string;
    format?: (val: unknown) => string;
    visible: boolean;
  }

  function SortableTable({
    columns,
    rows,
    isLoading,
    onToggleColumn,
  }: {
    columns: Column[];
    rows: Record<string, unknown>[];
    isLoading: boolean;
    onToggleColumn: (key: string) => void;
  }) {
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>(null);
    const [showColumnMenu, setShowColumnMenu] = useState(false);

    const visibleColumns = columns.filter((c) => c.visible);

    const sorted = useMemo(() => {
      if (!sortKey || !sortDir) return rows;
      return [...rows].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av instanceof Date && bv instanceof Date) {
          return sortDir === "asc" ? av.getTime() - bv.getTime() : bv.getTime() - av.getTime();
        }
        const as = String(av ?? "");
        const bs = String(bv ?? "");
        return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
      });
    }, [rows, sortKey, sortDir]);

    function handleHeaderClick(key: string) {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"));
        if (sortDir === "desc") setSortKey(null);
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    }

    function sortIndicator(key: string) {
      if (sortKey !== key) return "";
      return sortDir === "asc" ? " ↑" : sortDir === "desc" ? " ↓" : "";
    }

    function formatCell(col: Column, val: unknown): string {
      if (col.format) return col.format(val);
      if (val instanceof Date) return val.toISOString().slice(0, 10);
      return String(val ?? "—");
    }

    if (isLoading) {
      return (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      );
    }

    if (!rows.length) {
      return (
        <div className="py-12 text-center text-gray-500">No results found for the selected filters.</div>
      );
    }

    return (
      <div className="space-y-2">
        {/* Column toggle button */}
        <div className="flex justify-end relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowColumnMenu((v) => !v)}
            className="gap-2"
          >
            <SlidersHorizontal size={14} />
            Columns
          </Button>
          {showColumnMenu && (
            <div className="absolute right-0 top-9 z-50 bg-white dark:bg-charcoal-800 border rounded shadow-lg p-3 min-w-[180px]">
              {columns.map((col) => (
                <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={col.visible}
                    onChange={() => onToggleColumn(col.key)}
                    aria-label={col.label}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b">
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    role="columnheader"
                    onClick={() => handleHeaderClick(col.key)}
                    className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 cursor-pointer select-none hover:text-gray-900 dark:hover:text-white"
                  >
                    {col.label}{sortIndicator(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr key={i} className="border-b hover:bg-gray-50 dark:hover:bg-charcoal-700">
                  {visibleColumns.map((col) => (
                    <td key={col.key} className="px-3 py-2 text-gray-800 dark:text-gray-200 whitespace-nowrap">
                      {formatCell(col, row[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Column definitions per tab
  // ---------------------------------------------------------------------------

  function usd(val: unknown) {
    const n = Number(val ?? 0);
    return n === 0 ? "—" : `$${n.toLocaleString()}`;
  }

  const TERMINATION_COLS: Column[] = [
    { key: "name",              label: "Name",               visible: true },
    { key: "department",        label: "Department",         visible: true },
    { key: "seniorityYears",    label: "Seniority (yrs)",    visible: true },
    { key: "terminationReason", label: "Termination Reason", visible: true },
    { key: "endDate",           label: "Termination Date",   visible: true },
    { key: "role",              label: "Role",               visible: true },
  ];

  const ACTIVE_COLS: Column[] = [
    { key: "name",           label: "Name",            visible: true },
    { key: "department",     label: "Department",      visible: true },
    { key: "startDate",      label: "Start Date",      visible: true },
    { key: "seniorityYears", label: "Seniority (yrs)", visible: true },
    { key: "salary",         label: "Salary",          format: usd, visible: true },
    { key: "role",           label: "Role",            visible: true },
  ];

  const SALARY_COLS: Column[] = [
    { key: "name",          label: "Name",            visible: true },
    { key: "department",    label: "Department",      visible: true },
    { key: "role",          label: "Role",            visible: true },
    { key: "currentSalary", label: "Current Salary",  format: usd, visible: true },
    { key: "futureCount",   label: "Future Increases", visible: true },
  ];

  const COST_COLS: Column[] = [
    { key: "month", label: "Month",      visible: true },
    { key: "total", label: "Total Cost", format: usd, visible: true },
  ];

  // ---------------------------------------------------------------------------
  // Main page
  // ---------------------------------------------------------------------------

  const TABS: { key: TabKey; label: string }[] = [
    { key: "termination", label: "Termination Report" },
    { key: "active",      label: "Active Employees" },
    { key: "salary",      label: "Salary Report" },
    { key: "cost",        label: "Future Increases" },
  ];

  export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState<TabKey>("termination");
    const [departmentFilter, setDepartmentFilter] = useState("");

    // Column visibility state per tab
    const [terminationCols, setTerminationCols] = useState<Column[]>(TERMINATION_COLS);
    const [activeCols, setActiveCols] = useState<Column[]>(ACTIVE_COLS);
    const [salaryCols, setSalaryCols] = useState<Column[]>(SALARY_COLS);
    const [costCols, setCostCols] = useState<Column[]>(COST_COLS);

    // tRPC queries — always call all hooks (React rules)
    const startOfYear = useMemo(() => new Date(new Date().getFullYear(), 0, 1), []);
    const endOfYear = useMemo(() => new Date(new Date().getFullYear() + 2, 11, 31), []);

    const terminationQ = trpc.reports.getTerminationReport.useQuery({
      department: departmentFilter || undefined,
    });
    const activeQ = trpc.reports.getActiveReport.useQuery({
      department: departmentFilter || undefined,
    });
    const salaryQ = trpc.reports.getSalaryReport.useQuery({
      department: departmentFilter || undefined,
    });
    const costQ = trpc.reports.getTotalCostReport.useQuery({
      startDate: startOfYear,
      endDate: endOfYear,
      department: departmentFilter || undefined,
    });

    // Flatten salary rows to include futureCount
    const salaryRows = useMemo(() =>
      (salaryQ.data?.rows ?? []).map((r: any) => ({
        ...r,
        futureCount: r.futureIncreases?.length ?? 0,
      })),
      [salaryQ.data]
    );

    // Cost rows
    const costRows = useMemo(() => costQ.data?.months ?? [], [costQ.data]);

    function toggleColumn(
      cols: Column[],
      setCols: (c: Column[]) => void,
      key: string
    ) {
      setCols(cols.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
    }

    // CSV download per tab
    function handleDownload() {
      switch (activeTab) {
        case "termination":
          downloadCsv(
            "termination-report.csv",
            (terminationQ.data?.rows ?? []).map((r: any) => ({
              Name: r.name,
              Department: r.department,
              "Seniority (yrs)": r.seniorityYears,
              "Termination Reason": r.terminationReason,
              "Termination Date": r.endDate ? new Date(r.endDate).toISOString().slice(0, 10) : "",
              Role: r.role,
            }))
          );
          break;
        case "active":
          downloadCsv(
            "active-employees-report.csv",
            (activeQ.data?.rows ?? []).map((r: any) => ({
              Name: r.name,
              Department: r.department,
              "Start Date": new Date(r.startDate).toISOString().slice(0, 10),
              "Seniority (yrs)": r.seniorityYears,
              Salary: r.salary,
              Role: r.role,
            }))
          );
          break;
        case "salary":
          downloadCsv(
            "salary-report.csv",
            (salaryQ.data?.rows ?? []).map((r: any) => ({
              Name: r.name,
              Department: r.department,
              Role: r.role,
              "Current Salary": r.currentSalary,
              "Future Increases": r.futureIncreases?.length ?? 0,
            }))
          );
          break;
        case "cost":
          downloadCsv(
            "total-cost-report.csv",
            costRows.map((r: any) => ({ Month: r.month, "Total Cost": r.total }))
          );
          break;
      }
    }

    // Resolve current tab's data
    const { rows, cols, setCols, isLoading } = useMemo(() => {
      switch (activeTab) {
        case "termination":
          return { rows: terminationQ.data?.rows ?? [], cols: terminationCols, setCols: setTerminationCols, isLoading: terminationQ.isLoading };
        case "active":
          return { rows: activeQ.data?.rows ?? [], cols: activeCols, setCols: setActiveCols, isLoading: activeQ.isLoading };
        case "salary":
          return { rows: salaryRows, cols: salaryCols, setCols: setSalaryCols, isLoading: salaryQ.isLoading };
        case "cost":
          return { rows: costRows, cols: costCols, setCols: setCostCols, isLoading: costQ.isLoading };
      }
    }, [activeTab, terminationQ, activeQ, salaryQ, costQ, terminationCols, activeCols, salaryCols, costCols, salaryRows, costRows]);

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-charcoal-900 dark:text-white">Reports</h1>
          <Button type="button" variant="outline" className="gap-2" onClick={handleDownload}>
            <Download size={16} />
            Download CSV
          </Button>
        </div>

        {/* Department filter */}
        <div className="flex gap-3 items-center">
          <Input
            placeholder="Filter by department…"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {/* Tab bar */}
        <div role="tablist" className="flex border-b gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary-500 text-primary-600 dark:text-primary-400"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="pt-4">
            <SortableTable
              columns={cols}
              rows={rows as Record<string, unknown>[]}
              isLoading={isLoading}
              onToggleColumn={(key) => toggleColumn(cols, setCols, key)}
            />
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

- [ ] **Step 2: Run component tests to confirm they are GREEN**

  ```bash
  cd /tmp/ws-profile-edit-clone && npm test -- --run tests/unit/components/reports-page.test.tsx 2>&1 | tail -20
  ```
  Expected: 10/10 PASS

- [ ] **Step 3: Refactor and verify full suite**

  Check that all tests pass:

  ```bash
  cd /tmp/ws-profile-edit-clone && npm test 2>&1 | tail -15
  ```
  Expected: all previously passing tests still PASS, plus 25 new green (15 router + 10 component).

- [ ] **Step 4: Commit**

  ```bash
  cd /tmp/ws-profile-edit-clone
  git add src/app/\(dashboard\)/reports/
  git commit -m "feat: add Reports page with four report tabs, column toggle, sort, and CSV download"
  ```

---

### Task 6: Wire sidebar and middleware, then verify full suite

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Add Reports link to sidebar**

  In `src/components/layout/sidebar.tsx`, add to the `navItems` array (after Analytics):

  ```ts
  import { BarChart3, FileBarChart2 } from 'lucide-react'; // FileBarChart2 is the reports icon
  // ...
  { label: "Reports", href: "/reports", icon: FileBarChart2 },
  ```

  If `FileBarChart2` is not in the installed version of lucide-react, use `FileText` or `BarChart` which are already imported.

  To check available icons:
  ```bash
  grep -r "FileBarChart\|FileReport\|ClipboardList" /tmp/ws-profile-edit-clone/node_modules/lucide-react/dist/esm/icons/ 2>/dev/null | head -5
  ```
  Fall back to `ClipboardList` or `BarChart3` if `FileBarChart2` is unavailable.

- [ ] **Step 2: Add `/reports` to middleware matcher**

  In `src/middleware.ts`, add `"/reports/:path*"` to the `matcher` array:

  ```ts
  export const config = {
    matcher: [
      "/home/:path*",
      "/people/:path*",
      "/time-off/:path*",
      "/hiring/:path*",
      "/performance/:path*",
      "/analytics/:path*",
      "/payroll/:path*",
      "/onboarding/:path*",
      "/learning/:path*",
      "/surveys/:path*",
      "/documents/:path*",
      "/settings/:path*",
      "/reports/:path*",   // ← add this line
    ],
  };
  ```

- [ ] **Step 3: Run the full test suite**

  ```bash
  cd /tmp/ws-profile-edit-clone && npm test 2>&1 | tail -15
  ```
  Expected: all tests PASS. Check that both `employee-profile.test.tsx` and `time-off-page.test.tsx` (listed as modified in git status) still pass — they were broken before and must be green.

- [ ] **Step 4: TypeScript check**

  ```bash
  cd /tmp/ws-profile-edit-clone && npx tsc --noEmit 2>&1 | head -30
  ```
  Expected: 0 errors.

- [ ] **Step 5: Commit**

  ```bash
  cd /tmp/ws-profile-edit-clone
  git add src/components/layout/sidebar.tsx src/middleware.ts
  git commit -m "feat: add Reports to sidebar navigation and middleware route guard"
  ```

---

## Completion Checklist

Before declaring implementation complete, verify:

- [ ] `npm test` shows all tests PASS (including the 25 new tests)
- [ ] `npx tsc --noEmit` shows 0 errors
- [ ] `tests/unit/components/employee-profile.test.tsx` — PASS (was failing before, must stay green)
- [ ] `tests/unit/components/time-off-page.test.tsx` — PASS (was failing before, must stay green)
- [ ] `src/server/routers/reports.ts` exists with 4 procedures
- [ ] `src/server/routers/_app.ts` includes `reports: reportsRouter`
- [ ] `src/app/(dashboard)/reports/page.tsx` renders 4 tabs, column toggle, sort, CSV download
- [ ] Sidebar shows "Reports" nav link
- [ ] Middleware matcher includes `/reports/:path*`
