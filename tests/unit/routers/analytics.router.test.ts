import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

// -----------------------------------------------------------------------
// Minimal in-memory mock for Prisma (no live DB needed for unit tests)
// -----------------------------------------------------------------------

const db = {
  employee: {
    findMany: vi.fn(),
  },
  candidate: {
    findMany: vi.fn(),
  },
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

import { analyticsRouter } from '@/server/routers/analytics';

function createCaller(ctx: any) {
  return analyticsRouter.createCaller(ctx);
}

describe('analyticsRouter', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // -----------------------------------------------------------------------
  // A-1: headcount with department groupBy returns grouped counts and total
  // -----------------------------------------------------------------------
  describe('headcount', () => {
    it('A-1: department groupBy returns grouped counts and total', async () => {
      db.employee.findMany.mockResolvedValue([
        { id: 'e1', status: 'ACTIVE', employmentType: 'FULL_TIME', startDate: new Date('2022-01-01'), endDate: null,
          department: { name: 'Engineering' }, site: { name: 'NYC' } },
        { id: 'e2', status: 'ACTIVE', employmentType: 'FULL_TIME', startDate: new Date('2023-03-01'), endDate: null,
          department: { name: 'Engineering' }, site: { name: 'NYC' } },
        { id: 'e3', status: 'ACTIVE', employmentType: 'PART_TIME', startDate: new Date('2021-06-01'), endDate: null,
          department: { name: 'Sales' }, site: { name: 'LA' } },
      ]);

      const result = await createCaller(makeCtx()).headcount({ groupBy: 'department' });

      expect(result.total).toBe(3);
      expect(result.groupBy).toBe('department');
      const engEntry = result.grouped.find((g: any) => g.key === 'Engineering');
      const salesEntry = result.grouped.find((g: any) => g.key === 'Sales');
      expect(engEntry).toEqual({ key: 'Engineering', count: 2 });
      expect(salesEntry).toEqual({ key: 'Sales', count: 1 });
      // No undefined keys
      expect(result.grouped.every((g: any) => g.key !== undefined && g.key !== 'Unassigned')).toBe(true);
      // DB call includes companyId filter
      expect(db.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'co-1' }) })
      );
    });

    // -----------------------------------------------------------------------
    // A-2: headcount returns avgTenureMonths as a number
    // -----------------------------------------------------------------------
    it('A-2: returns avgTenureMonths computed from employee startDates', async () => {
      const now = new Date();
      const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      const twentyFourMonthsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());

      db.employee.findMany.mockResolvedValue([
        { id: 'e1', status: 'ACTIVE', employmentType: 'FULL_TIME', startDate: twelveMonthsAgo, endDate: null,
          department: { name: 'Engineering' }, site: { name: 'NYC' } },
        { id: 'e2', status: 'ACTIVE', employmentType: 'FULL_TIME', startDate: twentyFourMonthsAgo, endDate: null,
          department: { name: 'Engineering' }, site: { name: 'NYC' } },
      ]);

      const result = await createCaller(makeCtx()).headcount({ groupBy: 'department' });

      expect(typeof result.avgTenureMonths).toBe('number');
      expect(result.avgTenureMonths).not.toBeNaN();
      expect(result.avgTenureMonths).not.toBeUndefined();
      // Average of 12 and 24 months = 18, allow ±1 for rounding
      expect(result.avgTenureMonths).toBeGreaterThan(17);
      expect(result.avgTenureMonths).toBeLessThan(19);
    });

    // -----------------------------------------------------------------------
    // A-3: headcount empty company returns total 0 and avgTenureMonths 0
    // -----------------------------------------------------------------------
    it('A-3: empty company returns zero total and zero avgTenureMonths', async () => {
      db.employee.findMany.mockResolvedValue([]);

      const result = await createCaller(makeCtx()).headcount({ groupBy: 'department' });

      expect(result.total).toBe(0);
      expect(result.grouped).toEqual([]);
      expect(result.avgTenureMonths).toBe(0);
    });

    // -----------------------------------------------------------------------
    // A-4: headcount site groupBy reads site.name from relation
    // -----------------------------------------------------------------------
    it('A-4: site groupBy reads site.name from relation, not raw string', async () => {
      db.employee.findMany.mockResolvedValue([
        { id: 'e1', status: 'ACTIVE', employmentType: 'FULL_TIME', startDate: new Date('2022-01-01'), endDate: null,
          department: { name: 'Engineering' }, site: { name: 'NYC' } },
        { id: 'e2', status: 'ACTIVE', employmentType: 'FULL_TIME', startDate: new Date('2023-01-01'), endDate: null,
          department: { name: 'Sales' }, site: { name: 'LA' } },
      ]);

      const result = await createCaller(makeCtx()).headcount({ groupBy: 'site' });

      const nycEntry = result.grouped.find((g: any) => g.key === 'NYC');
      const laEntry = result.grouped.find((g: any) => g.key === 'LA');
      expect(nycEntry).toEqual({ key: 'NYC', count: 1 });
      expect(laEntry).toEqual({ key: 'LA', count: 1 });
      expect(result.grouped.every((g: any) => g.key !== undefined)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // A-5: attrition returns overall attritionRate and byGroup with dept keys
  // -----------------------------------------------------------------------
  describe('attrition', () => {
    it('A-5: returns overall attritionRate and byGroup with department keys', async () => {
      // First call: terminated employees
      db.employee.findMany
        .mockResolvedValueOnce([
          { id: 'e4', status: 'TERMINATED', endDate: new Date('2024-06-15'), employmentType: 'FULL_TIME',
            startDate: new Date('2021-01-01'), department: { name: 'Engineering' }, site: { name: 'NYC' } },
        ])
        // Second call: all employees
        .mockResolvedValueOnce([
          { id: 'e1', status: 'ACTIVE', startDate: new Date('2022-01-01'), endDate: null,
            department: { name: 'Engineering' }, site: { name: 'NYC' } },
          { id: 'e2', status: 'ACTIVE', startDate: new Date('2023-03-01'), endDate: null,
            department: { name: 'Engineering' }, site: { name: 'NYC' } },
          { id: 'e4', status: 'TERMINATED', startDate: new Date('2021-01-01'), endDate: new Date('2024-06-15'),
            department: { name: 'Engineering' }, site: { name: 'NYC' } },
        ]);

      const result = await createCaller(makeCtx()).attrition({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        groupBy: 'department',
      });

      expect(result.overall.terminations).toBe(1);
      expect(typeof result.overall.attritionRate).toBe('number');
      expect(result.byGroup.length).toBeGreaterThan(0);
      const engEntry = result.byGroup.find((g: any) => g.key === 'Engineering');
      expect(engEntry).toBeDefined();
      expect(engEntry.key).toBe('Engineering');
      expect(engEntry.terminations).toBe(1);
      // No undefined keys
      expect(result.byGroup.every((g: any) => g.key !== undefined)).toBe(true);
    });

    // -----------------------------------------------------------------------
    // A-6: attrition site groupBy reads site.name from relation
    // -----------------------------------------------------------------------
    it('A-6: site groupBy groups by site.name not raw site string', async () => {
      db.employee.findMany
        .mockResolvedValueOnce([
          { id: 'e4', status: 'TERMINATED', endDate: new Date('2024-06-15'), employmentType: 'FULL_TIME',
            startDate: new Date('2021-01-01'), department: { name: 'Engineering' }, site: { name: 'NYC' } },
        ])
        .mockResolvedValueOnce([
          { id: 'e1', status: 'ACTIVE', startDate: new Date('2022-01-01'), endDate: null,
            department: { name: 'Engineering' }, site: { name: 'NYC' } },
          { id: 'e4', status: 'TERMINATED', startDate: new Date('2021-01-01'), endDate: new Date('2024-06-15'),
            department: { name: 'Engineering' }, site: { name: 'NYC' } },
        ]);

      const result = await createCaller(makeCtx()).attrition({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        groupBy: 'site',
      });

      expect(result.byGroup[0].key).toBe('NYC');
      expect(result.byGroup.every((g: any) => g.key !== undefined)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // A-7 through A-10: headcountOverTime
  // -----------------------------------------------------------------------
  describe('headcountOverTime', () => {
    it('A-7: returns one entry per month in range with correct headcount', async () => {
      db.employee.findMany.mockResolvedValue([
        { id: 'e1', startDate: new Date('2024-01-15'), endDate: null },
        { id: 'e2', startDate: new Date('2024-02-01'), endDate: null },
        { id: 'e3', startDate: new Date('2024-03-01'), endDate: new Date('2024-04-30') },
      ]);

      const result = await createCaller(makeCtx()).headcountOverTime({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31'),
      });

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ month: '2024-01', count: 1 });
      expect(result[1]).toEqual({ month: '2024-02', count: 2 });
      expect(result[2]).toEqual({ month: '2024-03', count: 3 });
      result.forEach((entry: any) => {
        expect(typeof entry.month).toBe('string');
        expect(typeof entry.count).toBe('number');
      });
    });

    it('A-8: excludes employees who terminated before the month', async () => {
      db.employee.findMany.mockResolvedValue([
        { id: 'e1', startDate: new Date('2023-06-01'), endDate: new Date('2023-12-31') },
        { id: 'e2', startDate: new Date('2023-06-01'), endDate: null },
      ]);

      const result = await createCaller(makeCtx()).headcountOverTime({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-28'),
      });

      expect(result[0].count).toBe(1); // only e2 active in Jan 2024
      expect(result[1].count).toBe(1); // only e2 active in Feb 2024
    });

    it('A-9: excludes employees whose startDate is after the month end', async () => {
      db.employee.findMany.mockResolvedValue([
        { id: 'e1', startDate: new Date('2024-03-01'), endDate: null },
      ]);

      const result = await createCaller(makeCtx()).headcountOverTime({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-28'),
      });

      expect(result[0].count).toBe(0); // e1 hasn't started yet in Jan
      expect(result[1].count).toBe(0); // e1 hasn't started yet in Feb
    });

    it('A-10: throws BAD_REQUEST when range exceeds 24 months', async () => {
      await expect(
        createCaller(makeCtx()).headcountOverTime({
          startDate: new Date('2022-01-01'),
          endDate: new Date('2024-02-01'), // 25 months
        })
      ).rejects.toThrow(TRPCError);

      // DB should NOT be called
      expect(db.employee.findMany).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // A-11 through A-13: timeToHire
  // -----------------------------------------------------------------------
  describe('timeToHire', () => {
    it('A-11: returns monthly avgDays and hires for HIRED candidates', async () => {
      db.candidate.findMany.mockResolvedValue([
        {
          id: 'c1', stage: 'HIRED',
          createdAt: new Date('2024-03-01'),
          updatedAt: new Date('2024-03-16'), // 15 days
          job: { companyId: 'co-1' },
        },
        {
          id: 'c2', stage: 'HIRED',
          createdAt: new Date('2024-03-05'),
          updatedAt: new Date('2024-03-20'), // 15 days
          job: { companyId: 'co-1' },
        },
      ]);

      const result = await createCaller(makeCtx()).timeToHire({
        startDate: new Date('2024-03-01'),
        endDate: new Date('2024-03-31'),
      });

      expect(result).toHaveLength(1);
      expect(result[0].month).toBe('2024-03');
      expect(result[0].hires).toBe(2);
      expect(result[0].avgDays).toBeCloseTo(15, 0);
      result.forEach((entry: any) => {
        expect(typeof entry.month).toBe('string');
        expect(typeof entry.avgDays).toBe('number');
        expect(typeof entry.hires).toBe('number');
      });
    });

    it('A-12: candidates from other companies are excluded via query filter', async () => {
      // Return candidates from co-2 only - but query should filter to co-1
      // We verify the DB was called with company filter
      db.candidate.findMany.mockResolvedValue([]);

      await createCaller(makeCtx()).timeToHire({
        startDate: new Date('2024-03-01'),
        endDate: new Date('2024-03-31'),
      });

      expect(db.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            job: expect.objectContaining({ companyId: 'co-1' }),
          }),
        })
      );
    });

    it('A-13: returns empty array when no HIRED candidates in range', async () => {
      db.candidate.findMany.mockResolvedValue([]);

      const result = await createCaller(makeCtx()).timeToHire({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31'),
      });

      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // A-14: diversity does not crash and does not reference jobTitle
  // -----------------------------------------------------------------------
  describe('diversity', () => {
    it('A-14: returns without error and omits jobTitle references', async () => {
      db.employee.findMany.mockResolvedValue([
        { id: 'e1', employmentType: 'FULL_TIME', startDate: new Date('2024-01-10'), endDate: null,
          department: { name: 'Engineering' } },
        { id: 'e2', employmentType: 'PART_TIME', startDate: new Date('2024-02-01'), endDate: null,
          department: { name: 'Sales' } },
      ]);

      const result = await createCaller(makeCtx()).diversity({ year: 2024 });

      expect(result.totalEmployees).toBe(2);
      expect(result.leadership).toBeNull();
      expect(result.gender).toBeNull();
      expect(result.byDepartment).toBeDefined();
      const deptKeys = Object.keys(result.byDepartment);
      expect(deptKeys).toContain('Engineering');
      expect(deptKeys).toContain('Sales');
      expect(deptKeys.every((k) => k !== undefined && k !== 'Unassigned')).toBe(true);
    });
  });
});
