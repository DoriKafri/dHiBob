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

export const payrollRouter = router({
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

  getSummary: protectedProcedure.query(async ({ ctx }) => {
    const payRuns = await ctx.db.payRun.findMany({
      where: { companyId: ctx.user.companyId },
      orderBy: { periodStart: 'desc' },
    });

    const currentYear = new Date().getFullYear();
    const completedThisYear = payRuns.filter(
      (r: any) => r.status === 'COMPLETED' && new Date(r.periodStart).getFullYear() === currentYear
    );
    const totalPayrollYTD = completedThisYear.reduce((sum: number, r: any) => sum + r.totalAmount, 0);

    const lastCompleted = payRuns.find((r: any) => r.status === 'COMPLETED');
    const employeeCount = lastCompleted?.employeeCount ?? 0;

    let nextRunDate: Date | null = null;
    if (lastCompleted) {
      const next = new Date(lastCompleted.periodEnd);
      next.setDate(next.getDate() + 1);
      nextRunDate = next;
    }

    const pendingCount = payRuns.filter((r: any) => r.status === 'PENDING').length;

    return { totalPayrollYTD, employeeCount, nextRunDate, pendingCount };
  }),

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
});
