import { describe, it, expect, beforeEach, vi } from 'vitest';

// -----------------------------------------------------------------------
// Minimal in-memory Prisma mock — no live DB
// -----------------------------------------------------------------------
const db = {
  employee: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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
vi.mock('@/lib/notify-service', () => ({
  notifyService: { send: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/lib/currency', () => ({
  getExchangeRates: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/lib/docusign', () => ({
  isDocuSignConfigured: () => false,
  sendForSignature: vi.fn(),
}));
vi.mock('@/lib/storage', () => ({
  storage: { getUrl: vi.fn() },
}));
vi.mock('@/server/trpc', async () => {
  const { initTRPC, TRPCError } = await import('@trpc/server');
  const t = initTRPC.context<{ session: any; db: any; user: any }>().create();
  const isAuthed = t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    return next({ ctx: { session: ctx.session, db: ctx.db, user: ctx.session.user } });
  });
  const noOperatorSalary = t.middleware(({ ctx, next }) => {
    if (ctx.session?.user?.role === 'OPERATOR') throw new TRPCError({ code: 'FORBIDDEN', message: 'Operators cannot access salary data' });
    return next({ ctx });
  });
  const requireHrAdmin = t.middleware(({ ctx, next }) => {
    if (!['HR', 'ADMIN', 'SUPER_ADMIN'].includes(ctx.session?.user?.role)) throw new TRPCError({ code: 'FORBIDDEN', message: 'HR/Admin access required' });
    return next({ ctx });
  });
  return { router: t.router, publicProcedure: t.procedure, protectedProcedure: t.procedure.use(isAuthed), hrProtectedProcedure: t.procedure.use(isAuthed).use(requireHrAdmin), salaryProtectedProcedure: t.procedure.use(isAuthed).use(noOperatorSalary) };
});

import { reportsRouter } from '@/server/routers/reports';
import { employeeRouter } from '@/server/routers/employee';

function createCaller(ctx: any) {
  return reportsRouter.createCaller(ctx);
}

function createEmployeeCaller(ctx: any) {
  return employeeRouter.createCaller(ctx);
}

// -----------------------------------------------------------------------
// Helpers to build mock employees using workInfo.salaryHistory
// (same source as the People profile page)
// -----------------------------------------------------------------------
function makeEmployee(overrides: Partial<{
  id: string; firstName: string; lastName: string; status: string;
  startDate: Date; endDate: Date | null; companyId: string;
  workInfo: string; department: { name: string } | null;
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
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

// -----------------------------------------------------------------------
// Prerequisite: Bug fix — employee.terminate must persist terminationReason
//
// NOTE: This test lives here (not in employee.router.test.ts) because
// employee.router.test.ts is an integration test that requires a live
// PostgreSQL connection and hard-crashes in beforeAll when the DB is not
// available, making every test in that file unreachable. This test uses
// the same mocked-Prisma setup as the rest of this file so it always runs.
// -----------------------------------------------------------------------
describe('employeeRouter.terminate (bug fix)', () => {
  it('terminate persists reason into workInfo', async () => {
    db.employee.findUnique.mockResolvedValue({
      id: 'emp-1', companyId: 'co-1', workInfo: '{}', status: 'ACTIVE',
    });
    db.employee.update.mockResolvedValue({
      id: 'emp-1', status: 'TERMINATED', endDate: new Date('2026-04-01'),
      workInfo: '{"terminationReason":"Resignation"}', companyId: 'co-1', company: {},
    });

    await createEmployeeCaller(makeCtx()).terminate({
      id: 'emp-1',
      endDate: new Date('2026-04-01'),
      reason: 'Resignation',
    });

    expect(db.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workInfo: expect.stringContaining('Resignation'),
        }),
      })
    );
  });
});

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
  it('R-5: returns only ACTIVE employees with salary from workInfo.salaryHistory', async () => {
    db.employee.findMany.mockResolvedValue([
      makeEmployee({
        status: 'ACTIVE',
        workInfo: JSON.stringify({
          salaryHistory: [
            { effectiveDate: '2023-01-01', salaryAmount: '95000', salaryCurrency: 'USD' },
          ],
        }),
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

  it('R-6: employee with no salaryHistory shows salary 0', async () => {
    db.employee.findMany.mockResolvedValue([
      makeEmployee({ status: 'ACTIVE', workInfo: '{}' }),
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
  it('R-9: returns ACTIVE employees with current salary and future increases from workInfo.salaryHistory', async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    db.employee.findMany.mockResolvedValue([
      makeEmployee({
        workInfo: JSON.stringify({
          salaryHistory: [
            { effectiveDate: '2023-01-01', salaryAmount: '80000', salaryCurrency: 'USD' },
            { effectiveDate: futureDate.toISOString(), salaryAmount: '90000', salaryCurrency: 'USD' },
          ],
        }),
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

  it('R-12: increaseType filter restricts future increases by salaryType', async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    db.employee.findMany.mockResolvedValue([
      makeEmployee({
        workInfo: JSON.stringify({
          salaryHistory: [
            { effectiveDate: '2023-01-01', salaryAmount: '80000', salaryType: 'BASE_SALARY' },
            { effectiveDate: futureDate.toISOString(), salaryAmount: '10000', salaryType: 'BONUS' },
            { effectiveDate: futureDate.toISOString(), salaryAmount: '85000', salaryType: 'BASE_SALARY' },
          ],
        }),
      }),
    ]);

    const result = await createCaller(makeCtx()).getSalaryReport({ increaseType: 'BONUS' });

    expect(result.rows[0].futureIncreases.every((r: any) => r.type === 'BONUS')).toBe(true);
    expect(result.rows[0].futureIncreases).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------
// R-13 through R-15: getTotalCostReport
// -----------------------------------------------------------------------
describe('getTotalCostReport', () => {
  it('R-13: returns monthly cost summaries from workInfo.salaryHistory within the selected period', async () => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    const monthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 15);

    db.employee.findMany.mockResolvedValue([
      {
        workInfo: JSON.stringify({
          salaryHistory: [
            { effectiveDate: nextMonth.toISOString(), salaryAmount: '5000', salaryCurrency: 'USD' },
            { effectiveDate: monthAfter.toISOString(), salaryAmount: '2000', salaryCurrency: 'USD' },
          ],
        }),
        department: { name: 'Engineering' },
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

  it('R-14: company isolation — employee query filters by companyId', async () => {
    db.employee.findMany.mockResolvedValue([]);

    const now = new Date();
    const future = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await createCaller(makeCtx()).getTotalCostReport({ startDate: now, endDate: future });

    expect(db.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'co-1' }),
      })
    );
  });

  it('R-15: department filter narrows results to the specified department', async () => {
    db.employee.findMany.mockResolvedValue([]);

    const now = new Date();
    const future = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await createCaller(makeCtx()).getTotalCostReport({
      startDate: now,
      endDate: future,
      department: 'Engineering',
    });

    expect(db.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'co-1',
          department: { name: { equals: 'Engineering', mode: 'insensitive' } },
        }),
      })
    );
  });
});
