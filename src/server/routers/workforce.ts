import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const workforceRouter = router({
  // Summary stats
  summary: protectedProcedure.query(async ({ ctx }) => {
    const companyId = ctx.user.companyId;

    const [activeCount, terminatedCount, positions, departments] = await Promise.all([
      ctx.db.employee.count({ where: { companyId, status: 'ACTIVE' } }),
      ctx.db.employee.count({ where: { companyId, status: 'TERMINATED' } }),
      ctx.db.position.findMany({ where: { companyId }, include: { department: { select: { name: true } } } }),
      ctx.db.department.findMany({ where: { companyId }, select: { id: true, name: true } }),
    ]);

    const openPositions = positions.filter((p: any) => p.status === 'OPEN');
    const filledPositions = positions.filter((p: any) => p.status === 'FILLED');
    const totalBudget = positions.reduce((sum: number, p: any) => sum + (p.budgetedSalary || 0), 0);
    const filledBudget = filledPositions.reduce((sum: number, p: any) => sum + (p.budgetedSalary || 0), 0);

    return {
      headcount: activeCount,
      openPositions: openPositions.length,
      filledPositions: filledPositions.length,
      totalPositions: positions.length,
      totalBudget,
      filledBudget,
      remainingBudget: totalBudget - filledBudget,
      terminatedLast12: terminatedCount,
    };
  }),

  // Positions list
  positions: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.position.findMany({
      where: { companyId: ctx.user.companyId },
      include: {
        department: { select: { id: true, name: true } },
        site: { select: { id: true, name: true } },
        employee: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }),

  // Create position
  createPosition: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      departmentId: z.string().optional(),
      siteId: z.string().optional(),
      budgetedSalary: z.number().optional(),
      currency: z.string().optional(),
      status: z.enum(['OPEN', 'IN_PROGRESS', 'FILLED', 'CLOSED']).default('OPEN'),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.position.create({
        data: { companyId: ctx.user.companyId, ...input },
      });
    }),

  // Update position
  updatePosition: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().optional(),
      departmentId: z.string().nullable().optional(),
      siteId: z.string().nullable().optional(),
      budgetedSalary: z.number().nullable().optional(),
      currency: z.string().nullable().optional(),
      status: z.enum(['OPEN', 'IN_PROGRESS', 'FILLED', 'CLOSED']).optional(),
      employeeId: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pos = await ctx.db.position.findFirst({ where: { id: input.id, companyId: ctx.user.companyId } });
      if (!pos) throw new TRPCError({ code: 'NOT_FOUND' });
      const { id, ...data } = input;
      return ctx.db.position.update({ where: { id }, data });
    }),

  // Delete position
  deletePosition: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const pos = await ctx.db.position.findFirst({ where: { id: input.id, companyId: ctx.user.companyId } });
      if (!pos) throw new TRPCError({ code: 'NOT_FOUND' });
      return ctx.db.position.delete({ where: { id: input.id } });
    }),

  // Department breakdown (headcount, open positions, budget per department)
  departmentBreakdown: protectedProcedure.query(async ({ ctx }) => {
    const companyId = ctx.user.companyId;

    const [employees, positions, departments] = await Promise.all([
      ctx.db.employee.findMany({
        where: { companyId, status: 'ACTIVE' },
        select: { departmentId: true },
      }),
      ctx.db.position.findMany({
        where: { companyId },
        select: { departmentId: true, status: true, budgetedSalary: true },
      }),
      ctx.db.department.findMany({ where: { companyId }, select: { id: true, name: true } }),
    ]);

    const deptMap = new Map<string, { name: string; headcount: number; openPositions: number; filledPositions: number; budget: number }>();
    for (const dept of departments) {
      deptMap.set(dept.id, { name: dept.name, headcount: 0, openPositions: 0, filledPositions: 0, budget: 0 });
    }

    for (const emp of employees) {
      if (emp.departmentId && deptMap.has(emp.departmentId)) {
        deptMap.get(emp.departmentId)!.headcount += 1;
      }
    }

    for (const pos of positions) {
      if (pos.departmentId && deptMap.has(pos.departmentId)) {
        const d = deptMap.get(pos.departmentId)!;
        if (pos.status === 'OPEN' || pos.status === 'IN_PROGRESS') d.openPositions += 1;
        if (pos.status === 'FILLED') d.filledPositions += 1;
        d.budget += pos.budgetedSalary || 0;
      }
    }

    return Array.from(deptMap.values()).sort((a, b) => b.headcount - a.headcount);
  }),

  // Headcount forecast (next 12 months based on open positions fill rate)
  headcountForecast: protectedProcedure.query(async ({ ctx }) => {
    const companyId = ctx.user.companyId;
    const activeCount = await ctx.db.employee.count({ where: { companyId, status: 'ACTIVE' } });
    const openPositions = await ctx.db.position.count({ where: { companyId, status: { in: ['OPEN', 'IN_PROGRESS'] } } });

    const now = new Date();
    const months: Array<{ month: string; projected: number; current: number }> = [];

    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      // Assume ~2 positions filled per month
      const filledByMonth = Math.min(i * 2, openPositions);
      months.push({
        month: label,
        current: activeCount,
        projected: activeCount + filledByMonth,
      });
    }

    return months;
  }),

  // Departments list (for dropdowns)
  departments: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.department.findMany({
      where: { companyId: ctx.user.companyId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }),

  // Sites list (for dropdowns)
  sites: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.site.findMany({
      where: { companyId: ctx.user.companyId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }),
});
